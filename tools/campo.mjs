/* ============================================================
   News — che cosa dice il campo
   Classifica, ultima giornata e prossime partite. Il file
   dati/calcio/campo.json non lo scrive questo strumento: lo
   compila l'agente leggendo Wikipedia, che per il calcio è
   aggiornata entro pochi minuti dalla fine delle partite.

   Le API a pagamento non servivano: football-data.org vuole la
   registrazione e TheSportsDB, nel piano gratuito, tronca la
   classifica a cinque squadre — una classifica di cinque squadre
   non è una classifica.

   Qui si controlla che il file sia in ordine, si dice quanto è
   vecchio, e si mostra dove sta la Juventus.

   Uso:  node tools/campo.mjs [--squadra Juventus]
   ============================================================ */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { caricaTestata } from './testata.mjs';

const T = await caricaTestata('calcio');
const GIORNI_FRESCHI = 2;   // oltre, la classifica non si cita senza rinfrescarla

const i = process.argv.indexOf('--squadra');
const MIA = (i !== -1 && process.argv[i + 1]) ? process.argv[i + 1] : 'Juventus';

const file = path.join(T.percorsi.dati, 'campo.json');
if (!existsSync(file)) {
  console.log('Nessun dato di campo: dati/calcio/campo.json non esiste ancora.');
  console.log("Lo compila l'agente leggendo https://it.wikipedia.org/wiki/Serie_A_2026-2027");
  process.exit(0);
}

const c = JSON.parse(await readFile(file, 'utf8'));
const errori = [];

/* ---------- controllo di forma ---------- */
const classifica = c.classifica ?? [];
if (!classifica.length) errori.push('la classifica è vuota');
for (const [n, r] of classifica.entries()) {
  const dove = `riga ${n + 1} (${r.squadra ?? '?'})`;
  for (const campo of ['pos', 'squadra', 'punti', 'giocate']) {
    if (r[campo] == null) errori.push(`${dove}: manca «${campo}»`);
  }
  /* I punti devono tornare con i risultati: è il controllo che accorge
     di una trascrizione sbagliata meglio di qualunque rilettura. */
  if (r.v != null && r.n != null && r.punti != null && r.v * 3 + r.n !== r.punti) {
    errori.push(`${dove}: ${r.v} vittorie e ${r.n} pareggi farebbero ${r.v * 3 + r.n} punti, non ${r.punti}`);
  }
  if (r.v != null && r.n != null && r.p != null && r.giocate != null && r.v + r.n + r.p !== r.giocate) {
    errori.push(`${dove}: ${r.v}+${r.n}+${r.p} non fa ${r.giocate} partite giocate`);
  }
}

const giorni = c.aggiornato
  ? Math.floor((Date.now() - new Date(c.aggiornato).getTime()) / 86400000)
  : null;
const vecchio = giorni != null && giorni > GIORNI_FRESCHI;

/* ---------- resa ---------- */
if (errori.length) {
  console.log('Il campo ha dei problemi:');
  for (const e of errori) console.log(`  ✗ ${e}`);
  console.log();
}

console.log(`Serie A, giornata ${c.giornata ?? '?'} · aggiornato ${String(c.aggiornato ?? '?').slice(0, 10)}` +
            (vecchio ? `  ⚠ vecchio di ${giorni} giorni: non citarlo senza rinfrescarlo` : ''));

if (classifica.length) {
  console.log();
  const mia = classifica.find(r => new RegExp(MIA, 'i').test(r.squadra));
  /* Le prime cinque, e la squadra che si segue comunque — anche se è
     nona, e soprattutto se è nona. */
  const daMostrare = [...classifica.slice(0, 5)];
  if (mia && !daMostrare.includes(mia)) daMostrare.push(null, mia);

  for (const r of daMostrare) {
    if (!r) { console.log('   …'); continue; }
    const io = mia && r === mia ? ' ←' : '';
    console.log(`  ${String(r.pos).padStart(2)}. ${r.squadra.padEnd(14)} ${String(r.punti).padStart(3)} pt   ` +
                `G${r.giocate}  ${r.v ?? '-'}-${r.n ?? '-'}-${r.p ?? '-'}  ` +
                `${r.gf ?? '?'}:${r.gs ?? '?'}${io}`);
  }
}

if (c.ultima_giornata?.length) {
  console.log('\nUltima giornata:');
  for (const p of c.ultima_giornata) console.log(`  ${p.casa} ${p.risultato} ${p.ospite}`);
}

const prossime = (c.prossime ?? []).filter(p => new Date(p.quando) >= new Date(Date.now() - 3 * 36e5));
if (prossime.length) {
  console.log('\nProssime:');
  for (const p of prossime.slice(0, 6)) {
    const q = new Date(p.quando);
    const nostra = new RegExp(MIA, 'i').test(`${p.casa} ${p.ospite}`) ? ' ←' : '';
    console.log(`  ${q.toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}  ` +
                `${p.casa} - ${p.ospite}  (${p.competizione ?? 'Serie A'})${nostra}`);
  }
}

process.exit(errori.length ? 1 : 0);
