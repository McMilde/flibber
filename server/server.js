// Pipeslipp – liten server for Mack julebrus-spillet.
// Toppliste (topp 10) lagret i SQLite. I drift ligger spillet på GitHub Pages (flibber.no)
// og denne serveren på Railway. Lokalt serverer den også spillfilene fra mappen over.
// Ingen eksterne pakker: bruker kun det som følger med Node 24.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { rensNavn, erStyggtNavn } from './lib/navnefilter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5180);
// Railway-tjenesten har DB_PATH=/data/highscore.db fra gamle FLIBBER; vi bruker samme mappe (varig volum)
const DATA_DIR = process.env.DATA_DIR
  || (process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : path.join(__dirname, 'data'));
const PUBLIC_DIR = path.join(__dirname, '..');
let HEMMELIG = process.env.SPILL_HEMMELIGHET || crypto.randomBytes(32).toString('hex');

// Nettsider som får lov til å snakke med topplisten
const TILLATTE_OPPRINNELSER = new Set([
  'https://flibber.no', 'https://www.flibber.no',
  'http://localhost:5180', 'http://127.0.0.1:5180',
]);

// Grenser for hva som regnes som et realistisk resultat
const MAKS_POENG_PER_SEKUND = 2.5; // en perfekt testrobot klarer ca. 2 per sekund
const MAKS_RUNDETID_MS = 30 * 60 * 1000; // en runde kan ikke vare over 30 minutter
const NAVNEFRIST_MS = 15 * 60 * 1000;    // man har 15 min på å skrive navn

export function lagDatabase(fil) {
  fs.mkdirSync(path.dirname(fil), { recursive: true });
  const db = new DatabaseSync(fil);
  db.exec(`
    CREATE TABLE IF NOT EXISTS resultater (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poeng INTEGER NOT NULL,
      navn TEXT,
      redigeringsnokkel TEXT NOT NULL,
      opprettet INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_poeng ON resultater (poeng DESC, opprettet ASC);
    CREATE TABLE IF NOT EXISTS brukte_billetter (billett TEXT PRIMARY KEY, brukt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS innstillinger (nokkel TEXT PRIMARY KEY, verdi TEXT NOT NULL);
  `);
  return db;
}

// Hemmeligheten for billettene lagres i databasen, så den overlever omstarter uten ekstra oppsett
export function hentHemmelighet(db) {
  if (process.env.SPILL_HEMMELIGHET) return process.env.SPILL_HEMMELIGHET;
  const rad = db.prepare("SELECT verdi FROM innstillinger WHERE nokkel = 'hemmelighet'").get();
  if (rad) return rad.verdi;
  const ny = crypto.randomBytes(32).toString('hex');
  db.prepare("INSERT INTO innstillinger (nokkel, verdi) VALUES ('hemmelighet', ?)").run(ny);
  return ny;
}

// ---------- Billett: beviser at en runde faktisk ble startet ----------
function signer(data) {
  return crypto.createHmac('sha256', HEMMELIG).update(data).digest('base64url');
}
export function lagBillett(nå = Date.now()) {
  const data = `${nå}.${crypto.randomBytes(8).toString('base64url')}`;
  return `${data}.${signer(data)}`;
}
export function sjekkBillett(billett, nå = Date.now()) {
  if (typeof billett !== 'string') return null;
  const deler = billett.split('.');
  if (deler.length !== 3) return null;
  const data = `${deler[0]}.${deler[1]}`;
  const forventet = signer(data);
  if (deler[2].length !== forventet.length ||
      !crypto.timingSafeEqual(Buffer.from(deler[2]), Buffer.from(forventet))) return null;
  const start = Number(deler[0]);
  const varighet = nå - start;
  if (!Number.isFinite(start) || varighet < 0 || varighet > MAKS_RUNDETID_MS) return null;
  return { start, varighet };
}

export function erRealistisk(poeng, varighetMs) {
  if (!Number.isInteger(poeng) || poeng < 0 || poeng > 100000) return false;
  return poeng <= Math.floor((varighetMs / 1000) * MAKS_POENG_PER_SEKUND) + 3;
}

// ---------- Toppliste ----------
export function hentToppliste(db) {
  return db.prepare(
    `SELECT id, poeng, COALESCE(navn, '') AS navn FROM resultater
     WHERE poeng > 0 ORDER BY poeng DESC, opprettet ASC LIMIT 10`
  ).all().map(r => ({ id: r.id, poeng: r.poeng, navn: r.navn || 'Anonym nisse' }));
}

function plassering(db, id) {
  const rad = db.prepare('SELECT poeng, opprettet FROM resultater WHERE id = ?').get(id);
  const foran = db.prepare(
    `SELECT COUNT(*) AS n FROM resultater
     WHERE poeng > ? OR (poeng = ? AND opprettet < ?)`
  ).get(rad.poeng, rad.poeng, rad.opprettet);
  return foran.n + 1;
}

