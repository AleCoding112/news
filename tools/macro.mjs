/* ============================================================
   News — i numeri veri
   Prende i dati dalle fonti statistiche primarie, non dalla
   parafrasi di un giornalista.

   La differenza pratica: invece di «l'inflazione resta alta»,
   «HICP area euro 2,0% a dicembre, dal 2,1% di novembre —
   Eurostat, serie prc_hicp_manr». Il secondo si può verificare.

   Ogni serie porta con sé il valore precedente: un numero senza
   il suo antecedente non dice se le cose stanno migliorando.
   Nessuna chiave, nessun account: tutte le fonti sono aperte.
   ============================================================ */

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI  = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.join(QUI, '..');
const TIMEOUT_MS = 20000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

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

async function eurostat({ dataset, filtri }) {
  const q = new URLSearchParams({ format: 'JSON', lastTimePeriod: '3', ...filtri });
  const d = await prendi(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${dataset}?${q}`);
  const indice = d?.dimension?.time?.category?.index ?? {};
  const perPosizione = Object.fromEntries(Object.entries(indice).map(([periodo, i]) => [String(i), periodo]));
  const punti = Object.entries(d.value ?? {})
    .map(([i, v]) => ({ periodo: perPosizione[i] ?? i, valore: v }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
  if (!punti.length) throw new Error('serie vuota: controlla i codici delle dimensioni');
  return punti;
}

/* ---------- 2. FRED (csv, senza chiave) --------------------- */

async function fred(serie) {
  const testo = await prendi(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${serie}`, 'testo');
  const righe = testo.trim().split('\n').slice(1)
    .map(r => r.split(','))
    .filter(([, v]) => v && v !== '.' && !isNaN(+v))
    .map(([periodo, v]) => ({ periodo, valore: +v }));
  if (!righe.length) throw new Error('serie vuota');
  return righe.slice(-3);
}

/* ---------- 3. BCE Data Portal ------------------------------ */

async function bce(chiave) {
  const d = await prendi(`https://data-api.ecb.europa.eu/service/data/${chiave}?lastNObservations=3&format=jsondata`);
  const serie = Object.values(d.dataSets[0].series)[0].observations;
  const periodi = d.structure.dimensions.observation[0].values.map(v => v.id);
  const punti = Object.entries(serie)
    .map(([i, v]) => ({ periodo: periodi[+i] ?? i, valore: v[0] }))
    .filter(p => p.valore != null)
    .sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)));
  if (!punti.length) throw new Error('serie vuota');
  return punti;
}

/* ---------- 4. Mercati -------------------------------------- */

/* Yahoo respinge sei richieste simultanee con un 429: vanno in fila,
   con una pausa fra l'una e l'altra. */
let codaMercati = Promise.resolve();
function inFila(lavoro) {
  const mio = codaMercati.then(() => new Promise(r => setTimeout(r, 1200))).then(lavoro);
  codaMercati = mio.catch(() => {});
  return mio;
}

async function mercato(simbolo) {
  return inFila(() => quotazione(simbolo));
}

/* Yahoo tiene il conto per host: quando query1 va in penalità,
   query2 risponde ancora. Provarli entrambi costa poco. */
const HOST_MERCATI = ['query2', 'query1'];

