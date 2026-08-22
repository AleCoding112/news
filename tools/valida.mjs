/* ============================================================
   News — validazione
   Controlla che i pezzi scritti rispettino LINEA-EDITORIALE.md
   nelle parti che una macchina può controllare, e ricostruisce
   dati/indice.json con i soli pezzi che passano.

   Una regola che nessuno verifica è un auspicio. Qui le regole
   sulle fonti, sui numeri e sul lessico diventano un errore che
   blocca la pubblicazione.
   ============================================================ */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI  = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.join(QUI, '..');

const OBBLIGATORI = ['id', 'quando', 'titolo', 'occhiello', 'temi', 'area',
                     'fatti', 'perche_conta', 'cosa_non_sappiamo', 'fonti', 'confidenza'];

const TEMI_AMMESSI = ['macro', 'politica-monetaria', 'mercati', 'economia', 'commercio',
                      'geopolitica', 'guerre', 'difesa', 'politica-ue', 'politica-it',
                      'regolamentazione', 'energia', 'tecnologia'];
const AREE_AMMESSE = ['italia', 'europa', 'usa', 'asia', 'africa', 'globale'];

/* §4: aggettivi che esprimono un giudizio invece di descrivere.
   Se il dato rende «forte» una crescita, il numero basta. */
const VALUTATIVI = /\b(clamoros\w+|shock|drammatic\w+|sconvolgent\w+|incredibil\w+|allarmant\w+|preoccupant\w+|catastrofic\w+|disastros\w+|storic[oaie]\b|epocal\w+|record assoluto|senza precedenti|inaccettabil\w+|scandalos\w+|vergognos\w+)/gi;

/* §4: il titolo dice cosa è successo, non cosa devi provare. */
const TITOLO_MALATO = [
  { re: /\?\s*$/,                                   perche: 'titolo a domanda' },
  { re: /!/,                                        perche: 'punto esclamativo' },
  { re: /\b(ecco (perch|come)|vi spieghiamo|cosa sapere)\b/i, perche: 'formula da acchiappaclic' },
];

const MIN_PAROLE = 120;
const MAX_PAROLE = 650;

function conta(t) { return String(t ?? '').trim().split(/\s+/).filter(Boolean).length; }

/* ---------- Controlli su un pezzo --------------------------- */

function controlla(p, { macro, idEsistenti }) {
  const errori = [], avvisi = [];
  const E = m => errori.push(m);
  const A = m => avvisi.push(m);

  for (const c of OBBLIGATORI) {
    const v = p[c];
    if (v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)) {
      E(`manca il campo obbligatorio «${c}»`);
    }
  }
  if (errori.length) return { errori, avvisi };

  if (!/^\d{4}-\d{2}-\d{2}-\d{3}-[a-z0-9-]+$/.test(p.id)) E(`id fuori formato: ${p.id}`);
  if (isNaN(new Date(p.quando)))                            E(`data non valida: ${p.quando}`);
  if (!AREE_AMMESSE.includes(p.area))                       E(`area sconosciuta: ${p.area}`);
  for (const t of p.temi) if (!TEMI_AMMESSI.includes(t))    E(`tema sconosciuto: ${t}`);
  if (!['alta', 'media', 'bassa'].includes(p.confidenza))   E(`confidenza fuori scala: ${p.confidenza}`);

  /* §4 — lessico */
  for (const campo of ['titolo', 'occhiello', 'fatti', 'perche_conta']) {
    const trovati = String(p[campo] ?? '').match(VALUTATIVI);
    if (trovati) E(`«${campo}» contiene un giudizio non contenuto nel dato: ${[...new Set(trovati)].join(', ')}`);
  }
  for (const t of TITOLO_MALATO) if (t.re.test(p.titolo)) E(`titolo: ${t.perche}`);

  const parole = conta(p.fatti) + conta(p.perche_conta);
  if (parole < MIN_PAROLE) A(`corpo di ${parole} parole: sotto le ${MIN_PAROLE}, probabilmente non c'era un pezzo`);
  if (parole > MAX_PAROLE) A(`corpo di ${parole} parole: sopra le ${MAX_PAROLE}, va tagliato (§4)`);

  /* §3 — fonti */
  const fonti = p.fonti ?? [];
  for (const f of fonti) {
    if (!f.url || !/^https?:\/\//.test(f.url)) E(`fonte senza url valido: ${f.titolo ?? f.testata ?? '?'}`);
    if (!['primaria', 'testata', 'analisi'].includes(f.tipo)) E(`fonte con tipo sconosciuto: ${f.tipo}`);
    if (typeof f.letto !== 'boolean') E(`la fonte «${f.testata}» non dichiara se è stata letta`);
  }
  const primarie = fonti.filter(f => f.tipo === 'primaria');
  const testate  = new Set(fonti.map(f => f.testata));
  if (!primarie.length && testate.size < 2) {
    E(`§3: una sola fonte non primaria (${[...testate].join(', ')}). Servono due fonti indipendenti o una primaria.`);
  }
  const lette = fonti.filter(f => f.letto);
  if (!lette.length) {
    E('§3: nessuna fonte è stata letta per intero. I fatti non possono poggiare solo su titoli.');
  }

  /* §3 — i numeri contro macro.json */
  for (const n of p.numeri ?? []) {
    if (!n.quando) E(`il numero «${n.cosa}» è senza periodo di riferimento`);
    const serie = macro.find(s => s.id === n.serie);
    if (n.serie && !serie) E(`il numero «${n.cosa}» cita una serie inesistente: ${n.serie}`);
    if (serie) {
      const dichiarato = parseFloat(String(n.valore).replace(',', '.').replace(/[^\d.-]/g, ''));
      const vero = parseFloat(serie.valore);
      if (isFinite(dichiarato) && isFinite(vero) && Math.abs(dichiarato - vero) > Math.max(0.05, Math.abs(vero) * 0.01)) {
        E(`«${n.cosa}»: dichiarato ${n.valore}, ma ${serie.fonte} dice ${serie.valore} (${serie.periodo}). Vince la fonte primaria.`);
      }
      if (serie.obsoleto) {
        const testo = `${p.fatti} ${p.perche_conta}`;
        const anno = String(serie.periodo).slice(0, 4);
        if (!testo.includes(anno) && !new RegExp(String(serie.periodo)).test(testo)) {
          E(`«${n.cosa}» è un dato di ${serie.periodo}, vecchio di ${serie.giorni_dal_dato} giorni: va citato con la sua data (§3).`);
        }
      }
    }
  }

  /* §5 — catene */
  if (p.sviluppo_di && !idEsistenti.has(p.sviluppo_di)) {
    E(`sviluppo_di punta a un pezzo che non esiste: ${p.sviluppo_di}`);
  }
  if (p.sviluppo_di === p.id) E('sviluppo_di punta a sé stesso');

  return { errori, avvisi };
}

