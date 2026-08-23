/* ============================================================
   News — i numeri veri
   Prende i dati dalle fonti statistiche primarie, non dalla
   parafrasi di un giornalista.

   La differenza pratica: invece di «l'inflazione resta alta»,
   «HICP area euro 2,0% a dicembre, dal 2,1% di novembre —
   Eurostat, serie prc_hicp_manr». Il secondo si può verificare.

   Ogni serie porta due cose oltre al valore. Il precedente, perché
   un numero senza il suo antecedente non dice se le cose stiano
   migliorando. E la sua storia, perché «3,3%» non significa niente
   finché non sai che la media del decennio è 2,6% e il picco fu
   9,1% nel 2022. Nessuna chiave, nessun account: fonti aperte.
   ============================================================ */

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI  = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.join(QUI, '..');
const TIMEOUT_MS = 20000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

const ANNI_STORIA  = 10;   // finestra su cui si misurano media e percentile
const PUNTI_GRAFICO = 120; // quanti punti bastano a disegnare una micro-serie

/* Le intestazioni non sono sempre un vantaggio: Eurostat e la BCE
   servono chiunque, mentre Yahoo risponde 429 proprio a chi si
   presenta con uno User-Agent da browser e 200 a chi non dice
   niente. Quindi si chiede in silenzio, dove serve. */
async function prendi(url, come = 'json', { anonimo = false } = {}) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: anonimo ? {} : { 'User-Agent': UA },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return come === 'json' ? r.json() : r.text();
}

/* ---------- 1. Eurostat (JSON-stat) -------------------------
   I valori arrivano indicizzati per posizione, non per periodo:
   l'indice del tempo va ricostruito a parte. Attenzione ai codici
   geografici, che cambiano da dataset a dataset — la disoccupazione
   non conosce «EA20», vuole «EU27_2020». */

async function eurostat({ dataset, filtri, quanti = 3 }) {
  const q = new URLSearchParams({ format: 'JSON', lastTimePeriod: String(quanti), ...filtri });
  const d = await prendi(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${dataset}?${q}`);
  const indice = d?.dimension?.time?.category?.index ?? {};
  const perPosizione = Object.fromEntries(Object.entries(indice).map(([periodo, i]) => [String(i), periodo]));
  const punti = Object.entries(d.value ?? {})
    .map(([i, v]) => ({ periodo: perPosizione[i] ?? i, valore: v }))
    .filter(p => p.valore != null)
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
  if (!punti.length) throw new Error('serie vuota: controlla i codici delle dimensioni');
  return punti;
}

/* ---------- 2. FRED (csv, senza chiave) ---------------------
   Restituisce sempre tutta la storia disponibile: sono poche decine
   di kilobyte e permettono di dire da quanto un valore non era così. */

async function fred(serie) {
  const testo = await prendi(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${serie}`, 'testo');
  const righe = testo.trim().split('\n').slice(1)
    .map(r => r.split(','))
    .filter(([, v]) => v && v !== '.' && !isNaN(+v))
    .map(([periodo, v]) => ({ periodo, valore: +v }));
  if (!righe.length) throw new Error('serie vuota');
  return righe;
}

/* ---------- 3. BCE Data Portal ------------------------------ */

async function bce(chiave, quanti = 3) {
  const d = await prendi(`https://data-api.ecb.europa.eu/service/data/${chiave}?lastNObservations=${quanti}&format=jsondata`);
  const serie = Object.values(d.dataSets[0].series)[0].observations;
  const periodi = d.structure.dimensions.observation[0].values.map(v => v.id);
  const punti = Object.entries(serie)
    .map(([i, v]) => ({ periodo: periodi[+i] ?? i, valore: v[0] }))
    .filter(p => p.valore != null)
    .sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)));
  if (!punti.length) throw new Error('serie vuota');
  return punti;
}

/* ---------- 4. Mercati --------------------------------------
   Yahoo tiene il conto per host: quando query1 va in penalità,
   query2 risponde ancora. E respinge sei richieste simultanee con
   un 429, quindi vanno in fila con una pausa fra l'una e l'altra. */

const HOST_MERCATI = ['query2', 'query1'];
let codaMercati = Promise.resolve();

function inFila(lavoro) {
  const mio = codaMercati.then(() => new Promise(r => setTimeout(r, 1200))).then(lavoro);
  codaMercati = mio.catch(() => {});
  return mio;
}

