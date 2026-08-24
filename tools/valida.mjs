/* ============================================================
   News — validazione
   Controlla che i pezzi rispettino LINEA-EDITORIALE.md nelle parti
   che una macchina può controllare, e ricostruisce dati/indice.json
   con i soli pezzi che passano.

   Una regola che nessuno verifica è un auspicio. Qui le regole sulle
   fonti, sui numeri e sul lessico diventano un errore che blocca la
   pubblicazione.
   ============================================================ */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { caricaTestata, BASE } from './testata.mjs';

const T = await caricaTestata();

/* ---------- 1. I tipi di pezzo ------------------------------
   Non tutto quello che si pubblica è una notizia, e pretendere da un
   pezzo di calendario le due fonti indipendenti che si chiedono a una
   notizia significherebbe non poterlo scrivere mai. Ogni tipo ha i suoi
   obblighi, e ogni testata i suoi tipi: il calcio ha «partita» e
   «mercato», le notizie no. */

const TIPI = T.tipi;

const OBBLIGATORI = ['id', 'tipo', 'quando', 'unaRiga', 'titolo', 'occhiello',
                     'temi', 'area', 'fonti', 'confidenza'];

/* Solo il calcio dichiara la certezza. Là si pubblicano anche le voci di
   mercato — è metà del divertimento — ma il principio del progetto non
   cambia: non si finge mai una certezza che non si ha. Cambia solo come
   si applica. Una voce si può scrivere; non si può scrivere come se
   fosse un fatto. */
const CERTEZZE = T.certezze
  ? {
      valori:  T.certezze.valori,
      afferma: new RegExp(T.certezze.afferma.re, T.certezze.afferma.bandiere ?? 'i'),
      cautela: new RegExp(T.certezze.cautela.re, T.certezze.cautela.bandiere ?? 'i'),
      incerte: T.certezze.incerte ?? [],
    }
  : null;

const TEMI_AMMESSI = T.temi;
const AREE_AMMESSE = T.aree;
const ESITI = ['aperta', 'giusta', 'sbagliata', 'non_verificabile'];

const MAX_UNA_RIGA = 120;

/* §4: aggettivi che esprimono un giudizio invece di descrivere.
   Se il dato rende «forte» una crescita, il numero basta. */
const VALUTATIVI = T.valutativi;

/* §4: il titolo dice cosa è successo, non cosa devi provare. */
const TITOLO_MALATO = [
  { re: /\?\s*$/,                                   perche: 'titolo a domanda' },
  { re: /!/,                                        perche: 'punto esclamativo' },
  { re: /\b(ecco (perch|come)|vi spieghiamo|cosa sapere)\b/i, perche: 'formula da acchiappaclic' },
];

function conta(t) { return String(t ?? '').trim().split(/\s+/).filter(Boolean).length; }

/* ---------- 2. Controlli su un pezzo ------------------------ */

