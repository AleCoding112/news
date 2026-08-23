/* ============================================================
   News — il calendario di ciò che arriva
   Sapere che giovedì decide la BCE vale spesso più che sapere
   cos'è successo ieri.

   Il file dati/calendario.json non lo scrive questo strumento:
   nessuna istituzione pubblica un calendario macchina-leggibile
   (BCE, Fed, Eurostat e BEA servono solo HTML, gli iCal danno 404),
   quindi lo compila l'agente leggendo quelle pagine una volta a
   settimana. Scrivere uno scraper su pagine che cambiano ogni anno
   sarebbe fatica sprecata: leggere una pagina e capirla è lavoro
   che un modello fa bene e un parser fa male.

   Questo strumento controlla che il calendario sia in ordine, dice
   cosa arriva, e — incrociandolo con i pezzi — cosa era atteso e
   non è successo.

   Uso:  node tools/calendario.mjs [--settimana] [--mancati]
   ============================================================ */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI  = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.join(QUI, '..');

const GIORNI_AVANTI  = 10;
const GIORNI_INDIETRO = 5;   // oltre, un evento mancato non è più notizia

const TIPI = ['decisione', 'dato', 'scadenza', 'voto', 'riunione', 'pubblicazione'];
const AREE = ['italia', 'europa', 'usa', 'asia', 'africa', 'globale'];

const file = path.join(BASE, 'dati', 'calendario.json');
if (!existsSync(file)) {
  console.log('Nessun calendario: dati/calendario.json non esiste ancora.');
  console.log('Lo compila l\'agente leggendo le pagine di BCE, Fed, Eurostat e BEA.');
  process.exit(0);
}

const cal = JSON.parse(await readFile(file, 'utf8'));
const eventi = cal.eventi ?? [];

/* ---------- controllo di forma ---------- */
const errori = [];
for (const [i, e] of eventi.entries()) {
  const dove = `evento ${i + 1} (${e.cosa ?? '?'})`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.quando ?? '')) errori.push(`${dove}: data fuori formato «${e.quando}»`);
  if (!String(e.cosa ?? '').trim())                errori.push(`${dove}: manca «cosa»`);
  if (!TIPI.includes(e.tipo))                      errori.push(`${dove}: tipo sconosciuto «${e.tipo}» (ammessi: ${TIPI.join(', ')})`);
  if (!AREE.includes(e.area))                      errori.push(`${dove}: area sconosciuta «${e.area}»`);
  if (!/^https?:\/\//.test(e.fonte ?? ''))         errori.push(`${dove}: manca la fonte, o non è un indirizzo`);
}

const oggi = new Date().toISOString().slice(0, 10);
const fra = g => new Date(Date.now() + g * 86400000).toISOString().slice(0, 10);

const prossimi = eventi
  .filter(e => e.quando >= oggi && e.quando <= fra(GIORNI_AVANTI))
  .sort((a, b) => a.quando.localeCompare(b.quando));

/* ---------- che cosa era atteso e non è arrivato ----------
   Un evento passato senza che nessun pezzo lo riguardi: o non è
   successo, o è successo e non ce ne siamo accorti. Entrambe le
   cose vanno sapute. */
const dirPezzi = path.join(BASE, 'dati', 'pezzi');
const pezzi = existsSync(dirPezzi)
  ? await Promise.all((await readdir(dirPezzi)).filter(f => f.endsWith('.json'))
      .map(async f => JSON.parse(await readFile(path.join(dirPezzi, f), 'utf8'))))
  : [];

function coperto(e) {
  const chiavi = String(e.cosa).toLowerCase().split(/\W+/).filter(p => p.length > 4);
  return pezzi.some(p => {
    if (p.quando.slice(0, 10) < e.quando) return false;
    if (e.id && p.evento === e.id) return true;
    const testo = `${p.titolo} ${p.unaRiga} ${p.fatti ?? ''}`.toLowerCase();
    const presenti = chiavi.filter(k => testo.includes(k)).length;
    return chiavi.length > 0 && presenti / chiavi.length >= 0.5;
  });
}

const mancati = eventi
  .filter(e => e.quando < oggi && e.quando >= fra(-GIORNI_INDIETRO) && !coperto(e))
  .sort((a, b) => b.quando.localeCompare(a.quando));

/* ---------- resa ---------- */
if (errori.length) {
  console.log('Il calendario ha dei problemi:');
  for (const e of errori) console.log(`  ✗ ${e}`);
  console.log();
}

if (process.argv.includes('--mancati')) {
  if (!mancati.length) { console.log('Niente di atteso è rimasto scoperto.'); process.exit(0); }
  console.log(`${mancati.length} eventi attesi senza un pezzo che li riguardi:\n`);
  for (const e of mancati) console.log(`  ${e.quando}  ${e.cosa}\n            ${e.fonte}`);
  process.exit(errori.length ? 1 : 0);
}

console.log(`${eventi.length} eventi in calendario · aggiornato ${String(cal.aggiornato ?? '?').slice(0, 10)}`);
console.log(`\nProssimi ${GIORNI_AVANTI} giorni:`);
if (!prossimi.length) console.log('  niente in programma — il calendario va rinfrescato?');
for (const e of prossimi) {
  const atteso = e.atteso ? `  — atteso: ${e.atteso}` : '';
  console.log(`  ${e.quando}  [${e.tipo}] ${e.cosa}${atteso}`);
}
if (mancati.length) console.log(`\n⚠ ${mancati.length} eventi passati senza un pezzo: node tools/calendario.mjs --mancati`);
process.exit(errori.length ? 1 : 0);