/* ---------- I link rispondono davvero? --------------------- */

/* Un link protetto non è un link morto: le testate a pagamento
   rispondono 403 a chi non ha l'abbonamento, e chiudere per questo
   la pubblicazione significherebbe non poterle mai citare. Solo il
   404 e il 410 dicono che l'indirizzo non esiste. */
const NON_ESISTE = new Set([404, 410]);
const PROTETTO   = new Set([401, 403, 429, 451]);

async function vivo(url) {
  const opzioni = { redirect: 'follow', signal: AbortSignal.timeout(12000),
                    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15' } };
  try {
    let r = await fetch(url, { ...opzioni, method: 'HEAD' });
    if (r.status === 405) r = await fetch(url, opzioni);   // qualcuno rifiuta HEAD
    if (r.ok) return null;
    if (NON_ESISTE.has(r.status)) return { grave: true,  testo: `HTTP ${r.status}, l'indirizzo non esiste` };
    if (PROTETTO.has(r.status))   return { grave: false, testo: `HTTP ${r.status}, protetto: verifica a mano che l'indirizzo sia giusto` };
    return { grave: false, testo: `HTTP ${r.status}` };
  } catch (e) { return { grave: false, testo: `non raggiungibile (${e.message || e})` }; }
}

/* ---------- Avvio ------------------------------------------- */

const salta = process.argv.includes('--senza-link');

const dirPezzi = path.join(BASE, 'dati', 'pezzi');
if (!existsSync(dirPezzi)) { console.log('Nessun pezzo da validare.'); process.exit(0); }

const file = (await readdir(dirPezzi)).filter(f => f.endsWith('.json')).sort();
if (!file.length) { console.log('Nessun pezzo da validare.'); process.exit(0); }

const macroFile = path.join(BASE, 'dati', 'macro.json');
const macro = existsSync(macroFile) ? JSON.parse(await readFile(macroFile, 'utf8')).serie.filter(s => !s.errore) : [];

const pezzi = [];
for (const f of file) {
  try { pezzi.push({ file: f, dati: JSON.parse(await readFile(path.join(dirPezzi, f), 'utf8')) }); }
  catch (e) { console.log(`✗ ${f}: JSON illeggibile — ${e.message}`); }
}
const idEsistenti = new Set(pezzi.map(p => p.dati.id));

let buoni = 0, cattivi = 0;
const validi = [];

for (const { file: f, dati: p } of pezzi) {
  const { errori, avvisi } = controlla(p, { macro, idEsistenti });

  if (!salta && !errori.length) {
    for (const fonte of p.fonti ?? []) {
      const guaio = await vivo(fonte.url);
      if (!guaio) continue;
      const riga = `${fonte.testata}: ${guaio.testo} — ${fonte.url}`;
      if (guaio.grave) errori.push(riga); else avvisi.push(riga);
    }
  }

  if (errori.length) {
    cattivi++;
    console.log(`\n✗ ${f}`);
    for (const e of errori) console.log(`    ${e}`);
    for (const a of avvisi) console.log(`    ~ ${a}`);
  } else {
    buoni++;
    validi.push(p);
    if (avvisi.length) {
      console.log(`\n~ ${f}`);
      for (const a of avvisi) console.log(`    ${a}`);
    }
  }
}

/* L'indice è ciò che il sito carica: ci entrano solo i pezzi validi.
   Un pezzo che non passa non viene pubblicato, non viene corretto in
   silenzio. */
if (!cattivi) {
  /* Il piu recente in cima. Ma i pezzi di uno stesso ciclo escono
     insieme, e fra loro conta l'ordine in cui sono stati scritti: il
     numero progressivo nell'id e la scelta editoriale, non un dettaglio. */
  const indice = validi
    .sort((a, b) => String(b.quando).localeCompare(String(a.quando))
                 || String(a.id).localeCompare(String(b.id)))
    .map(p => ({
      id: p.id, quando: p.quando, titolo: p.titolo, occhiello: p.occhiello,
      temi: p.temi, area: p.area, confidenza: p.confidenza,
      sviluppo_di: p.sviluppo_di ?? null,
      fonti: (p.fonti ?? []).length,
    }));
  await writeFile(path.join(BASE, 'dati', 'indice.json'), JSON.stringify({
    aggiornato: new Date().toISOString(),
    pezzi: indice,
  }, null, 1));
}

console.log(`\n${buoni} validi, ${cattivi} respinti${cattivi ? ' — indice non aggiornato' : ' — dati/indice.json aggiornato'}`);
process.exit(cattivi ? 1 : 0);