function controlla(p, { macro, idEsistenti, dossierEsistenti }) {
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

  const regole = TIPI[p.tipo];
  if (!regole) { E(`tipo sconosciuto: ${p.tipo}. Ammessi: ${Object.keys(TIPI).join(', ')}`); return { errori, avvisi }; }

  for (const c of regole.richiede) {
    if (!String(p[c] ?? '').trim()) E(`un pezzo di tipo «${p.tipo}» richiede il campo «${c}»`);
  }

  if (!/^\d{4}-\d{2}-\d{2}-\d{3}-[a-z0-9-]+$/.test(p.id)) E(`id fuori formato: ${p.id}`);
  if (isNaN(new Date(p.quando)))                            E(`data non valida: ${p.quando}`);
  if (!AREE_AMMESSE.includes(p.area))                       E(`area sconosciuta: ${p.area}`);
  for (const t of p.temi) if (!TEMI_AMMESSI.includes(t))    E(`tema sconosciuto: ${t}`);
  if (!['alta', 'media', 'bassa'].includes(p.confidenza))   E(`confidenza fuori scala: ${p.confidenza}`);

  /* Il primo livello di lettura: se non sta in una riga, non è una riga. */
  if (p.unaRiga.length > MAX_UNA_RIGA) E(`«unaRiga» è di ${p.unaRiga.length} caratteri, il massimo è ${MAX_UNA_RIGA}`);
  if (/\n/.test(p.unaRiga))            E('«unaRiga» contiene un a capo: deve essere una riga sola');

  /* §4 — lessico */
  for (const campo of ['unaRiga', 'titolo', 'occhiello', 'fatti', 'perche_conta']) {
    const trovati = String(p[campo] ?? '').match(VALUTATIVI);
    if (trovati) E(`«${campo}» contiene un giudizio non contenuto nel dato: ${[...new Set(trovati)].join(', ')}`);
  }
  for (const t of TITOLO_MALATO) if (t.re.test(p.titolo)) E(`titolo: ${t.perche}`);

  const parole = conta(p.fatti) + conta(p.perche_conta);
  const [min, max] = regole.parole;
  if (parole < min) A(`corpo di ${parole} parole: sotto le ${min} previste per «${p.tipo}»`);
  if (parole > max) A(`corpo di ${parole} parole: sopra le ${max} previste per «${p.tipo}», va tagliato (§4)`);

  /* §3 — fonti */
  const fonti = p.fonti ?? [];
  for (const f of fonti) {
    if (!f.url || !/^https?:\/\//.test(f.url)) E(`fonte senza url valido: ${f.titolo ?? f.testata ?? '?'}`);
    if (!['primaria', 'testata', 'analisi'].includes(f.tipo)) E(`fonte con tipo sconosciuto: ${f.tipo}`);
    if (typeof f.letto !== 'boolean') E(`la fonte «${f.testata}» non dichiara se è stata letta`);
  }
  const primarie = fonti.filter(f => f.tipo === 'primaria');
  const testate  = new Set(fonti.map(f => f.testata));
  const bastaUna = regole.ammette_primaria_sola && primarie.length > 0;
  if (!bastaUna && testate.size < regole.fonti_min) {
    E(`§3: ${testate.size} fonte/i indipendenti (${[...testate].join(', ')}). Per «${p.tipo}» ne servono ${regole.fonti_min}, o una primaria.`);
  }
  if (!fonti.some(f => f.letto)) {
    E('§3: nessuna fonte è stata letta per intero. I fatti non possono poggiare solo su titoli.');
  }

  /* §3 — i numeri contro macro.json */
  for (const n of p.numeri ?? []) {
    if (!n.quando) E(`il numero «${n.cosa}» è senza periodo di riferimento`);
    const serie = macro.find(s => s.id === n.serie);
    if (n.serie && !serie) E(`il numero «${n.cosa}» cita una serie inesistente: ${n.serie}`);
    if (serie) {
      const dichiarato = parseFloat(String(n.valore).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
      const vero = parseFloat(serie.valore);
      /* Se la serie è andata avanti dopo che il pezzo è uscito, il valore
         corrente non è più quello che il pezzo poteva citare: pretendere
         l'uguaglianza fa marcire l'archivio a ogni aggiornamento (il Brent
         cambia ogni sera) e spinge a riscrivere numeri dentro pezzi vecchi.
         Un pezzo già uscito tiene la sua cifra con la sua data (§3); il
         confronto vale solo per i pezzi scritti col dato corrente. */
      const serieAvanti = String(serie.periodo) > String(p.quando ?? '').slice(0, 10);
      if (!serieAvanti && isFinite(dichiarato) && isFinite(vero) && Math.abs(dichiarato - vero) > Math.max(0.05, Math.abs(vero) * 0.01)) {
        E(`«${n.cosa}»: dichiarato ${n.valore}, ma ${serie.fonte} dice ${serie.valore} (${serie.periodo}). Vince la fonte primaria.`);
      }
      if (serie.obsoleto) {
        const testo = `${p.fatti ?? ''} ${p.perche_conta ?? ''}`;
        const anno = String(serie.periodo).slice(0, 4);
        if (!testo.includes(anno) && !new RegExp(String(serie.periodo)).test(testo)) {
          E(`«${n.cosa}» è un dato di ${serie.periodo}, vecchio di ${serie.giorni_dal_dato} giorni: va citato con la sua data (§3).`);
        }
      }
    }
  }

  /* La certezza dichiarata, dove la testata la prevede. */
  if (CERTEZZE) {
    const c = p.certezza;
    if (!c) {
      E('manca il campo «certezza»: ogni pezzo deve dire quanto vale ciò che racconta');
    } else if (!CERTEZZE.valori.includes(c)) {
      E(`certezza sconosciuta: ${c}. Ammesse: ${CERTEZZE.valori.join(', ')}`);
    } else if (CERTEZZE.incerte.includes(c)) {
      /* Una trattativa o una voce non possono avere un titolo che
         afferma: chi scorre legge solo il titolo, e da lì deve capire
         che non è ancora successo niente. */
      if (CERTEZZE.afferma.test(p.titolo)) {
        E(`il pezzo è «${c}» ma il titolo afferma come se fosse fatto: riformulalo`);
      }
      if (!CERTEZZE.cautela.test(`${p.titolo} ${p.unaRiga}`)) {
        E(`il pezzo è «${c}» ma né il titolo né unaRiga lo dicono: chi scorre lo leggerebbe come un fatto`);
      }
      if (CERTEZZE.afferma.test(p.unaRiga)) {
        E(`il pezzo è «${c}» ma «unaRiga» afferma come se fosse fatto`);
      }
    }
  }

  /* §5 — catene e dossier */
  if (p.sviluppo_di && !idEsistenti.has(p.sviluppo_di)) E(`sviluppo_di punta a un pezzo che non esiste: ${p.sviluppo_di}`);
  if (p.sviluppo_di === p.id) E('sviluppo_di punta a sé stesso');
  if (p.dossier && !dossierEsistenti.has(p.dossier)) E(`dossier inesistente: ${p.dossier}`);

  /* La previsione: falsificabile, con una data e un modo di verificarla.
     Senza il «come si verifica» non è una previsione, è un auspicio. */
  const pr = p.previsione;
  if (pr) {
    if (!String(pr.afferma ?? '').trim())          E('la previsione non afferma niente');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pr.scade ?? '')) E(`la previsione ha una scadenza fuori formato: ${pr.scade}`);
    if (!String(pr.come_si_verifica ?? '').trim()) E('la previsione non dice come si verifica: senza, non è falsificabile');
    if (!ESITI.includes(pr.esito ?? 'aperta'))     E(`esito della previsione fuori scala: ${pr.esito}`);
    if (pr.esito && pr.esito !== 'aperta' && !pr.verificata_il) E('la previsione ha un esito ma non dice quando è stata verificata');
    if (/\b(potrebbe|forse|probabilmente|si vedrà|vedremo)\b/i.test(pr.afferma ?? '')) {
      A('la previsione è formulata al condizionale: una previsione che non si può sbagliare non serve');
    }
  }

  return { errori, avvisi };
}

