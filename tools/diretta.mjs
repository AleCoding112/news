/* ============================================================
   News — il risultato mentre la partita è in corso

   Il campo lo compila il redattore leggendo Wikipedia, quattro volte
   al giorno. Va benissimo per la classifica, ma non per il risultato:
   il 23 agosto 2026, alle 20:14, Wikipedia non aveva ancora i risultati
   delle partite delle 18:30. Non è la nostra macchina a essere lenta —
   è quella fonte a non essere fatta per la diretta.

   ANSA sì. Riscrive lo stesso articolo mentre la partita va avanti e
   mette il punteggio nel titolo: «Serie A: Frosinone-Juventus 0-1
   DIRETTA E FOTO». È una fonte che raccogliamo già, senza chiavi né
   account.

   Questo strumento non esercita alcun giudizio ed è volutamente
   diffidente:

   - accetta un punteggio solo se il titolo contiene la coppia esatta
     «Casa-Ospite» di una partita che abbiamo già in calendario. Sui
     titoli di riepilogo uno schema più libero produce spazzatura:
     da «il Napoli supera 0-2 il Genoa» si ricava «il Napoli supera 0»
     contro «2 il Genoa»;
   - non accetta niente prima del fischio d'inizio, né da un articolo
     più vecchio della partita;
   - scrive in un campo suo, `diretta`, e **non tocca mai la classifica**:
     quella continua a venire dalla fonte validata, con i punti che
     devono tornare (tools/campo.mjs);
   - se il formato dei titoli cambia, non trova niente e non scrive
     niente. Il silenzio è il modo giusto di fallire.

   Uso:  node tools/diretta.mjs [--secco] [--verboso]
   ============================================================ */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { caricaTestata, caricaFonti } from './testata.mjs';

const T = await caricaTestata('calcio');
const SECCO   = process.argv.includes('--secco');
const VERBOSO = process.argv.includes('--verboso');

/* Un articolo più vecchio di così non racconta la partita di adesso. */
const ORE_UTILI = 8;
/* Dopo il fischio finale ANSA continua a ritoccare il pezzo: si resta
   in ascolto un po' oltre, ma non all'infinito. */
const ORE_DOPO_INIZIO = 5;

const scappa = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ---------- la fonte ---------- */

function tag(xml, nome) {
  const m = new RegExp(`<${nome}[^>]*>([\\s\\S]*?)</${nome}>`, 'i').exec(xml);
  if (!m) return '';
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
             .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
             .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
             .trim();
}

async function vociDi(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) News/2.1 (+lettore RSS personale)' },
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const xml = await r.text();
  return (xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || []).map(b => ({
    titolo: tag(b, 'title'),
    url:    tag(b, 'link'),
    quando: Date.parse(tag(b, 'pubDate')),
  }));
}

/* ---------- l'accostamento ---------- */

/* Il punteggio si cerca in quello che resta del titolo dopo aver tolto
   la coppia di squadre: così «Frosinone-Juventus» non viene mai scambiato
   per un risultato, e «0-1» non viene mai scambiato per una coppia. */
function punteggioDi(titolo, casa, ospite) {
  const coppia = new RegExp(`${scappa(casa)}\\s*[-–]\\s*${scappa(ospite)}`, 'i');
  if (!coppia.test(titolo)) return null;
  const resto = titolo.replace(coppia, ' § ');
  const m = /(?:^|[\s:§])(\d{1,2})\s*[-–]\s*(\d{1,2})(?:$|[\s.,;:!?])/.exec(resto);
  if (!m) return null;
  const [a, b] = [Number(m[1]), Number(m[2])];
  /* Una partita con più di undici gol per parte è un errore di lettura,
     non una goleada. */
  if (a > 11 || b > 11) return null;
  return `${a}-${b}`;
}

/* ---------- il giro ---------- */

const file = path.join(T.percorsi.dati, 'campo.json');
if (!existsSync(file)) {
  console.log('Nessun dato di campo da aggiornare: dati/calcio/campo.json non esiste.');
  process.exit(0);
}
const campo = JSON.parse(await readFile(file, 'utf8'));
const partite = campo.prossime ?? [];

const ora = Date.now();
const inCorso = partite.filter(p => {
  const q = Date.parse(p.quando ?? '');
  return !isNaN(q) && q <= ora && ora <= q + ORE_DOPO_INIZIO * 36e5;
});

if (!inCorso.length) {
  console.log('Nessuna partita in corso adesso: niente da aggiornare.');
  process.exit(0);
}

const fonti = (await caricaFonti(T)).filter(f => f.id === 'ansa-sport');
if (!fonti.length) {
  console.error('Manca la fonte «ansa-sport» nel registro del calcio: senza, questo strumento non ha da dove leggere.');
  process.exit(1);
}

let voci = [];
for (const f of fonti) {
  try {
    voci.push(...(await vociDi(f.url)).map(v => ({ ...v, fonte: f.nome ?? f.id })));
  } catch (e) {
    console.error(`${f.id}: ${e.message}`);
  }
}
voci = voci.filter(v => !isNaN(v.quando) && ora - v.quando <= ORE_UTILI * 36e5);

if (VERBOSO) console.log(`${voci.length} voci recenti, ${inCorso.length} partite in corso\n`);

const cambiate = [];
for (const p of inCorso) {
  const inizio = Date.parse(p.quando);
  /* Fra due articoli sulla stessa partita vince il più recente: è quello
     che ha visto più minuti di gioco. */
  const candidate = voci
    .filter(v => v.quando >= inizio)
    .sort((a, b) => b.quando - a.quando);

  for (const v of candidate) {
    const punteggio = punteggioDi(v.titolo, p.casa, p.ospite);
    if (!punteggio) continue;
    if (p.diretta?.risultato === punteggio) break;   // già saputo
    p.diretta = {
      risultato: punteggio,
      quando: new Date(v.quando).toISOString(),
      fonte: v.fonte,
      url: v.url || undefined,
      _nota: 'Provvisorio, letto dal titolo di una fonte di cronaca. Il risultato buono lo scrive il ciclo in «ultima_giornata».',
    };
    cambiate.push(`${p.casa} ${punteggio} ${p.ospite}  (${v.fonte}, ${new Date(v.quando).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })})`);
    break;
  }
}

if (!cambiate.length) {
  console.log(`Nessun punteggio nuovo per ${inCorso.length === 1 ? 'la partita in corso' : `le ${inCorso.length} partite in corso`}.`);
  process.exit(0);
}

if (SECCO) {
  console.log('A secco, non scrivo. Avrei aggiornato:');
  for (const c of cambiate) console.log(`  ${c}`);
  process.exit(0);
}

campo.diretta_aggiornata = new Date().toISOString();
await writeFile(file, JSON.stringify(campo, null, 1) + '\n');
console.log(`Aggiornate ${cambiate.length} partite:`);
for (const c of cambiate) console.log(`  ${c}`);