async function mercato(simbolo) {
  return inFila(async () => {
    let ultimo;
    for (const host of HOST_MERCATI) {
      try { return await leggiQuotazione(host, simbolo); }
      catch (e) {
        ultimo = e;
        if (!/429/.test(e.message)) throw e;
        await new Promise(r => setTimeout(r, 1500));
      }
    }
    throw ultimo;
  });
}

async function leggiQuotazione(host, simbolo) {
  /* Dieci anni a passo giornaliero: servono sia per la variazione di
     ieri sia perché la media decennale sia davvero decennale. Con un
     anno solo, dire «95° percentile del decennio» sarebbe falso. */
  const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=10y&interval=1d`;
  const d = await prendi(url, 'json', { anonimo: true });
  const r = d.chart.result[0];
  const chiusure = r.indicators?.quote?.[0]?.close ?? [];
  const tempi = r.timestamp ?? [];

  const punti = [];
  for (let i = 0; i < chiusure.length; i++) {
    if (chiusure[i] == null) continue;
    punti.push({ periodo: new Date(tempi[i] * 1000).toISOString().slice(0, 10), valore: chiusure[i] });
  }
  if (!punti.length) throw new Error('nessuna quotazione');
  return punti;
}

/* ---------- 5. La storia di una serie -----------------------
   Un numero da solo non informa. Sapere che sta al settantunesimo
   percentile del decennio, e quanto dista dal picco, lo trasforma
   in un'informazione. La finestra è decennale perché è l'orizzonte
   su cui un lettore ha memoria diretta; il massimo di sempre si
   riporta a parte quando è fuori da quella finestra. */

function anniFa(periodo, anni) {
  const a = parseInt(String(periodo).slice(0, 4), 10);
  return isNaN(a) ? null : a - anni;
}

/* Yahoo restituisce prezzi con dodici decimali. Tenerli darebbe
   l'impressione di una precisione che non esiste: due cifre bastano
   per un indice, quattro per un cambio. */
function arrotonda(v) {
  const a = Math.abs(v);
  if (a >= 1000) return Math.round(v);
  if (a >= 10)   return +v.toFixed(2);
  if (a >= 1)    return +v.toFixed(3);
  return +v.toFixed(4);
}

function storia(punti) {
  if (punti.length < 8) return null;

  const ultimo = punti.at(-1);
  const soglia = anniFa(ultimo.periodo, ANNI_STORIA);
  const dentro = soglia == null ? punti
    : punti.filter(p => parseInt(String(p.periodo).slice(0, 4), 10) >= soglia);
  if (dentro.length < 8) return null;

  const valori = dentro.map(p => p.valore);
  const media = valori.reduce((a, b) => a + b, 0) / valori.length;
  const sotto = valori.filter(v => v < ultimo.valore).length;

  const min = dentro.reduce((a, b) => (b.valore < a.valore ? b : a));
  const max = dentro.reduce((a, b) => (b.valore > a.valore ? b : a));
  const maxSempre = punti.reduce((a, b) => (b.valore > a.valore ? b : a));

  /* Per il disegno bastano centoventi punti: si campiona a passo
     costante invece di tenere solo la coda, così la forma resta. */
  const passo = Math.max(1, Math.ceil(dentro.length / PUNTI_GRAFICO));
  const grafico = dentro.filter((_, i) => i % passo === 0).map(p => arrotonda(p.valore));
  if (grafico.at(-1) !== arrotonda(ultimo.valore)) grafico.push(arrotonda(ultimo.valore));

  /* Gli anni si contano sui dati che ci sono, non su quelli che
     avremmo voluto: una serie nata da tre anni non ha una media
     decennale, e dichiararla sarebbe una bugia comoda. */
  const primoAnno  = parseInt(String(dentro[0].periodo).slice(0, 4), 10);
  const ultimoAnno = parseInt(String(ultimo.periodo).slice(0, 4), 10);
  const anni = Math.max(1, ultimoAnno - primoAnno);

  return {
    anni,
    da: dentro[0].periodo,
    a: ultimo.periodo,
    media: arrotonda(media),
    percentile: Math.round((sotto / valori.length) * 100),
    min: { valore: arrotonda(min.valore), quando: min.periodo },
    max: { valore: arrotonda(max.valore), quando: max.periodo },
    ...(maxSempre.periodo !== max.periodo ? { max_di_sempre: { valore: arrotonda(maxSempre.valore), quando: maxSempre.periodo } } : {}),
    punti: grafico,
  };
}

/* ---------- 6. Che cosa vale la pena sapere ----------------
   Poche serie, quelle che spiegano il resto: il prezzo del denaro,
   quello dei beni, quanto lavoro c'è e quanto rischio prezzano i
   mercati. `striscia` marca le undici che stanno in cima al sito;
   le altre restano qui, citabili nei pezzi. */

const SERIE = [
  { id: 'bce-dfr',      breve: 'BCE depositi', freq: 'g', striscia: 1,  cosa: 'BCE, tasso sui depositi',        unita: '%', fonte: 'BCE Data Portal',            prendi: () => bce('FM/D.U2.EUR.4F.KR.DFR.LEV', 2600) },
  { id: 'fed-iorb',     breve: 'Fed riserve', freq: 'g', striscia: 2,  cosa: 'Fed, interesse sulle riserve',   unita: '%', fonte: 'FRED IORB',                  prendi: () => fred('IORB') },
  { id: 'hicp-ea',      breve: 'Inflazione €', freq: 'm', striscia: 3,  cosa: 'Inflazione area euro (HICP)',    unita: '%', fonte: 'Eurostat prc_hicp_manr',     prendi: () => eurostat({ dataset: 'prc_hicp_manr', filtri: { geo: 'EA', coicop: 'CP00' }, quanti: 140 }) },
  { id: 'cpi-usa',      breve: 'Inflazione USA', freq: 'm', striscia: 4,  cosa: 'Inflazione USA (CPI)',           unita: '%', fonte: 'FRED CPIAUCSL',              prendi: () => fred('CPIAUCSL&transformation=pc1') },
  { id: 'btp-10a',      breve: 'BTP 10a', freq: 'm', striscia: 5,  cosa: 'BTP a 10 anni',                  unita: '%', fonte: 'BCE Data Portal',            prendi: () => bce('IRS/M.IT.L.L40.CI.0000.EUR.N.Z', 140) },
  { id: 'bund-10a',     breve: 'Bund 10a', freq: 'm', striscia: 6,  cosa: 'Bund a 10 anni',                 unita: '%', fonte: 'BCE Data Portal',            prendi: () => bce('IRS/M.DE.L.L40.CI.0000.EUR.N.Z', 140) },
  { id: 'america',      breve: 'America', freq: 'g', striscia: 7,  cosa: 'America',                        unita: 'pt', mercato: true, fonte: 'Yahoo Finance · S&P 500',                  prendi: () => mercato('^GSPC') },
  { id: 'sviluppati',   breve: 'Svil. ex-USA', freq: 'g', striscia: 8,  cosa: 'Sviluppati ex-America',          unita: 'pt', mercato: true, fonte: 'Yahoo Finance · MSCI World ex USA (IDEV)', prendi: () => mercato('IDEV') },
  { id: 'emergenti',    breve: 'Emergenti', freq: 'g', striscia: 9,  cosa: 'Emergenti',                      unita: 'pt', mercato: true, fonte: 'Yahoo Finance · MSCI EM IMI (IEMG)',       prendi: () => mercato('IEMG') },
  { id: 'eurusd',       breve: 'Euro/dollaro', freq: 'g', striscia: 10, cosa: 'Euro/dollaro',                   unita: '',   mercato: true, fonte: 'Yahoo Finance',                            prendi: () => mercato('EURUSD=X') },
  { id: 'brent',        breve: 'Brent', freq: 'g', striscia: 11, cosa: 'Petrolio Brent',                 unita: '$',  mercato: true, fonte: 'Yahoo Finance',                            prendi: () => mercato('BZ=F') },

  /* Fuori dalla striscia, ma citabili nei pezzi. */
  { id: 'hicp-ea-core', freq: 'm', cosa: 'Inflazione core area euro',      unita: '%', fonte: 'Eurostat prc_hicp_manr',      prendi: () => eurostat({ dataset: 'prc_hicp_manr', filtri: { geo: 'EA', coicop: 'TOT_X_NRG_FOOD' }, quanti: 140 }) },
  { id: 'hicp-it',      freq: 'm', cosa: 'Inflazione Italia (HICP)',       unita: '%', fonte: 'Eurostat prc_hicp_manr',      prendi: () => eurostat({ dataset: 'prc_hicp_manr', filtri: { geo: 'IT', coicop: 'CP00' }, quanti: 140 }) },
  { id: 'pil-ea',       freq: 't', cosa: 'PIL area euro, trim. su trim.',  unita: '%', fonte: 'Eurostat namq_10_gdp',        prendi: () => eurostat({ dataset: 'namq_10_gdp', filtri: { geo: 'EA20', unit: 'CLV_PCH_PRE', na_item: 'B1GQ', s_adj: 'SCA' }, quanti: 48 }) },
  { id: 'disocc-ue',    freq: 'm', cosa: 'Disoccupazione UE27',            unita: '%', fonte: 'Eurostat une_rt_m',           prendi: () => eurostat({ dataset: 'une_rt_m', filtri: { geo: 'EU27_2020', unit: 'PC_ACT', s_adj: 'SA', age: 'TOTAL', sex: 'T' }, quanti: 140 }) },
  { id: 'disocc-it',    freq: 'm', cosa: 'Disoccupazione Italia',          unita: '%', fonte: 'Eurostat une_rt_m',           prendi: () => eurostat({ dataset: 'une_rt_m', filtri: { geo: 'IT', unit: 'PC_ACT', s_adj: 'SA', age: 'TOTAL', sex: 'T' }, quanti: 140 }) },
  { id: 'bce-mro',      freq: 'g', cosa: 'BCE, tasso di rifinanziamento',  unita: '%', fonte: 'BCE Data Portal',             prendi: () => bce('FM/D.U2.EUR.4F.KR.MRR_FR.LEV', 2600) },
  { id: 'cpi-usa-core', freq: 'm', cosa: 'Inflazione core sticky USA',     unita: '%', fonte: 'FRED CORESTICKM159SFRBATL',   prendi: () => fred('CORESTICKM159SFRBATL') },
  { id: 'fed-funds',    freq: 'g', cosa: 'Fed funds effettivo',            unita: '%', fonte: 'FRED DFF',                    prendi: () => fred('DFF') },
  { id: 'disocc-usa',   freq: 'm', cosa: 'Disoccupazione USA',             unita: '%', fonte: 'FRED UNRATE',                 prendi: () => fred('UNRATE') },
  { id: 'ust-10a',      freq: 'g', cosa: 'Treasury a 10 anni',             unita: '%', fonte: 'FRED DGS10',                  prendi: () => fred('DGS10') },
  { id: 'curva-usa',    freq: 'g', cosa: 'Curva USA, 10 anni meno 2 anni', unita: 'pp',fonte: 'FRED T10Y2Y',                 prendi: () => fred('T10Y2Y') },
  { id: 'ftsemib',      freq: 'g', cosa: 'FTSE MIB',                       unita: 'pt', mercato: true, fonte: 'Yahoo Finance', prendi: () => mercato('FTSEMIB.MI') },
  { id: 'stoxx50',      freq: 'g', cosa: 'Euro Stoxx 50',                  unita: 'pt', mercato: true, fonte: 'Yahoo Finance', prendi: () => mercato('^STOXX50E') },
  { id: 'oro',          freq: 'g', cosa: 'Oro',                            unita: '$',  mercato: true, fonte: 'Yahoo Finance', prendi: () => mercato('GC=F') },
];

/* ---------- 7. Raccolta ------------------------------------- */

const esiti = await Promise.all(SERIE.map(async (s) => {
  try {
    const punti = await s.prendi();
    const ultimo = punti.at(-1);
    const prima  = punti.at(-2);
    return {
      id: s.id, cosa: s.cosa, breve: s.breve ?? s.cosa, unita: s.unita, fonte: s.fonte, freq: s.freq,
      striscia: s.striscia ?? null,
      valore: s.mercato ? arrotonda(ultimo.valore) : ultimo.valore,
      periodo: ultimo.periodo,
      precedente: prima ? (s.mercato ? arrotonda(prima.valore) : prima.valore) : null,
      periodo_precedente: prima?.periodo ?? null,
      variazione: prima ? +(ultimo.valore - prima.valore).toFixed(4) : null,
      mercato: s.mercato === true,
      storia: storia(punti),
      errore: null,
    };
  } catch (e) {
    return { id: s.id, cosa: s.cosa, fonte: s.fonte, valore: null, errore: e.message || String(e) };
  }
}));

/* Lo spread è la differenza fra due serie: si calcola qui invece di
   chiederlo, perché nessuno lo pubblica già fatto. */
const btp  = esiti.find(e => e.id === 'btp-10a');
const bund = esiti.find(e => e.id === 'bund-10a');
if (btp?.valore != null && bund?.valore != null) {
  const precedente = (btp.precedente != null && bund.precedente != null)
    ? Math.round((btp.precedente - bund.precedente) * 100) : null;
  const valore = Math.round((btp.valore - bund.valore) * 100);
  esiti.push({
    id: 'spread-btp-bund', freq: 'm', striscia: null,
    cosa: 'Spread BTP-Bund', unita: 'pb', fonte: 'calcolato su BCE Data Portal',
    valore, periodo: btp.periodo,
    precedente, periodo_precedente: btp.periodo_precedente,
    variazione: precedente == null ? null : valore - precedente,
    mercato: false, storia: null, errore: null,
  });
}

/* ---------- 8. Quanto è vecchio il dato --------------------
   Un dato porta sempre il suo periodo di riferimento, ma il periodo
   da solo non basta: chi legge «inflazione 2,0%» non controlla la
   data. Se il dato è più vecchio di quanto la sua frequenza
   giustifichi va marcato, così la linea editoriale può vietare di
   presentarlo come attuale invece di sperare che qualcuno se ne
   accorga. La frequenza la dichiara la serie: FRED scrive i mesi
   col primo giorno, e indovinarlo significherebbe segnalare come
   vecchio di cinquanta giorni un dato uscito puntuale. */

const GIORNI_TOLLERATI = { g: 6, m: 75, t: 190 };

function fineDelPeriodo(periodo, freq) {
  if (freq === 't') {
    const t = /^(\d{4})-Q(\d)/.exec(periodo);
    if (t) return new Date(Date.UTC(+t[1], +t[2] * 3, 0));
  }
  if (freq === 'm') {
    const m = /^(\d{4})-(\d{2})/.exec(periodo);        // vale sia 2026-07 sia 2026-07-01
    if (m) return new Date(Date.UTC(+m[1], +m[2], 0));
  }
  const d = new Date(periodo);
  return isNaN(d) ? null : d;
}

for (const e of esiti) {
  if (e.errore || e.mercato || !e.periodo || !e.freq) continue;
  const fine = fineDelPeriodo(String(e.periodo), e.freq);
  if (!fine) continue;
  e.giorni_dal_dato = Math.floor((Date.now() - fine.getTime()) / 86400000);
  e.obsoleto = e.giorni_dal_dato > GIORNI_TOLLERATI[e.freq];
}

/* ---------- 9. Scrittura ------------------------------------ */

const riusciti = esiti.filter(e => !e.errore);
const falliti  = esiti.filter(e =>  e.errore);

if (!existsSync(path.join(BASE, 'dati'))) await mkdir(path.join(BASE, 'dati'), { recursive: true });
await writeFile(path.join(BASE, 'dati', 'macro.json'), JSON.stringify({
  aggiornato: new Date().toISOString(),
  nota: 'Valori dalle fonti statistiche primarie. Il periodo è quello di riferimento del dato, non quello dello scaricamento. Una serie con obsoleto:true non va presentata come fotografia dell oggi: si cita con la sua data, o non si cita. Il blocco storia misura gli ultimi dieci anni.',
  serie: esiti,
}, null, 1));

console.log(`${riusciti.length}/${esiti.length} serie → dati/macro.json`);
for (const e of riusciti.sort((a, b) => (a.striscia ?? 99) - (b.striscia ?? 99))) {
  const v = e.mercato ? e.valore.toLocaleString('it-IT', { maximumFractionDigits: 2 }) : e.valore;
  const d = e.variazione == null ? '' : `  (${e.variazione > 0 ? '+' : ''}${e.variazione}${e.unita === 'pb' ? ' pb' : ''})`;
  const vecchio = e.obsoleto ? `  ⚠ ${e.giorni_dal_dato}g` : '';
  const st = e.storia ? `  ${e.storia.anni}a: media ${e.storia.media} · ${e.storia.percentile}° perc · max ${e.storia.max.valore} (${e.storia.max.quando})` : '';
  console.log(`  ${(e.striscia ? String(e.striscia).padStart(2) + '·' : '   ')} ${e.cosa.padEnd(32)} ${String(v).padStart(10)} ${(e.unita || '').padEnd(2)} ${String(e.periodo).padEnd(11)}${d}${vecchio}${st}`);
}
if (falliti.length) {
  console.log('\nNon riuscite:');
  for (const e of falliti) console.log(`  ${e.id.padEnd(18)} ${e.errore}`);
}