/* ---------- 3. I link rispondono davvero? ------------------
   Un link protetto non è un link morto: le testate a pagamento
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
    if (r.status === 405) r = await fetch(url, opzioni);
    if (r.ok) return null;
    if (NON_ESISTE.has(r.status)) return { grave: true,  testo: `HTTP ${r.status}, l'indirizzo non esiste` };
    if (PROTETTO.has(r.status))   return { grave: false, testo: `HTTP ${r.status}, protetto: verifica a mano che l'indirizzo sia giusto` };
    return { grave: false, testo: `HTTP ${r.status}` };
  } catch (e) { return { grave: false, testo: `non raggiungibile (${e.message || e})` }; }
}

/* ---------- 4. Avvio ---------------------------------------- */

const salta = process.argv.includes('--senza-link');

const dirPezzi = T.percorsi.pezzi;
if (!existsSync(dirPezzi)) { console.log('Nessun pezzo da validare.'); process.exit(0); }

const file = (await readdir(dirPezzi)).filter(f => f.endsWith('.json')).sort();
if (!file.length) {
  /* Un indice vuoto è comunque un indice: senza, il sito non sa
     distinguere «nessun pezzo» da «file mancante», e mostra un errore
     dove dovrebbe dire semplicemente che non è ancora uscito niente. */
  await writeFile(T.percorsi.indice, JSON.stringify({
    aggiornato: new Date().toISOString(), testata: T.id, pezzi: [],
  }, null, 1));
  console.log(`[${T.id}] nessun pezzo ancora — indice vuoto scritto.`);
  process.exit(0);
}

