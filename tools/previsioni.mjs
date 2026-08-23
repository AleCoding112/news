/* ============================================================
   News — il registro delle previsioni
   Raccoglie dai pezzi le previsioni falsificabili, tiene il conto
   di quante si sono avverate, e dice quali sono scadute e vanno
   verificate.

   È l'unica misura onesta del fatto che il giornale funzioni
   invece di essere soltanto ben scritto. Il punteggio va mostrato
   anche — soprattutto — quando è imbarazzante.

   La previsione vive dentro il pezzo che l'ha fatta: è l'unico
   posto dove non può essere modificata senza toccare anche il
   ragionamento che la sosteneva.

   Uso:  node tools/previsioni.mjs [--scadute]
   ============================================================ */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI  = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.join(QUI, '..');

const dirPezzi = path.join(BASE, 'dati', 'pezzi');
if (!existsSync(dirPezzi)) { console.log('Nessun pezzo.'); process.exit(0); }

const previsioni = [];
for (const f of (await readdir(dirPezzi)).filter(f => f.endsWith('.json')).sort()) {
  const p = JSON.parse(await readFile(path.join(dirPezzi, f), 'utf8'));
  if (!p.previsione) continue;
  previsioni.push({
    pezzo: p.id,
    titolo: p.titolo,
    quando: p.quando,
    temi: p.temi,
    area: p.area,
    ...p.previsione,
    esito: p.previsione.esito ?? 'aperta',
  });
}

const oggi = new Date().toISOString().slice(0, 10);
const scadute = previsioni.filter(p => p.esito === 'aperta' && p.scade <= oggi);

/* Il tasso si calcola solo su quelle chiuse e verificabili: contare
   le aperte come giuste sarebbe il modo più semplice di mentire. */
const chiuse  = previsioni.filter(p => p.esito === 'giusta' || p.esito === 'sbagliata');
const giuste  = chiuse.filter(p => p.esito === 'giusta').length;

const tabellone = {
  totali: previsioni.length,
  aperte: previsioni.filter(p => p.esito === 'aperta').length,
  giuste,
  sbagliate: chiuse.length - giuste,
  non_verificabili: previsioni.filter(p => p.esito === 'non_verificabile').length,
  tasso: chiuse.length ? Math.round((giuste / chiuse.length) * 100) : null,
  scadute_da_verificare: scadute.length,
};

if (process.argv.includes('--scadute')) {
  if (!scadute.length) { console.log('Nessuna previsione scaduta da verificare.'); process.exit(0); }
  console.log(`${scadute.length} previsioni scadute da verificare:\n`);
  for (const p of scadute) {
    console.log(`  ${p.pezzo}`);
    console.log(`    afferma:  ${p.afferma}`);
    console.log(`    scaduta:  ${p.scade}`);
    console.log(`    verifica: ${p.come_si_verifica}\n`);
  }
  process.exit(0);
}

await writeFile(path.join(BASE, 'dati', 'previsioni.json'), JSON.stringify({
  aggiornato: new Date().toISOString(),
  nota: 'Ogni previsione nasce dentro un pezzo e ne condivide la sorte. Il tasso conta solo quelle chiuse: le aperte non sono ne giuste ne sbagliate.',
  tabellone,
  previsioni: previsioni.sort((a, b) => String(a.scade).localeCompare(String(b.scade))),
}, null, 1));

console.log(`${tabellone.totali} previsioni → dati/previsioni.json`);
console.log(`  aperte ${tabellone.aperte} · giuste ${tabellone.giuste} · sbagliate ${tabellone.sbagliate}` +
            (tabellone.tasso == null ? '  (nessuna ancora chiusa)' : `  → ${tabellone.tasso}% di azzeccate`));
if (scadute.length) console.log(`  ⚠ ${scadute.length} scadute da verificare: node tools/previsioni.mjs --scadute`);
