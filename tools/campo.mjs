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

/* ---------- controllo delle partite ----------
   La scheda che l'app apre toccando una partita mostra ora, canale e
   confronto: qui si controlla che i dati su cui poggia stiano in piedi.

   Il canale è l'unico dato che non possediamo, e la regola è quella
   della testata: o lo dice una fonte, o resta vuoto (LINEA-CALCIO.md §3).
   Perciò se c'è «dove_si_vede» dev'esserci «dove_fonte». */
const partite = c.prossime ?? [];
const viste = new Set();
let scadute = 0, senzaCanale = 0;

for (const [n, p] of partite.entries()) {
  const dove = `prossime[${n}] (${p.casa ?? '?'} - ${p.ospite ?? '?'})`;
  for (const campo of ['quando', 'casa', 'ospite']) {
    if (!p[campo]) errori.push(`${dove}: manca «${campo}»`);
  }
  if (p.quando && isNaN(new Date(p.quando))) errori.push(`${dove}: «quando» non è una data leggibile`);

  const chiave = `${p.competizione ?? ''}|${p.giornata ?? ''}|${p.casa}|${p.ospite}`.toLowerCase();
  if (viste.has(chiave)) errori.push(`${dove}: è la stessa partita di una riga precedente`);
  viste.add(chiave);

  if (p.dove_si_vede != null) {
    if (!Array.isArray(p.dove_si_vede)) {
      errori.push(`${dove}: «dove_si_vede» dev'essere un elenco`);
    } else {
      for (const v of p.dove_si_vede) {
        if (!(typeof v === 'string' ? v : v?.canale)) errori.push(`${dove}: un canale senza nome`);
      }
      if (p.dove_si_vede.length && !/^https?:\/\//.test(p.dove_fonte ?? '')) {
        errori.push(`${dove}: c'è il canale ma manca «dove_fonte», cioè l'indirizzo di chi lo dice`);
      }
    }
  }
  if (!p.dove_si_vede?.length) senzaCanale++;
  if (p.quando && new Date(p.quando).getTime() < Date.now() - 3 * 36e5) scadute++;
}

/* Fuori ordine si vede solo confrontando le date a due a due. */
for (let i = 1; i < partite.length; i++) {
  if (String(partite[i - 1].quando) > String(partite[i].quando)) {
    errori.push(`prossime: la riga ${i + 1} viene prima della ${i} nel tempo: rimettile in ordine`);
    break;
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

const prossime = partite.filter(p => new Date(p.quando) >= new Date(Date.now() - 3 * 36e5));
if (prossime.length) {
  console.log('\nProssime:');
  for (const p of prossime.slice(0, 6)) {
    const q = new Date(p.quando);
    const nostra = new RegExp(MIA, 'i').test(`${p.casa} ${p.ospite}`) ? ' ←' : '';
    const canali = (p.dove_si_vede ?? []).map(v => typeof v === 'string' ? v : v.canale).join(', ');
    console.log(`  ${q.toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}  ` +
                `${p.casa} - ${p.ospite}  (${p.competizione ?? 'Serie A'})` +
                `${canali ? `  su ${canali}` : ''}${nostra}`);
  }
}

/* Due cose che non sono errori ma che il redattore deve vedere. */
if (scadute) {
  console.log(`\n⚠ ${scadute} ${scadute === 1 ? 'partita è già finita' : 'partite sono già finite'} ` +
              'ma stanno ancora fra le «prossime»: portane il risultato in «ultima_giornata».');
}
if (partite.length) {
  console.log(`\n${senzaCanale} partite su ${partite.length} non dicono dove si vedono. ` +
              'Si riempie «dove_si_vede» solo quando una fonte lo dice: dedurlo dai diritti tv è indovinare.');
}

process.exit(errori.length ? 1 : 0);