const macroFile = path.join(T.percorsi.dati, 'macro.json');
const macro = existsSync(macroFile) ? JSON.parse(await readFile(macroFile, 'utf8')).serie.filter(s => !s.errore) : [];

const dirDossier = path.join(T.percorsi.dati, 'dossier');
const dossierEsistenti = new Set(existsSync(dirDossier)
  ? (await readdir(dirDossier)).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''))
  : []);

const pezzi = [];
for (const f of file) {
  try { pezzi.push({ file: f, dati: JSON.parse(await readFile(path.join(dirPezzi, f), 'utf8')) }); }
  catch (e) { console.log(`✗ ${f}: JSON illeggibile — ${e.message}`); }
}
const idEsistenti = new Set(pezzi.map(p => p.dati.id));

let buoni = 0, cattivi = 0;
const validi = [];

for (const { file: f, dati: p } of pezzi) {
  const { errori, avvisi } = controlla(p, { macro, idEsistenti, dossierEsistenti });

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
   silenzio. Il più recente in cima, ma i pezzi di uno stesso ciclo
   escono insieme e fra loro conta l'ordine in cui sono stati scritti:
   il numero progressivo nell'id è la scelta editoriale. */
if (!cattivi) {
  const indice = validi
    .sort((a, b) => String(b.quando).localeCompare(String(a.quando))
                 || String(a.id).localeCompare(String(b.id)))
    .map(p => ({
      id: p.id, tipo: p.tipo, quando: p.quando,
      ...(p.certezza ? { certezza: p.certezza } : {}),
      unaRiga: p.unaRiga, titolo: p.titolo, occhiello: p.occhiello,
      temi: p.temi, area: p.area, confidenza: p.confidenza,
      sviluppo_di: p.sviluppo_di ?? null,
      dossier: p.dossier ?? null,
      previsione: p.previsione ? { scade: p.previsione.scade, esito: p.previsione.esito ?? 'aperta' } : null,
      fonti: (p.fonti ?? []).length,
      parole: conta(p.fatti) + conta(p.perche_conta),
    }));
  await writeFile(T.percorsi.indice, JSON.stringify({
    aggiornato: new Date().toISOString(),
    testata: T.id,
    pezzi: indice,
  }, null, 1));
}

const perTipo = {};
for (const p of validi) perTipo[p.tipo] = (perTipo[p.tipo] ?? 0) + 1;
const riassunto = Object.entries(perTipo).map(([t, n]) => `${n} ${t}`).join(' · ');

console.log(`\n[${T.id}] ${buoni} validi${riassunto ? ` (${riassunto})` : ''}, ${cattivi} respinti${cattivi ? ' — indice non aggiornato' : ` — ${path.relative(BASE, T.percorsi.indice)} aggiornato`}`);
process.exit(cattivi ? 1 : 0);
