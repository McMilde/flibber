// Pipeslipp – Mack julebrus-spill
// Sleden står stille på skjermen, husene ruller forbi under. Trykk for å slippe en julebrus.

const KART_URL = 'https://app.powerbi.com/view?r=eyJrIjoiOGZhZjgwODgtMzhhYi00NmU3LTg4OTgtNmQzNWY5ZTUzNjNkIiwidCI6ImE0MTBmOTQ5LTNhOTMtNGU4OS04NTBjLWQ5MDFiNzNkZjAxZSIsImMiOjh9&pageName=ReportSection';

// Lokalt serverer Node-serveren både spill og toppliste. På flibber.no (GitHub Pages) ligger topplisten på Railway.
const API = ['localhost', '127.0.0.1'].includes(location.hostname) ? '' : 'https://flibber-production.up.railway.app/';

const PRODUKTER = [
  { id: 'mack-god-05', navn: 'Mack God Julebrus', h: 9.5 },
  { id: 'mack-lett-05', navn: 'Mack Lett Julebrus', h: 9.5 },
  { id: 'mack-lett-boks', navn: 'Mack Lett Julebrus boks', h: 7, boks: true },
  { id: 'trio-05', navn: 'Trio Jule-Brus', h: 9.5 },
  { id: 'trio-15', navn: 'Trio Jule-Brus 1,5 l', h: 12, stor: true },
  { id: 'trio-light-05', navn: 'Trio Jule-Brus Light', h: 9.5 },
  { id: 'trio-light-15', navn: 'Trio Jule-Brus Light 1,5 l', h: 12, stor: true },
];

// ---------- Spillkonstanter (enhet: 1 = 1 % av skjermhøyden) ----------
const BAKKE = 91;
const SLEDE_Y = 19;
const TYNGDE = 170;
const START_FART = 21;
const MAKS_FART = 52;
const LIV = 3;
const SLIPP_PAUSE = 0.3; // sekunder mellom hver flaske

const HUSFARGER = [
  { vegg: '#9E2A2B', kant: '#7A1E20' },  // rød
  { vegg: '#D49A36', kant: '#A8761F' },  // oker
  { vegg: '#E6E1D3', kant: '#B9B3A2' },  // hvit
  { vegg: '#2F6E8E', kant: '#22536C' },  // petrol
  { vegg: '#5E7D4E', kant: '#475F3A' },  // grønn
];

const lerret = document.getElementById('spill');
const ctx = lerret.getContext('2d');
const $ = (id) => document.getElementById(id);
const reduserBevegelse = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Bilder ----------
const bilder = {};
for (const p of PRODUKTER) {
  const img = new Image();
  img.src = `img/${p.id}.png`;
  bilder[p.id] = img;
  p.img = img;
}

// ---------- Lagring i nettleseren (kan mangle) ----------
const lagret = {
  hent(k, standard) { try { const v = localStorage.getItem(k); return v === null ? standard : JSON.parse(v); } catch { return standard; } },
  sett(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignorer */ } },
};

// ---------- Lyd (lages i nettleseren, ingen lydfiler) ----------
let lydPå = lagret.hent('pipeslipp-lyd', true);
let lydctx = null;
function lyd(type) {
  if (!lydPå) return;
  try {
    lydctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (lydctx.state === 'suspended') lydctx.resume();
    const t = lydctx.currentTime;
    const tone = (frekv, start, varighet, volum, form = 'sine') => {
      const o = lydctx.createOscillator();
      const g = lydctx.createGain();
      o.type = form;
      o.frequency.setValueAtTime(frekv, t + start);
      g.gain.setValueAtTime(0.0001, t + start);
      g.gain.exponentialRampToValueAtTime(volum, t + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + varighet);
      o.connect(g).connect(lydctx.destination);
      o.start(t + start);
      o.stop(t + start + varighet + 0.05);
      return o;
    };
    if (type === 'slipp') {
      const o = tone(700, 0, 0.18, 0.05, 'triangle');
      o.frequency.exponentialRampToValueAtTime(260, t + 0.18);
    } else if (type === 'treff') {
      tone(1318, 0, 0.5, 0.12); tone(1976, 0, 0.35, 0.05); tone(2637, 0.04, 0.25, 0.03);
    } else if (type === 'perfekt') {
      [1046, 1318, 1568, 2093].forEach((f, i) => tone(f, i * 0.06, 0.4, 0.09));
    } else if (type === 'bom') {
      const o = tone(180, 0, 0.3, 0.18, 'square');
      o.frequency.exponentialRampToValueAtTime(60, t + 0.3);
    } else if (type === 'slutt') {
      [784, 659, 523].forEach((f, i) => tone(f, i * 0.16, 0.4, 0.08, 'triangle'));
    }
  } catch { /* lyd er ikke viktig */ }
}

// ---------- Størrelse ----------
let B = 0, H = 0, U = 1, VB = 100; // bredde/høyde i px, U = px per enhet, VB = bredde i enheter
function tilpass() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  B = window.innerWidth;
  H = window.innerHeight;
  lerret.width = Math.round(B * dpr);
  lerret.height = Math.round(H * dpr);
  U = H / 100;
  VB = B / U;
  ctx.setTransform(dpr * U, 0, 0, dpr * U, 0, 0);
  lagStjerner();
}
window.addEventListener('resize', tilpass);

const sledeX = () => Math.min(Math.max(VB * 0.27, 16), 48);

