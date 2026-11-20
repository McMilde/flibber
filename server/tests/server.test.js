import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {
  lagDatabase, lagBillett, sjekkBillett, erRealistisk, lagreResultat, settNavn, hentToppliste,
} from '../server.js';
import { erStyggtNavn, rensNavn } from '../lib/navnefilter.js';

function testDb() {
  const mappe = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeslipp-'));
  return lagDatabase(path.join(mappe, 'test.db'));
}

test('billett: gyldig, forfalsket og for gammel', () => {
  const nå = Date.now();
  const b = lagBillett(nå - 30_000);
  assert.ok(sjekkBillett(b, nå));
  assert.equal(sjekkBillett(b.slice(0, -2) + 'xx', nå), null);
  assert.equal(sjekkBillett(b, nå + 2 * 60 * 60 * 1000), null);
  assert.equal(sjekkBillett('tull', nå), null);
});

test('urealistiske poeng avvises', () => {
  assert.equal(erRealistisk(10, 30_000), true);
  assert.equal(erRealistisk(500, 30_000), false);
  assert.equal(erRealistisk(-1, 30_000), false);
  assert.equal(erRealistisk(2.5, 30_000), false);
});

test('resultat lagres, billett kan bare brukes én gang', () => {
  const db = testDb();
  const nå = Date.now();
  const billett = lagBillett(nå - 60_000);
  const r = lagreResultat(db, { billett, poeng: 42 }, nå);
  assert.equal(r.status, 200);
  assert.equal(r.svar.plass, 1);
  assert.equal(r.svar.iTopp10, true);
  assert.equal(r.svar.toppliste[0].navn, 'Anonym nisse');
  const igjen = lagreResultat(db, { billett, poeng: 42 }, nå);
  assert.equal(igjen.status, 409);
});

test('toppliste viser bare 10, sortert', () => {
  const db = testDb();
  const nå = Date.now();
  for (let i = 1; i <= 14; i++) lagreResultat(db, { billett: lagBillett(nå - 120_000), poeng: i }, nå);
  const liste = hentToppliste(db);
  assert.equal(liste.length, 10);
  assert.equal(liste[0].poeng, 14);
  assert.equal(liste[9].poeng, 5);
  const lav = lagreResultat(db, { billett: lagBillett(nå - 120_000), poeng: 1 }, nå);
  assert.equal(lav.svar.iTopp10, false);
});

test('navn: lagres med riktig nøkkel, stygge navn stoppes', () => {
  const db = testDb();
  const nå = Date.now();
  const r = lagreResultat(db, { billett: lagBillett(nå - 60_000), poeng: 7 }, nå).svar;
  assert.equal(settNavn(db, { id: r.id, nokkel: 'feil', navn: 'Ola' }, nå).status, 403);
  assert.equal(settNavn(db, { id: r.id, nokkel: r.nokkel, navn: 'f4en ta deg' }, nå).status, 422);
  const ok = settNavn(db, { id: r.id, nokkel: r.nokkel, navn: '  Julenissen  ' }, nå);
  assert.equal(ok.status, 200);
  assert.equal(ok.svar.toppliste[0].navn, 'Julenissen');
  assert.equal(settNavn(db, { id: r.id, nokkel: r.nokkel, navn: 'Sen' }, nå + 60 * 60 * 1000).status, 403);
});

test('navnefilter: vanlige navn slipper gjennom', () => {
  for (const ok of ['Thoresen', 'Fan av Mack', 'Ingrid', 'Brunkebergs', 'Sexton', 'Nissefar 2026']) {
    assert.equal(erStyggtNavn(ok), false, ok);
  }
  for (const stygg of ['FUCK', 'sh1t', 'faen', 'kuk', 'Hitler']) {
    assert.equal(erStyggtNavn(stygg), true, stygg);
  }
  assert.equal(rensNavn('<b>Ola</b>'), 'bOla/b');
  assert.equal(rensNavn('a'.repeat(30)).length, 16);
});