export function lagreResultat(db, { billett, poeng }, nå = Date.now()) {
  const b = sjekkBillett(billett, nå);
  if (!b) return { status: 400, svar: { feil: 'Runden kunne ikke bekreftes. Spill en ny runde.' } };
  const brukt = db.prepare('SELECT 1 FROM brukte_billetter WHERE billett = ?').get(billett);
  if (brukt) return { status: 409, svar: { feil: 'Denne runden er allerede lagret.' } };
  if (!erRealistisk(poeng, b.varighet)) {
    return { status: 400, svar: { feil: 'Poengsummen ser ikke riktig ut.' } };
  }
  db.prepare('INSERT INTO brukte_billetter (billett, brukt) VALUES (?, ?)').run(billett, nå);
  const nokkel = crypto.randomBytes(16).toString('base64url');
  const res = db.prepare(
    'INSERT INTO resultater (poeng, redigeringsnokkel, opprettet) VALUES (?, ?, ?)'
  ).run(poeng, nokkel, nå);
  const id = Number(res.lastInsertRowid);
  const plass = plassering(db, id);
  return {
    status: 200,
    svar: { id, plass, iTopp10: poeng > 0 && plass <= 10, nokkel, toppliste: hentToppliste(db) },
  };
}

export function settNavn(db, { id, nokkel, navn }, nå = Date.now()) {
  const rad = db.prepare('SELECT redigeringsnokkel, opprettet FROM resultater WHERE id = ?').get(Number(id));
  if (!rad || typeof nokkel !== 'string' || rad.redigeringsnokkel !== nokkel) {
    return { status: 403, svar: { feil: 'Navnet kan ikke lagres på dette resultatet.' } };
  }
  if (nå - rad.opprettet > NAVNEFRIST_MS) {
    return { status: 403, svar: { feil: 'Fristen for å skrive navn har gått ut.' } };
  }
  const rent = rensNavn(navn);
  if (rent && erStyggtNavn(rent)) {
    return { status: 422, svar: { feil: 'Det navnet kan vi ikke vise. Prøv et annet.' } };
  }
  db.prepare('UPDATE resultater SET navn = ? WHERE id = ?').run(rent || null, Number(id));
  return { status: 200, svar: { toppliste: hentToppliste(db) } };
}

// ---------- Enkel begrensning per IP (mot spamming) ----------
const treff = new Map();
function forMangeForespørsler(ip, grense = 60, vinduMs = 10 * 60 * 1000) {
  const nå = Date.now();
  const liste = (treff.get(ip) || []).filter(t => nå - t < vinduMs);
  liste.push(nå);
  treff.set(ip, liste);
  if (treff.size > 5000) {
    // Fjern de eldste oppføringene i stedet for å tømme alt
    for (const nøkkel of [...treff.keys()].slice(0, 1000)) treff.delete(nøkkel);
  }
  return liste.length > grense;
}

// ---------- HTTP ----------
const TYPER = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.json': 'application/json', '.webp': 'image/webp',
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function lesKropp(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', d => { data += d; if (data.length > 4096) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

function serverFil(req, res) {
  const url = new URL(req.url, 'http://x');
  let fil = decodeURIComponent(url.pathname);
  if (fil === '/') fil = '/index.html';
  const full = path.normalize(path.join(PUBLIC_DIR, fil));
  // Bare spillets egne filer kan hentes (fast liste). Alt annet, som serverkode, database
  // og andre filer på maskinen, avvises uansett hvordan adressen er skrevet.
  const relativ = path.relative(PUBLIC_DIR, full).split(path.sep).join('/');
  if (!/^(index\.html|game\.js|style\.css|img\/[a-z0-9-]+\.png)$/.test(relativ)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Fant ikke siden');
  }
  fs.readFile(full, (err, innhold) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Fant ikke siden'); }
    const ext = path.extname(full);
    res.writeHead(200, {
      'Content-Type': TYPER[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.png' ? 'public, max-age=86400' : 'no-cache',
    });
    res.end(innhold);
  });
}

export function lagServer(db) {
  return http.createServer(async (req, res) => {
    // Spillet skal kunne bygges inn (iframe) på mack.no og andre sider
    res.setHeader('Content-Security-Policy', 'frame-ancestors *');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const opphav = req.headers.origin;
    if (opphav && TILLATTE_OPPRINNELSER.has(opphav)) {
      res.setHeader('Access-Control-Allow-Origin', opphav);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const url = new URL(req.url, 'http://x');
    // Bak Railway legger proxyen den ekte adressen sist i X-Forwarded-For; første verdi kan forfalskes
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',').pop().trim();
    try {
      if (url.pathname === '/api/toppliste' && req.method === 'GET') {
        return sendJson(res, 200, { toppliste: hentToppliste(db) });
      }
      if (url.pathname.startsWith('/api/') && req.method === 'POST') {
        if (forMangeForespørsler(ip)) return sendJson(res, 429, { feil: 'For mange forsøk. Vent litt og prøv igjen.' });
        if (url.pathname === '/api/start') return sendJson(res, 200, { billett: lagBillett() });
        const kropp = await lesKropp(req);
        if (!kropp) return sendJson(res, 400, { feil: 'Ugyldig forespørsel.' });
        if (url.pathname === '/api/resultat') {
          const r = lagreResultat(db, kropp); return sendJson(res, r.status, r.svar);
        }
        if (url.pathname === '/api/navn') {
          const r = settNavn(db, kropp); return sendJson(res, r.status, r.svar);
        }
      }
      if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { feil: 'Ukjent adresse.' });
      if (url.pathname === '/helse') return sendJson(res, 200, { ok: true });
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      return serverFil(req, res);
    } catch (e) {
      console.error(e);
      return sendJson(res, 500, { feil: 'Noe gikk galt på serveren.' });
    }
  });
}

// Start bare når filen kjøres direkte (ikke i tester)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = lagDatabase(path.join(DATA_DIR, 'toppliste.db'));
  HEMMELIG = hentHemmelighet(db);
  lagServer(db).listen(PORT, () => console.log(`Pipeslipp kjører på http://localhost:${PORT}`));
}