// ---------- Bakgrunn ----------
let stjerner = [];
function lagStjerner() {
  stjerner = Array.from({ length: Math.round(VB * 0.9) }, () => ({
    x: Math.random() * VB, y: Math.random() * 60, r: Math.random() * 0.22 + 0.06, f: Math.random() * 6,
  }));
}
const snø = Array.from({ length: 70 }, () => ({
  x: Math.random() * 200, y: Math.random() * 100, r: Math.random() * 0.35 + 0.12, v: Math.random() * 4 + 3, s: Math.random() * 6,
}));

function fjellY(x, lag) {
  // Taggete nordnorske fjell, bygget av noen få bølger
  if (lag === 0) return 62 - 9 * Math.sin(x * 0.045) - 6 * Math.sin(x * 0.11 + 1.3) - 3.5 * Math.abs(Math.sin(x * 0.23));
  return 74 - 6 * Math.sin(x * 0.07 + 2) - 4 * Math.sin(x * 0.17) - 2 * Math.abs(Math.sin(x * 0.41 + 0.5));
}

function tegnHimmel(tid, avstand) {
  const g = ctx.createLinearGradient(0, 0, 0, 100);
  g.addColorStop(0, '#061322');
  g.addColorStop(0.55, '#0F2B45');
  g.addColorStop(1, '#1B4664');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VB, 100);

  for (const s of stjerner) {
    ctx.globalAlpha = 0.45 + 0.4 * Math.sin(tid * 1.6 + s.f);
    ctx.fillStyle = '#F3F7FA';
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Nordlys: tegnes i lav oppløsning og skaleres opp, slik at kantene blir myke
  tegnNordlys(reduserBevegelse ? 0 : tid);
  ctx.drawImage(nordlysLerret, 0, 0, nordlysLerret.width, nordlysLerret.height, 0, 0, VB, 55);

  // Fjell (to lag med parallakse), lysere mot toppen som snødekte fjell i måneskinn
  const lagFarger = [['#5F86A3', '#1A3D58', 44, 70], ['#88AAC2', '#143650', 62, 82]];
  for (let lag = 0; lag < 2; lag++) {
    const forskyv = avstand * (lag === 0 ? 0.12 : 0.3);
    const [lys, mørk, fra, til] = lagFarger[lag];
    const g = ctx.createLinearGradient(0, fra, 0, til);
    g.addColorStop(0, lys);
    g.addColorStop(1, mørk);
    ctx.fillStyle = g;
    ctx.globalAlpha = lag === 0 ? 0.55 : 1;
    ctx.beginPath();
    ctx.moveTo(0, 100);
    for (let x = 0; x <= VB + 2; x += 1.5) ctx.lineTo(x, fjellY(x + forskyv, lag));
    ctx.lineTo(VB, 100);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// Nordlys-lerret: 1 piksel = 1 enhet. Skaleres opp ca. 8x, som gir naturlig uskarphet.
const nordlysLerret = document.createElement('canvas');
const nctx = nordlysLerret.getContext('2d');
const BÅND = [
  { y: 30, amp: 6, farge: '107,229,176', a: 0.55, fase: 0, len: 16 },
  { y: 22, amp: 5, farge: '120,205,215', a: 0.3, fase: 2.1, len: 12 },
  { y: 14, amp: 4, farge: '170,130,225', a: 0.18, fase: 4.2, len: 9 },
];
function tegnNordlys(t) {
  const w = Math.ceil(VB) + 2;
  if (nordlysLerret.width !== w) { nordlysLerret.width = w; nordlysLerret.height = 55; }
  nctx.clearRect(0, 0, w, 55);
  nctx.globalCompositeOperation = 'lighter';
  for (const b of BÅND) {
    for (let x = 0; x < w; x++) {
      const y = b.y + b.amp * Math.sin(x * 0.035 + t * 0.22 + b.fase) + 1.8 * Math.sin(x * 0.12 - t * 0.35);
      const styrke = 0.35 + 0.65 * Math.max(0, Math.sin(x * 0.05 + t * 0.15 + b.fase * 1.7));
      const len = b.len * (0.7 + 0.3 * Math.sin(x * 0.2 + t * 0.6));
      const g = nctx.createLinearGradient(0, y - len, 0, y + 2);
      g.addColorStop(0, `rgba(${b.farge},0)`);
      g.addColorStop(0.8, `rgba(${b.farge},${b.a * styrke})`);
      g.addColorStop(1, `rgba(${b.farge},0)`);
      nctx.fillStyle = g;
      nctx.fillRect(x, y - len, 1, len + 2);
    }
  }
  nctx.globalCompositeOperation = 'source-over';
}

function tegnBakke() {
  const g = ctx.createLinearGradient(0, BAKKE, 0, 100);
  g.addColorStop(0, '#E9F1F7');
  g.addColorStop(1, '#B8CDDC');
  ctx.fillStyle = g;
  ctx.fillRect(0, BAKKE, VB, 100 - BAKKE);
}

function tegnSnø(dt) {
  ctx.fillStyle = 'rgba(243,247,250,0.85)';
  for (const f of snø) {
    if (!reduserBevegelse) {
      f.y += f.v * dt;
      f.x -= (fart * 0.25 + 1) * dt;
      f.s += dt;
    }
    if (f.y > 100) { f.y = -2; f.x = Math.random() * VB; }
    if (f.x < -2) f.x += VB + 4;
    ctx.beginPath();
    ctx.arc(f.x + Math.sin(f.s) * 0.8, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------- Hus ----------
let hus = [];
function nyttHus(x, vanskelighet) {
  const b = 15 + Math.random() * 11;
  const veggH = 11 + Math.random() * 10;
  const takH = 6 + Math.random() * 4;
  const pipeB = Math.max(4.4, 7.2 - vanskelighet * 0.07);
  const venstre = Math.random() < 0.5;
  const rel = venstre ? 0.24 + Math.random() * 0.1 : 0.66 + Math.random() * 0.1;
  const farge = HUSFARGER[Math.floor(Math.random() * HUSFARGER.length)];
  const veggTopp = BAKKE - veggH;
  const topp = veggTopp - takH;
  const vinduer = [];
  const etasjer = veggH > 16 ? 2 : 1;
  const kolonner = b > 21 ? 3 : 2;
  for (let e = 0; e < etasjer; e++) {
    for (let k = 0; k < kolonner; k++) {
      if (e === 0 && k === Math.floor(kolonner / 2) && kolonner === 3) continue; // plass til dør
      vinduer.push({ x: (k + 0.5) / kolonner, y: veggTopp + 2.4 + e * 7.2, tent: Math.random() < 0.25 });
    }
  }
  return {
    x, b, veggTopp, topp, takH, farge, vinduer,
    pipe: { rel, b: pipeB, høyde: 2.5 + Math.random() * 2.5 },
    levert: false, glød: 0, røyk: [],
  };
}
// Takhøyde (y) ved en gitt x, eller null hvis x ikke er over huset
function takY(h, x) {
  const over = 1.4;
  const midt = h.x + h.b / 2;
  const halv = h.b / 2 + over;
  if (x < h.x - over || x > h.x + h.b + over) return null;
  return h.topp + h.takH * (Math.abs(x - midt) / halv) + 0.6;
}
function pipeGeometri(h) {
  const cx = h.x + h.b * h.pipe.rel;
  const toppY = Math.min(takY(h, cx) - 4.5, h.topp - h.pipe.høyde + (Math.abs(h.pipe.rel - 0.5) * 6));
  return { cx, venstre: cx - h.pipe.b / 2, høyre: cx + h.pipe.b / 2, toppY, bunnY: takY(h, cx) + 1.5 };
}

function tegnHus(h) {
  const p = pipeGeometri(h);
  // Pipe (bak taket)
  ctx.fillStyle = '#6B3B2E';
  ctx.fillRect(p.venstre, p.toppY, h.pipe.b, p.bunnY - p.toppY);
  ctx.fillStyle = '#56291F';
  ctx.fillRect(p.venstre - 0.5, p.toppY, h.pipe.b + 1, 1.2);
  ctx.fillStyle = '#F3F7FA';
  ctx.beginPath();
  ctx.roundRect(p.venstre - 0.7, p.toppY - 0.9, h.pipe.b + 1.4, 1.2, 0.6);
  ctx.fill();
  // Pipeåpning lyser litt når huset har fått brus
  if (h.glød > 0) {
    ctx.fillStyle = `rgba(255,201,77,${0.6 * h.glød})`;
    ctx.fillRect(p.venstre + 0.6, p.toppY - 0.2, h.pipe.b - 1.2, 0.6);
  }

  // Vegg
  ctx.fillStyle = h.farge.vegg;
  ctx.fillRect(h.x, h.veggTopp, h.b, BAKKE - h.veggTopp);
  // Panel-linjer
  ctx.strokeStyle = h.farge.kant;
  ctx.lineWidth = 0.18;
  ctx.beginPath();
  for (let x = h.x + 1.6; x < h.x + h.b; x += 1.6) { ctx.moveTo(x, h.veggTopp); ctx.lineTo(x, BAKKE); }
  ctx.stroke();

  // Vinduer
  for (const v of h.vinduer) {
    const vx = h.x + v.x * h.b - 1.8;
    const lys = h.levert || v.tent;
    if (lys) {
      ctx.save();
      ctx.shadowColor = 'rgba(255,201,77,0.9)';
      ctx.shadowBlur = (h.levert ? 3 + 3 * h.glød : 1.5) * U;
      ctx.fillStyle = '#FFD36E';
      ctx.fillRect(vx, v.y, 3.6, 4.2);
      ctx.restore();
    } else {
      ctx.fillStyle = '#1C2D3E';
      ctx.fillRect(vx, v.y, 3.6, 4.2);
    }
    ctx.strokeStyle = '#F3F7FA';
    ctx.lineWidth = 0.45;
    ctx.strokeRect(vx, v.y, 3.6, 4.2);
    ctx.beginPath(); ctx.moveTo(vx + 1.8, v.y); ctx.lineTo(vx + 1.8, v.y + 4.2); ctx.moveTo(vx, v.y + 2.1); ctx.lineTo(vx + 3.6, v.y + 2.1); ctx.stroke();
  }
  // Dør
  const dørX = h.x + h.b / 2 - 1.7;
  ctx.fillStyle = '#3A2418';
  ctx.fillRect(dørX, BAKKE - 6, 3.4, 6);
  if (h.levert) { ctx.fillStyle = '#3E9B4F'; ctx.beginPath(); ctx.arc(dørX + 1.7, BAKKE - 4.3, 0.9, 0, Math.PI * 2); ctx.fill(); }

  // Tak
  const over = 1.4;
  ctx.fillStyle = '#2B2F36';
  ctx.beginPath();
  ctx.moveTo(h.x - over, h.veggTopp + 0.6);
  ctx.lineTo(h.x + h.b / 2, h.topp);
  ctx.lineTo(h.x + h.b + over, h.veggTopp + 0.6);
  ctx.closePath();
  ctx.fill();
  // Snø på taket
  ctx.fillStyle = '#F3F7FA';
  ctx.beginPath();
  ctx.moveTo(h.x - over - 0.3, h.veggTopp + 0.8);
  ctx.lineTo(h.x + h.b / 2, h.topp - 1.3);
  ctx.lineTo(h.x + h.b + over + 0.3, h.veggTopp + 0.8);
  ctx.lineTo(h.x + h.b + over - 1.2, h.veggTopp + 0.2);
  ctx.lineTo(h.x + h.b / 2, h.topp + 1.2);
  ctx.lineTo(h.x - over + 1.2, h.veggTopp + 0.2);
  ctx.closePath();
  ctx.fill();

  // Røyk
  for (const r of h.røyk) {
    if (r.t < 0) continue;
    ctx.fillStyle = `rgba(230,238,245,${0.55 * (1 - r.t / r.liv)})`;
    ctx.beginPath(); ctx.arc(p.cx + r.dx, p.toppY - 1 - r.t * 6, 1 + r.t * 2.2, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------- Sleden ----------
function tegnSlede(x, y, tid) {
  const vugg = Math.sin(tid * 2.4) * 0.8;
  y += vugg;
  ctx.save();
  // Reinsdyr foran (to stykker)
  for (let i = 0; i < 2; i++) {
    const rx = x + 11 + i * 8.5;
    const ry = y - 1.5 + Math.sin(tid * 2.4 + 0.6 + i * 0.5) * 0.7;
    const steg = Math.sin(tid * 9 + i * 1.7);
    ctx.strokeStyle = '#C9A24A';
    ctx.lineWidth = 0.3;
    ctx.beginPath(); ctx.moveTo(x + 4.5, y + 0.2); ctx.lineTo(rx - 1.8, ry); ctx.stroke();
    ctx.fillStyle = '#6E4A33';
    ctx.strokeStyle = '#6E4A33';
    ctx.lineWidth = 0.55;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(rx - 1.6, ry + 1); ctx.lineTo(rx - 2.4 - steg, ry + 3.6);
    ctx.moveTo(rx - 0.8, ry + 1); ctx.lineTo(rx - 0.2 + steg, ry + 3.6);
    ctx.moveTo(rx + 1.6, ry + 1); ctx.lineTo(rx + 2.4 + steg, ry + 3.4);
    ctx.moveTo(rx + 2.2, ry + 1); ctx.lineTo(rx + 2.6 - steg, ry + 3.4);
    ctx.stroke();
    ctx.beginPath(); ctx.ellipse(rx, ry, 3, 1.5, -0.08, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(rx + 2.4, ry - 0.4); ctx.lineTo(rx + 3.4, ry - 2.6); ctx.lineWidth = 0.9; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(rx + 4, ry - 2.9, 1.3, 0.8, 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#E9DCC0'; ctx.lineWidth = 0.28;
    ctx.beginPath();
    ctx.moveTo(rx + 3.4, ry - 3.4); ctx.lineTo(rx + 2.6, ry - 5.4); ctx.lineTo(rx + 1.8, ry - 5.9);
    ctx.moveTo(rx + 2.8, ry - 4.9); ctx.lineTo(rx + 3.6, ry - 5.8);
    ctx.stroke();
    if (i === 1) { ctx.fillStyle = '#E3262F'; ctx.beginPath(); ctx.arc(rx + 5.2, ry - 2.7, 0.45, 0, Math.PI * 2); ctx.fill(); }
  }
  // Nissen
  ctx.fillStyle = '#C81E28';
  ctx.beginPath(); ctx.ellipse(x - 0.5, y - 3.2, 2.4, 2.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#F6D7BE';
  ctx.beginPath(); ctx.arc(x, y - 6.6, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#F3F7FA';
  ctx.beginPath(); ctx.ellipse(x + 0.4, y - 5.2, 1.5, 1.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#C81E28';
  ctx.beginPath(); ctx.moveTo(x - 1.6, y - 7.3); ctx.quadraticCurveTo(x - 0.5, y - 10.4, x - 3.4, y - 9.6); ctx.lineTo(x + 1.6, y - 7.4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#F3F7FA';
  ctx.beginPath(); ctx.arc(x - 3.4, y - 9.5, 0.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(x - 1.8, y - 7.7, 3.6, 0.8);
  // Sekk med julebrus som stikker opp
  ctx.fillStyle = '#7A5A3A';
  ctx.beginPath(); ctx.ellipse(x - 4.6, y - 2.6, 2.8, 2.6, -0.2, 0, Math.PI * 2); ctx.fill();
  const sekkProdukt = kø[0];
  if (sekkProdukt?.img.complete) {
    const h = 4.4, w = h * sekkProdukt.img.naturalWidth / sekkProdukt.img.naturalHeight;
    ctx.drawImage(sekkProdukt.img, x - 4.8 - w / 2, y - 7.3, w, h);
  }
  // Sleden
  ctx.fillStyle = '#C81E28';
  ctx.beginPath();
  ctx.moveTo(x - 8, y - 2.5);
  ctx.lineTo(x + 4, y - 1.8);
  ctx.quadraticCurveTo(x + 6.2, y - 3.5, x + 5.8, y - 0.5);
  ctx.quadraticCurveTo(x + 5, y + 1.4, x + 1, y + 1.4);
  ctx.lineTo(x - 6.5, y + 1.4);
  ctx.quadraticCurveTo(x - 8.4, y + 0.6, x - 8, y - 2.5);
  ctx.fill();
  ctx.strokeStyle = '#FFC94D';
  ctx.lineWidth = 0.35;
  ctx.beginPath(); ctx.moveTo(x - 7, y - 0.6); ctx.quadraticCurveTo(x - 1, y + 0.2, x + 4.6, y - 0.8); ctx.stroke();
  // Meier
  ctx.strokeStyle = '#D9DEE3';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x - 7.5, y + 2.6); ctx.lineTo(x + 5, y + 2.6); ctx.quadraticCurveTo(x + 7.5, y + 2.6, x + 7, y + 0.6);
  ctx.moveTo(x - 4.5, y + 1.4); ctx.lineTo(x - 4.5, y + 2.6); ctx.moveTo(x + 2.5, y + 1.4); ctx.lineTo(x + 2.5, y + 2.6);
  ctx.stroke();
  ctx.restore();
  return y;
}

// ---------- Spilltilstand ----------
let tilstand = 'meny'; // meny | spiller | over
let fart = START_FART;
let avstand = 0;
let poeng = 0;
let liv = LIV;
let treffPåRad = 0;
let antallTreff = 0;
let flasker = [];
let partikler = [];
let tekster = [];
let sisteSlipp = -1;
let billett = null;
let rundetid = 0;
let tid = 0;
let kø = [];
let sledeYNå = SLEDE_Y;

function fyllKø() {
  while (kø.length < 3) {
    const pose = [...PRODUKTER].sort(() => Math.random() - 0.5);
    kø.push(...pose);
  }
}

function nullstillVerden() {
  fart = START_FART;
  avstand = 0;
  hus = [];
  let x = VB + 6;
  for (let i = 0; i < 6; i++) {
    const h = nyttHus(x, 0);
    hus.push(h);
    x += h.b + 7 + Math.random() * 12;
  }
  flasker = []; partikler = []; tekster = [];
  kø = []; fyllKø();
}

function startRunde() {
  nullstillVerden();
  poeng = 0; liv = LIV; treffPåRad = 0; antallTreff = 0; rundetid = 0; sisteSlipp = -1;
  tilstand = 'spiller';
  billett = null;
  fetch(API + 'api/start', { method: 'POST' })
    .then(r => r.ok ? r.json() : null)
    .then(d => { billett = d?.billett || null; })
    .catch(() => { billett = null; });
  oppdaterHud();
  visSkjerm(null);
  $('hud').hidden = false;
}

function slipp() {
  if (tilstand !== 'spiller') return;
  if (rundetid - sisteSlipp < SLIPP_PAUSE) return;
  sisteSlipp = rundetid;
  const p = kø.shift();
  fyllKø();
  const w = p.h * (p.img.naturalWidth || 110) / (p.img.naturalHeight || 360);
  flasker.push({ p, x: sledeX() - 4.8, y: sledeYNå - 5, vy: 4, vx: 0, rot: 0, vr: (Math.random() - 0.5) * 1.2, w, h: p.h, tilstand: 'faller', t: 0 });
  lyd('slipp');
  oppdaterNeste();
}

function oppdaterHud() {
  const p = $('poeng');
  p.textContent = poeng;
  const livEl = $('liv');
  livEl.innerHTML = '';
  for (let i = 0; i < LIV; i++) {
    const img = document.createElement('img');
    img.src = 'img/trio-05.png';
    img.alt = '';
    if (i >= liv) img.className = 'tapt';
    livEl.appendChild(img);
  }
  livEl.setAttribute('aria-label', `${liv} av ${LIV} liv igjen`);
  oppdaterNeste();
}
function oppdaterNeste() {
  const p = kø[0];
  if (!p) return;
  const n = $('neste');
  n.querySelector('img').src = p.img.src;
  n.querySelector('span').textContent = p.navn;
}
function pulsPoeng() {
  const p = $('poeng');
  p.textContent = poeng;
  p.classList.remove('pulse'); void p.offsetWidth; p.classList.add('pulse');
}

function sprut(x, y, farge, antall = 14) {
  for (let i = 0; i < antall; i++) {
    const v = Math.random() * Math.PI;
    const s = 8 + Math.random() * 18;
    partikler.push({ x, y, vx: Math.cos(v) * s * (Math.random() < 0.5 ? -1 : 1), vy: -Math.sin(v) * s, t: 0, liv: 0.7 + Math.random() * 0.4, r: 0.35 + Math.random() * 0.5, farge, verden: true });
  }
}
function gnister(x, y) {
  for (let i = 0; i < 18; i++) {
    const v = Math.random() * Math.PI * 2;
    const s = 6 + Math.random() * 14;
    partikler.push({ x, y, vx: Math.cos(v) * s, vy: Math.sin(v) * s - 8, t: 0, liv: 0.6 + Math.random() * 0.5, r: 0.3 + Math.random() * 0.4, farge: Math.random() < 0.5 ? '#FFC94D' : '#6BE5B0', verden: true, stjerne: true });
  }
}
function svevetekst(tekst, x, y, farge = '#FFC94D', stor = false) {
  tekster.push({ tekst, x, y, t: 0, farge, stor });
}

function treff(f, h, perfekt) {
  const p = pipeGeometri(h);
  f.tilstand = 'inne'; f.hus = h; f.dx = f.x - p.cx; f.t = 0;
  const førsteGang = !h.levert;
  h.levert = true; h.glød = 1;
  for (let i = 0; i < 4; i++) h.røyk.push({ t: -i * 0.18, liv: 1.4, dx: (Math.random() - 0.5) * 1.5 });
  if (!førsteGang) {
    svevetekst('Har fått!', p.cx, p.toppY - 4, '#B9CCDB');
    lyd('treff');
    return;
  }
  treffPåRad++;
  antallTreff++;
  const gevinst = perfekt ? 2 : 1;
  poeng += gevinst;
  fart = Math.min(MAKS_FART, START_FART + antallTreff * 0.7);
  if (perfekt) {
    svevetekst('Perfekt! +2', p.cx, p.toppY - 4, '#6BE5B0', true);
    gnister(p.cx, p.toppY);
    lyd('perfekt');
  } else {
    svevetekst('+1', p.cx, p.toppY - 4);
    lyd('treff');
  }
  if (treffPåRad > 0 && treffPåRad % 5 === 0) {
    tekster.push({ tekst: `${treffPåRad} på rad!`, x: VB / 2, y: 42, t: 0, farge: '#F3F7FA', stor: true, fast: true });
  }
  pulsPoeng();
}

function bom(f, x, y) {
  f.tilstand = 'knust'; f.t = 0;
  f.vy = -14; f.vx = -fart * 0.3; f.vr = (Math.random() < 0.5 ? -1 : 1) * 8;
  f.y = y - f.h / 2;
  sprut(x, y, f.p.id.startsWith('trio') ? '#FF7A1A' : '#E8323C');
  svevetekst('Bom!', x, y - 6, '#FF8A8F');
  treffPåRad = 0;
  liv--;
  lyd('bom');
  oppdaterHud();
  if (navigator.vibrate) { try { navigator.vibrate(60); } catch { /* ok */ } }
  if (liv <= 0) setTimeout(sluttRunde, 900);
}

// ---------- Oppdatering ----------
function oppdater(dt) {
  tid += dt;
  const iSpill = tilstand === 'spiller';
  const verdenFart = tilstand === 'meny' ? 16 : (tilstand === 'over' ? fart * 0.4 : fart);
  if (iSpill) rundetid += dt;
  avstand += verdenFart * dt;

  for (const h of hus) {
    h.x -= verdenFart * dt;
    h.glød = Math.max(0, h.glød - dt * 0.8);
    for (const r of h.røyk) r.t += dt;
    h.røyk = h.røyk.filter(r => r.t < r.liv);
  }
  hus = hus.filter(h => h.x + h.b > -10);
  let siste = hus[hus.length - 1];
  while (!siste || siste.x + siste.b < VB + 30) {
    const start = siste ? siste.x + siste.b + 6 + Math.random() * (10 + fart * 0.15) : VB + 4;
    siste = nyttHus(start, poeng);
    hus.push(siste);
  }

  for (const f of flasker) {
    f.t += dt;
    if (f.tilstand === 'faller') {
      const forrigeBunn = f.y + f.h / 2;
      f.vy += TYNGDE * dt;
      f.y += f.vy * dt;
      f.rot += f.vr * dt;
      const bunn = f.y + f.h / 2;
      let ferdig = false;
      for (const h of hus) {
        const p = pipeGeometri(h);
        if (forrigeBunn <= p.toppY && bunn >= p.toppY && f.x >= p.venstre && f.x <= p.høyre) {
          const perfekt = Math.abs(f.x - p.cx) <= h.pipe.b * 0.2;
          treff(f, h, perfekt);
          ferdig = true;
          break;
        }
      }
      if (ferdig) continue;
      // Traff taket eller bakken?
      for (const h of hus) {
        const ty = takY(h, f.x);
        if (ty !== null && bunn >= ty) {
          // Treff på siden av pipa teller også som bom
          bom(f, f.x, ty); ferdig = true; break;
        }
      }
      if (!ferdig && bunn >= BAKKE) bom(f, f.x, BAKKE);
    } else if (f.tilstand === 'inne') {
      const p = pipeGeometri(f.hus);
      f.x = p.cx + f.dx * (1 - Math.min(1, f.t * 6));
      f.y += 30 * dt;
      f.rot *= 0.8;
    } else if (f.tilstand === 'knust') {
      f.vy += TYNGDE * 0.6 * dt;
      f.x += (f.vx - verdenFart) * dt;
      f.y += f.vy * dt;
      f.rot += f.vr * dt;
    }
  }
  flasker = flasker.filter(f => (f.tilstand === 'faller') || (f.tilstand === 'inne' && f.t < 0.4) || (f.tilstand === 'knust' && f.t < 0.9));

  for (const p of partikler) {
    p.t += dt;
    p.vy += 40 * dt;
    p.x += (p.vx - (p.verden ? verdenFart : 0)) * dt;
    p.y += p.vy * dt;
  }
  partikler = partikler.filter(p => p.t < p.liv);
  for (const t of tekster) {
    t.t += dt; t.y -= 7 * dt;
    if (!t.fast) t.x -= verdenFart * 0.3 * dt;
    t.x = Math.min(Math.max(t.x, 16), VB - 16); // hold teksten innenfor skjermen
  }
  tekster = tekster.filter(t => t.t < 1.1);
}

// ---------- Tegning ----------
function tegn(dt) {
  tegnHimmel(tid, avstand);
  tegnBakke();
  // Spor i snøen
  ctx.strokeStyle = 'rgba(140,170,195,0.5)';
  ctx.lineWidth = 0.3;
  ctx.setLineDash([2, 3]);
  ctx.lineDashOffset = avstand;
  ctx.beginPath(); ctx.moveTo(0, BAKKE + 4); ctx.lineTo(VB, BAKKE + 4); ctx.stroke();
  ctx.setLineDash([]);

  for (const h of hus) if (h.x < VB + 4 && h.x + h.b > -4) tegnHus(h);

  // Flasker
  for (const f of flasker) {
    if (!f.p.img.complete) continue;
    ctx.save();
    if (f.tilstand === 'inne') {
      // Klipp bort det som er nede i pipa
      const p = pipeGeometri(f.hus);
      ctx.beginPath(); ctx.rect(p.venstre - 10, -10, f.hus.pipe.b + 20, p.toppY + 10); ctx.clip();
    }
    if (f.tilstand === 'knust') ctx.globalAlpha = Math.max(0, 1 - f.t / 0.9);
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot);
    ctx.drawImage(f.p.img, -f.w / 2, -f.h / 2, f.w, f.h);
    ctx.restore();
  }

  // Siktelinje: svak stiplet linje rett ned fra sekken (bare de første sekundene)
  if (tilstand === 'spiller' && rundetid < 6) {
    ctx.save();
    ctx.globalAlpha = 0.35 * (1 - rundetid / 6);
    ctx.strokeStyle = '#F3F7FA';
    ctx.lineWidth = 0.25;
    ctx.setLineDash([1, 1.5]);
    ctx.beginPath(); ctx.moveTo(sledeX() - 4.8, sledeYNå + 4); ctx.lineTo(sledeX() - 4.8, BAKKE); ctx.stroke();
    ctx.restore();
  }

  sledeYNå = tegnSlede(sledeX(), SLEDE_Y, tid);

  // Partikler
  for (const p of partikler) {
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.liv);
    ctx.fillStyle = p.farge;
    ctx.beginPath();
    if (p.stjerne) {
      const r = p.r * 1.6;
      ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r * 0.3, p.y - r * 0.3); ctx.lineTo(p.x + r, p.y); ctx.lineTo(p.x + r * 0.3, p.y + r * 0.3);
      ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - r * 0.3, p.y + r * 0.3); ctx.lineTo(p.x - r, p.y); ctx.lineTo(p.x - r * 0.3, p.y - r * 0.3);
      ctx.closePath();
    } else ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Svevende tekster
  ctx.textAlign = 'center';
  for (const t of tekster) {
    const a = Math.max(0, 1 - Math.max(0, t.t - 0.6) / 0.5);
    const skala = Math.min(1, t.t * 8);
    ctx.globalAlpha = a;
    ctx.font = `${(t.stor ? 4.6 : 4) * skala}px "Alfa Slab One", Georgia, serif`;
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = 'rgba(7,21,35,0.85)';
    ctx.strokeText(t.tekst, t.x, t.y);
    ctx.fillStyle = t.farge;
    ctx.fillText(t.tekst, t.x, t.y);
  }
  ctx.globalAlpha = 1;

  tegnSnø(dt);
}

// ---------- Hovedløkke ----------
let forrige = performance.now();
function løkke(nå) {
  const dt = Math.min(0.05, (nå - forrige) / 1000);
  forrige = nå;
  requestAnimationFrame(løkke); // planlegg neste bilde først, så én feil ikke fryser spillet
  oppdater(dt);
  tegn(dt);
}

// ---------- Skjermer ----------
const skjermer = ['start', 'slutt', 'toppliste', 'kart'];
let forrigeSkjerm = 'start';
function visSkjerm(navn) {
  for (const s of skjermer) $(s).hidden = s !== navn;
  if (navn && navn !== 'kart' && navn !== 'toppliste') forrigeSkjerm = navn;
  const fokus = navn && $(navn).querySelector('.knapp.hoved, [data-lukk]');
  if (fokus) setTimeout(() => fokus.focus({ preventScroll: true }), 50);
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function tegnListe(el, liste, minId) {
  if (!liste.length) {
    el.innerHTML = '<p class="tom">Ingen har levert julebrus ennå. Bli den første på listen!</p>';
    return;
  }
  el.innerHTML = '<ol>' + liste.map((r, i) =>
    `<li class="${r.id === minId ? 'meg' : ''}"><span class="plass">${i + 1}.</span><span class="navn">${escape(r.navn)}</span><span class="tall">${r.poeng}</span></li>`
  ).join('') + '</ol>';
}
async function hentToppliste(el, minId) {
  el.innerHTML = '<p class="laster">Henter topplisten …</p>';
  try {
    const r = await fetch(API + 'api/toppliste');
    if (!r.ok) throw new Error();
    const d = await r.json();
    tegnListe(el, d.toppliste, minId);
  } catch {
    el.innerHTML = '<p class="feil">Topplisten er ikke tilgjengelig akkurat nå. Spillet virker likevel.</p>';
  }
}

let mittResultat = null;
async function sluttRunde() {
  if (tilstand !== 'spiller') return;
  tilstand = 'over';
  lyd('slutt');
  $('hud').hidden = true;
  $('sluttpoeng').textContent = poeng;
  $('sluttekst').textContent = poeng === 1 ? 'julebrus levert ned pipa' : 'poeng for julebrus levert ned pipa';
  const best = lagret.hent('pipeslipp-rekord', 0);
  if (poeng > best && poeng > 0) {
    lagret.sett('pipeslipp-rekord', poeng);
    $('rekord').textContent = best > 0 ? 'Ny personlig rekord!' : '';
  } else {
    $('rekord').textContent = best > 0 ? `Din rekord: ${best}` : '';
  }
  $('navneskjema').hidden = true;
  $('navnefeil').textContent = '';
  $('lagremelding').textContent = '';
  mittResultat = null;
  visSkjerm('slutt');

  const liste = $('sluttliste');
  if (!billett) {
    $('lagremelding').textContent = 'Resultatet kunne ikke sendes til topplisten denne gangen.';
    hentToppliste(liste);
    return;
  }
  liste.innerHTML = '<p class="laster">Sender resultatet …</p>';
  try {
    const r = await fetch(API + 'api/resultat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billett, poeng }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.feil || 'feil');
    mittResultat = d;
    tegnListe(liste, d.toppliste, d.id);
    if (d.iTopp10) {
      $('topp10tekst').textContent = `Du kom på topplisten som nr. ${d.plass}!`;
      $('navneskjema').hidden = false;
      $('navn').value = lagret.hent('pipeslipp-navn', '');
    }
  } catch (e) {
    $('lagremelding').textContent = 'Resultatet kunne ikke lagres på topplisten. ' + (e.message && e.message !== 'feil' ? e.message : '');
    hentToppliste(liste);
  }
}

$('navneskjema').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!mittResultat) return;
  const navn = $('navn').value.trim();
  const knapp = e.target.querySelector('button');
  knapp.disabled = true;
  $('navnefeil').textContent = '';
  try {
    const r = await fetch(API + 'api/navn', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: mittResultat.id, nokkel: mittResultat.nokkel, navn }),
    });
    const d = await r.json();
    if (!r.ok) { $('navnefeil').textContent = d.feil || 'Navnet ble ikke lagret. Prøv igjen.'; return; }
    lagret.sett('pipeslipp-navn', navn);
    tegnListe($('sluttliste'), d.toppliste, mittResultat.id);
    $('navneskjema').hidden = true;
    $('lagremelding').textContent = navn ? `Navnet «${navn}» er lagret på topplisten.` : 'Du står som Anonym nisse på topplisten.';
  } catch {
    $('navnefeil').textContent = 'Navnet ble ikke lagret fordi forbindelsen brøt. Prøv igjen.';
  } finally {
    knapp.disabled = false;
  }
});

function visToast(tekst) {
  const t = $('toast');
  t.textContent = tekst;
  t.hidden = false;
  clearTimeout(visToast.tid);
  visToast.tid = setTimeout(() => { t.hidden = true; }, 2600);
}

$('delknapp').addEventListener('click', async () => {
  const tekst = `Jeg fikk ${poeng} poeng i Pipeslipp, julebrus-spillet til Mack. Klarer du flere?`;
  // Når spillet er bygget inn på mack.no, sendes Mack-sidens adresse med (?del=...), så det er den som deles
  const del = new URLSearchParams(location.search).get('del');
  const url = del && /^https:\/\/(www\.)?mack\.no\//.test(del) ? del : location.href.split('#')[0];
  if (navigator.share) {
    try { await navigator.share({ title: 'Pipeslipp', text: tekst, url }); } catch { /* avbrutt */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(`${tekst} ${url}`);
    visToast('Teksten og lenken er kopiert. Lim inn der du vil dele.');
  } catch {
    visToast('Kopiering virket ikke. Del lenken: ' + url);
  }
});

document.addEventListener('click', (e) => {
  const vis = e.target.closest('[data-vis]');
  if (vis) {
    const navn = vis.dataset.vis;
    if (navn === 'kart') {
      const ramme = $('kartiframe');
      if (!ramme.src) ramme.src = KART_URL;
      $('kartlenke').href = KART_URL;
    }
    if (navn === 'toppliste') hentToppliste($('toppliste-innhold'));
    visSkjerm(navn);
  }
  if (e.target.closest('[data-lukk]')) visSkjerm(tilstand === 'over' ? 'slutt' : forrigeSkjerm);
});

$('startknapp').addEventListener('click', () => { lyd('slipp'); startRunde(); });
$('igjenknapp').addEventListener('click', startRunde);

function settLydikon() {
  $('lyd').textContent = lydPå ? '🔊' : '🔇';
  $('lyd').setAttribute('aria-label', lydPå ? 'Skru av lyd' : 'Skru på lyd');
}
$('lyd').addEventListener('click', (e) => {
  e.stopPropagation();
  lydPå = !lydPå;
  lagret.sett('pipeslipp-lyd', lydPå);
  settLydikon();
});
$('lyd').addEventListener('pointerdown', e => e.stopPropagation());

lerret.addEventListener('pointerdown', (e) => { e.preventDefault(); slipp(); });
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if ((e.code === 'Space' || e.code === 'ArrowDown') && tilstand === 'spiller') { e.preventDefault(); slipp(); }
  if (e.code === 'Escape' && !$('kart').hidden) visSkjerm(tilstand === 'over' ? 'slutt' : forrigeSkjerm);
});
document.addEventListener('visibilitychange', () => { forrige = performance.now(); });

// Produktraden på startskjermen
const rad = $('produktrad');
for (const p of PRODUKTER) {
  const img = document.createElement('img');
  img.src = p.img.src;
  img.alt = '';
  if (p.stor) img.className = 'stor';
  if (p.boks) img.className = 'boks';
  rad.appendChild(img);
}

tilpass();
nullstillVerden();
settLydikon();
requestAnimationFrame(løkke);

// For automatiske tester
window.__pipeslipp = {
  get tilstand() { return tilstand; }, get poeng() { return poeng; }, get liv() { return liv; }, slipp,
  get hus() { return hus.map(pipeGeometri); }, get fart() { return fart; }, get slippX() { return sledeX() - 4.8; }, get slippY() { return sledeYNå - 5; },
};