async function quotazione(simbolo) {
  let ultimo;
  for (const host of HOST_MERCATI) {
    try {
      return await leggiQuotazione(host, simbolo);
    } catch (e) {
      ultimo = e;
      if (!/429/.test(e.message)) throw e;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  throw ultimo;
}

async function leggiQuotazione(host, simbolo) {
  const d = await prendi(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=5d&interval=1d`, 'json', { anonimo: true });
  const m = d.chart.result[0].meta;
  const ora = m.regularMarketPrice;
  const prima = m.chartPreviousClose ?? m.previousClose;
  if (ora == null) throw new Error('nessuna quotazione');
  return [
    { periodo: 'chiusura precedente', valore: prima },
    { periodo: new Date((m.regularMarketTime ?? Date.now() / 1000) * 1000).toISOString().slice(0, 10), valore: ora },
  ];
}

/* ---------- 5. Che cosa vale la pena sapere ----------------
   Poche serie, quelle che spiegano il resto: il prezzo del denaro,
   quello dei beni, quanto lavoro c'è e quanto rischio prezzano i
   mercati. Aggiungerne va bene; toglierne pure. */

const SERIE = [
  { id: 'hicp-ea', freq: 'm',      cosa: 'Inflazione area euro (HICP)',      unita: '%', fonte: 'Eurostat prc_hicp_manr',  prendi: () => eurostat({ dataset: 'prc_hicp_manr', filtri: { geo: 'EA', coicop: 'CP00' } }) },
  { id: 'hicp-ea-core', freq: 'm', cosa: 'Inflazione core area euro',        unita: '%', fonte: 'Eurostat prc_hicp_manr',  prendi: () => eurostat({ dataset: 'prc_hicp_manr', filtri: { geo: 'EA', coicop: 'TOT_X_NRG_FOOD' } }) },
  { id: 'hicp-it', freq: 'm',      cosa: 'Inflazione Italia (HICP)',         unita: '%', fonte: 'Eurostat prc_hicp_manr',  prendi: () => eurostat({ dataset: 'prc_hicp_manr', filtri: { geo: 'IT', coicop: 'CP00' } }) },
  { id: 'pil-ea', freq: 't',       cosa: 'PIL area euro, trim. su trim.',    unita: '%', fonte: 'Eurostat namq_10_gdp',    prendi: () => eurostat({ dataset: 'namq_10_gdp',   filtri: { geo: 'EA20', unit: 'CLV_PCH_PRE', na_item: 'B1GQ', s_adj: 'SCA' } }) },
  { id: 'disocc-ue', freq: 'm',    cosa: 'Disoccupazione UE27',              unita: '%', fonte: 'Eurostat une_rt_m',       prendi: () => eurostat({ dataset: 'une_rt_m',      filtri: { geo: 'EU27_2020', unit: 'PC_ACT', s_adj: 'SA', age: 'TOTAL', sex: 'T' } }) },
  { id: 'disocc-it', freq: 'm',    cosa: 'Disoccupazione Italia',            unita: '%', fonte: 'Eurostat une_rt_m',       prendi: () => eurostat({ dataset: 'une_rt_m',      filtri: { geo: 'IT',        unit: 'PC_ACT', s_adj: 'SA', age: 'TOTAL', sex: 'T' } }) },

  { id: 'bce-mro', freq: 'g',      cosa: 'BCE, tasso di rifinanziamento',    unita: '%', fonte: 'BCE Data Portal',          prendi: () => bce('FM/D.U2.EUR.4F.KR.MRR_FR.LEV') },
  { id: 'bce-dfr', freq: 'g',      cosa: 'BCE, tasso sui depositi',          unita: '%', fonte: 'BCE Data Portal',          prendi: () => bce('FM/D.U2.EUR.4F.KR.DFR.LEV') },
  { id: 'btp-10a', freq: 'm',      cosa: 'Rendimento decennale Italia',      unita: '%', fonte: 'BCE Data Portal',          prendi: () => bce('IRS/M.IT.L.L40.CI.0000.EUR.N.Z') },
  { id: 'bund-10a', freq: 'm',     cosa: 'Rendimento decennale Germania',    unita: '%', fonte: 'BCE Data Portal',          prendi: () => bce('IRS/M.DE.L.L40.CI.0000.EUR.N.Z') },

  { id: 'cpi-usa', freq: 'm',      cosa: 'Inflazione USA (CPI)',             unita: '%', fonte: 'FRED CPIAUCSL',            prendi: () => fred('CPIAUCSL&transformation=pc1') },
  { id: 'cpi-usa-core', freq: 'm', cosa: 'Inflazione core sticky USA',       unita: '%', fonte: 'FRED CORESTICKM159SFRBATL',prendi: () => fred('CORESTICKM159SFRBATL') },
  { id: 'fed-funds', freq: 'g',    cosa: 'Fed funds effettivo',              unita: '%', fonte: 'FRED DFF',                 prendi: () => fred('DFF') },
  { id: 'disocc-usa', freq: 'm',   cosa: 'Disoccupazione USA',               unita: '%', fonte: 'FRED UNRATE',              prendi: () => fred('UNRATE') },
  { id: 'ust-10a', freq: 'g',      cosa: 'Treasury decennale',               unita: '%', fonte: 'FRED DGS10',               prendi: () => fred('DGS10') },
  { id: 'curva-usa', freq: 'g',    cosa: 'Curva USA, 10 anni meno 2 anni',   unita: 'pp',fonte: 'FRED T10Y2Y',              prendi: () => fred('T10Y2Y') },

  { id: 'sp500',        cosa: 'S&P 500',                          unita: 'pt',fonte: 'Yahoo Finance', mercato: true, prendi: () => mercato('^GSPC') },
  { id: 'stoxx50',      cosa: 'Euro Stoxx 50',                    unita: 'pt',fonte: 'Yahoo Finance', mercato: true, prendi: () => mercato('^STOXX50E') },
  { id: 'ftsemib',      cosa: 'FTSE MIB',                         unita: 'pt',fonte: 'Yahoo Finance', mercato: true, prendi: () => mercato('FTSEMIB.MI') },
  { id: 'eurusd',       cosa: 'Cambio euro/dollaro',              unita: '',  fonte: 'Yahoo Finance', mercato: true, prendi: () => mercato('EURUSD=X') },
  { id: 'brent',        cosa: 'Petrolio Brent',                   unita: '$', fonte: 'Yahoo Finance', mercato: true, prendi: () => mercato('BZ=F') },
  { id: 'oro',          cosa: 'Oro',                              unita: '$', fonte: 'Yahoo Finance', mercato: true, prendi: () => mercato('GC=F') },
];

/* ---------- 6. Raccolta ------------------------------------- */

const esiti = await Promise.all(SERIE.map(async (s) => {
  try {
    const punti = await s.prendi();
    const ultimo = punti.at(-1);
    const prima  = punti.at(-2);
    return {
      id: s.id, cosa: s.cosa, unita: s.unita, fonte: s.fonte,
      valore: ultimo.valore,
      periodo: ultimo.periodo,
      precedente: prima?.valore ?? null,
      periodo_precedente: prima?.periodo ?? null,
      variazione: prima ? +(ultimo.valore - prima.valore).toFixed(4) : null,
      mercato: s.mercato === true,
      errore: null,
    };
  } catch (e) {
    return { id: s.id, cosa: s.cosa, fonte: s.fonte, valore: null, errore: e.message || String(e) };
  }
}));

/* Un dato porta sempre il suo periodo di riferimento, ma il periodo da
   solo non basta: chi legge «inflazione 2,0%» non controlla la data.
   Se il dato è più vecchio di quanto la sua frequenza giustifichi, va
   marcato — così la linea editoriale può vietare di presentarlo come
   attuale invece di sperare che qualcuno se ne accorga. */
const GIORNI_TOLLERATI = { g: 6, m: 75, t: 190 };   // giornaliera, mensile, trimestrale

/* La frequenza la dichiara la serie, non la si indovina dall'etichetta:
   FRED scrive i mesi col primo giorno — «2026-07-01» è luglio intero,
   non il primo di luglio. Indovinare qui significa segnalare come
   vecchio di 52 giorni un dato uscito puntuale. */
function fineDelPeriodo(periodo, freq) {
  if (freq === 't') {
    const t = /^(\d{4})-Q(\d)/.exec(periodo);
    if (t) return new Date(Date.UTC(+t[1], +t[2] * 3, 0));
  }
  if (freq === 'm') {
    const m = /^(\d{4})-(\d{2})/.exec(periodo);       // vale sia 2026-07 sia 2026-07-01
    if (m) return new Date(Date.UTC(+m[1], +m[2], 0));
  }
  const d = new Date(periodo);
  return isNaN(d) ? null : d;
}

for (const e of esiti) {
  if (e.errore || e.mercato || !e.periodo) continue;
  const f = e.freq ?? SERIE.find(x => x.id === e.id)?.freq;
  const fine = f && fineDelPeriodo(String(e.periodo), f);
  if (!f || !fine) continue;
  const giorni = Math.floor((Date.now() - fine.getTime()) / 86400000);
  e.giorni_dal_dato = giorni;
  e.obsoleto = giorni > GIORNI_TOLLERATI[f];
}

/* Lo spread è la differenza fra due serie: si calcola qui invece di
   chiederlo, perché nessuno lo pubblica già fatto. */
const btp  = esiti.find(e => e.id === 'btp-10a');
const bund = esiti.find(e => e.id === 'bund-10a');
if (btp?.valore != null && bund?.valore != null) {
  esiti.push({
    id: 'spread-btp-bund',
    freq: 'm',
    cosa: 'Spread BTP-Bund',
    unita: 'pb',
    fonte: 'calcolato su BCE Data Portal',
    valore: Math.round((btp.valore - bund.valore) * 100),
    periodo: btp.periodo,
    precedente: (btp.precedente != null && bund.precedente != null) ? Math.round((btp.precedente - bund.precedente) * 100) : null,
    periodo_precedente: btp.periodo_precedente,
    variazione: null,
    mercato: false,
    errore: null,
  });
  const s = esiti.at(-1);
  if (s.precedente != null) s.variazione = s.valore - s.precedente;
}

const riusciti = esiti.filter(e => !e.errore);
const falliti  = esiti.filter(e =>  e.errore);

if (!existsSync(path.join(BASE, 'dati'))) await mkdir(path.join(BASE, 'dati'), { recursive: true });
await writeFile(path.join(BASE, 'dati', 'macro.json'), JSON.stringify({
  aggiornato: new Date().toISOString(),
  nota: 'Valori dalle fonti statistiche primarie. Il periodo è quello di riferimento del dato, non quello dello scaricamento. Una serie con obsoleto:true non va presentata come fotografia dell oggi: si cita con la sua data, o non si cita.',
  serie: esiti,
}, null, 1));

console.log(`${riusciti.length}/${esiti.length} serie → dati/macro.json`);
for (const e of riusciti) {
  const v = e.mercato ? e.valore.toLocaleString('it-IT', { maximumFractionDigits: 2 }) : e.valore;
  const d = e.variazione == null ? '' : `  (${e.variazione > 0 ? '+' : ''}${e.variazione}${e.unita === 'pb' ? ' pb' : ''} da ${e.periodo_precedente})`;
  const vecchio = e.obsoleto ? `  ⚠ vecchio di ${e.giorni_dal_dato} giorni` : '';
  console.log(`  ${e.cosa.padEnd(36)} ${String(v).padStart(10)} ${(e.unita || '').padEnd(3)} ${e.periodo}${d}${vecchio}`);
}
if (falliti.length) {
  console.log('\nNon riuscite:');
  for (const e of falliti) console.log(`  ${e.id.padEnd(18)} ${e.errore}`);
}
