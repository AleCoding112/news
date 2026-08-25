/* ============================================================
   News — raccolta
   Scarica tutti i feed di fonti.json, normalizza, deduplica e
   scrive un'istantanea in grezzo/.

   Nessun LLM e nessuna dipendenza: così questo passo può girare
   anche su GitHub Actions a Mac spento, e quando il Mac si
   accende le ultime ore sono già lì.
   ============================================================ */

import { readFile, writeFile, readdir, unlink, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { caricaTestata, caricaFonti, BASE } from './testata.mjs';

const T = await caricaTestata();

/* ---------- 1. Costanti ------------------------------------ */

const PARALLELE   = 8;      // feed scaricati insieme: oltre, qualcuno inizia a rifiutare
const TIMEOUT_MS  = 15000;
const TENTATIVI   = 2;      // un feed che fallisce spesso è solo lento, non morto
const GIORNI_GREZZO = 7;    // dopo, l'istantanea non serve più a nessuno
const MAX_SOMMARIO  = 1200; // caratteri: oltre è l'articolo intero, non un sommario

/* La finestra compatta è ciò che gira su GitHub Actions e finisce nel
   repo. Un'istantanea intera pesa un megabyte: committerla ogni ora
   significherebbe gonfiare la cronologia per sempre di dati che dopo
   due giorni non servono più. Qui il sommario si accorcia e resta solo
   quel che serve a raggruppare — il testo pieno degli articoli scelti
   si va a prendere al momento, che è l'unico in cui serve davvero. */
const ORE_FINESTRA_COMPATTA = 48;
const MAX_SOMMARIO_COMPATTO = 220;

/* Diversi feed rifiutano le richieste senza un'intestazione da browser:
   Il Post, ISTAT e Sole 24 Ore rispondono 403 a un client anonimo. */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

/* Parametri che servono solo a chi misura il traffico: due URL che
   differiscono solo per questi sono lo stesso articolo. */
const TRACCIANTI = /^(utm_|at_|ns_|cmp|CMP|ito|fbclid|gclid|mc_cid|mc_eid|ref|source|smid|partner)/;

/* ---------- 2. Lettura dell'XML -----------------------------
   Un parser vero sarebbe una dipendenza; per RSS 2.0, RDF e Atom
   bastano poche espressioni regolari, purché gestiscano il CDATA:
   BBC, Sole 24 Ore, Fed e Il Post lo usano, e un parser ingenuo
   su di loro restituisce campi vuoti. */

const ENTITA = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  laquo: '«', raquo: '»', hellip: '…', mdash: '—', ndash: '–',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', euro: '€',
};

function decodifica(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g,          (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi,       (_, n) => ENTITA[n.toLowerCase()] ?? `&${n};`);
}

/* Il testo utile di un tag, che sia in CDATA o no. */
function tag(xml, nome) {
  const re = new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, 'i');
  const m  = re.exec(xml);
  if (!m) return '';
  let v = m[1].trim();
  const cd = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(v);
  if (cd) v = cd[1];
  return decodifica(v).trim();
}

/* Atom mette il link in un attributo, non nel corpo del tag. */
function linkDi(xml) {
  const diretto = tag(xml, 'link');
  if (diretto && /^https?:/i.test(diretto)) return diretto;
  const alt = /<link[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["']/i.exec(xml)
           || /<link[^>]*\bhref=["']([^"']+)["']/i.exec(xml);
  if (alt) return decodifica(alt[1]);
  const guid = tag(xml, 'guid');
  return /^https?:/i.test(guid) ? guid : '';
}

function senzaHtml(s) {
  return decodifica(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function normalizzaUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    for (const k of [...url.searchParams.keys()]) {
      if (TRACCIANTI.test(k)) url.searchParams.delete(k);
    }
    url.hostname = url.hostname.replace(/^www\./, '').toLowerCase();
    return url.toString();
  } catch { return u; }
}

/* Due formati che `new Date()` non digerisce e che costavano feed interi:
   Sky Italia scrive «dom, 23 ago 2026 18:30:00 GMT» — giorno e mese in
   italiano — e Sky UK chiude con «BST», sigla che V8 non riconosce. In
   entrambi i casi la data restava nulla, e un articolo senza data veniva
   scartato dalla finestra: centoventi articoli al giro che non entravano
   mai nel giornale, senza che niente lo segnalasse. */
const MESI_FEED = { gen: 'Jan', feb: 'Feb', mar: 'Mar', apr: 'Apr', mag: 'May', giu: 'Jun',
                    lug: 'Jul', ago: 'Aug', set: 'Sep', ott: 'Oct', nov: 'Nov', dic: 'Dec' };
const FUSI_FEED = { BST: '+0100', CET: '+0100', CEST: '+0200', EST: '-0500', EDT: '-0400',
                    PST: '-0800', PDT: '-0700', IST: '+0530', JST: '+0900' };

function quando(xml) {
  const grezza = tag(xml, 'pubDate') || tag(xml, 'dc:date')
              || tag(xml, 'published') || tag(xml, 'updated') || tag(xml, 'date');
  if (!grezza) return null;
  let d = new Date(grezza);
  if (isNaN(d)) {
    const tradotta = String(grezza).trim()
      .replace(/^[\p{L}]{2,4},\s*/u, '')                                  // via il giorno della settimana
      .replace(/\b([\p{L}]{3})\b/u, m => MESI_FEED[m.toLowerCase()] ?? m) // il mese in inglese
      .replace(/\b([A-Z]{2,4})$/, f => FUSI_FEED[f] ?? f);                 // il fuso come scarto numerico
    d = new Date(tradotta);
  }
  return isNaN(d) ? null : d.toISOString();
}

/* Estrae gli elementi di un feed, qualunque dialetto usi.
   RDF (Deutsche Welle) tiene gli <item> fuori dal <channel>. */
function elementi(xml) {
  const blocchi = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) || [];
  return blocchi;
}

function leggiFeed(xml, fonte) {
  const fuori = [];
  for (const blocco of elementi(xml)) {
    const titolo = tag(blocco, 'title');
    const url    = linkDi(blocco);
    if (!titolo || !url) continue;

    const sommario = senzaHtml(
      tag(blocco, 'description') || tag(blocco, 'summary') || tag(blocco, 'content:encoded') || tag(blocco, 'content')
    ).slice(0, MAX_SOMMARIO);

    fuori.push({
      titolo,
      sommario,
      url:      normalizzaUrl(url),
      quando:   quando(blocco),
      fonte:    fonte.id,
      testata:  fonte.nome,
      tipo:     fonte.tipo,
      peso:     fonte.peso,
      area:     fonte.area,
      lingua:   fonte.lingua,
      temi:     fonte.temi ?? [],
      paywall:  fonte.paywall === true,
      nel_perimetro: fonte.nel_perimetro === true,
    });
  }
  return fuori;
}

/* ---------- 2b. I comunicati della Provincia ----------------
   L'ufficio stampa provinciale non offre un feed (ricontrollato il
   25 agosto 2026: /rss e /feed rispondono 404, la home non dichiara
   alternative). Ma chi delibera è la fonte primaria per definizione,
   e la pagina dei comunicati è regolare: una scheda per comunicato,
   con data, titolo e sommario. Si legge quella. Se il markup cambia,
   il parser non trova niente e la fonte esce a zero voci: se ne
   accorge il controllo di freschezza, non un lettore umano. */

const MESI_IT = {
  gennaio: '01', febbraio: '02', marzo: '03', aprile: '04',
  maggio: '05', giugno: '06', luglio: '07', agosto: '08',
  settembre: '09', ottobre: '10', novembre: '11', dicembre: '12',
};

function leggiComunicatiPat(html, fonte) {
  const fuori = [];
  /* Una scheda per comunicato; il taglio a 2500 caratteri impedisce a
     una scheda senza sommario di mangiarsi la successiva. */
  for (const scheda of String(html).split('<div class="card-content">').slice(1).map(s => s.slice(0, 2500))) {
    const link = /<a href="(https?:\/\/[^"]*\/Comunicati\/[^"]+)"[^>]*title="([^"]+)"/i.exec(scheda);
    if (!link) continue;
    const data  = /class="card-meta">\s*[^,<]*,\s*(\d{1,2})\s+([\p{L}]+)\s+(\d{4})/iu.exec(scheda);
    const sunto = /<p class="abstract">([\s\S]*?)<\/p>/i.exec(scheda);
    /* La lista dà solo il giorno: mezzogiorno locale è il compromesso
       che tiene il comunicato nella finestra senza fingere un'ora. */
    const mese = data && MESI_IT[data[2].toLowerCase()];
    const q = mese ? new Date(`${data[3]}-${mese}-${data[1].padStart(2, '0')}T12:00:00+02:00`) : null;
    fuori.push({
      titolo:   decodifica(link[2]).trim(),
      sommario: senzaHtml(sunto ? sunto[1] : '').slice(0, MAX_SOMMARIO),
      /* Niente normalizzazione: il certificato del sito vale solo col
         `www.`, e togliendolo (come fa normalizzaUrl) il link muore.
         L'URL che il sito scrive di sé è già canonico. */
      url:      decodifica(link[1]),
      quando:   q && !isNaN(q) ? q.toISOString() : null,
      fonte:    fonte.id,
      testata:  fonte.nome,
      tipo:     fonte.tipo,
      peso:     fonte.peso,
      area:     fonte.area,
      lingua:   fonte.lingua,
      temi:     fonte.temi ?? [],
      paywall:  false,
      nel_perimetro: fonte.nel_perimetro === true,
    });
  }
  return fuori;
}

/* ---------- 3. Rete ----------------------------------------- */

async function scarica(url) {
  for (let t = 1; t <= TENTATIVI; t++) {
    const stop = AbortSignal.timeout(TIMEOUT_MS);
    try {
      const r = await fetch(url, {
        signal: stop,
        redirect: 'follow',
        headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*' },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      if (t === TENTATIVI) throw e;
      await new Promise(r => setTimeout(r, 800 * t));
    }
  }
}

/* Scarica a ondate invece che tutto insieme: i server che ci
   servono sono gratuiti, non è il caso di martellarli. */
async function aOndate(lista, quante, lavoro) {
  const esiti = [];
  for (let i = 0; i < lista.length; i += quante) {
    const ondata = lista.slice(i, i + quante);
    esiti.push(...await Promise.all(ondata.map(lavoro)));
  }
  return esiti;
}

/* ---------- 4. Raccolta ------------------------------------- */

async function raccogli() {
  const fonti = await caricaFonti(T);

  const esiti = await aOndate(fonti, PARALLELE, async (fonte) => {
    try {
      const grezzo = await scarica(fonte.url);
      const voci   = fonte.formato === 'comunicati-pat'
        ? leggiComunicatiPat(grezzo, fonte)
        : leggiFeed(grezzo, fonte);
      return { fonte, voci, errore: null };
    } catch (e) {
      return { fonte, voci: [], errore: e.message || String(e) };
    }
  });

  /* Deduplica per URL normalizzato. Se lo stesso articolo arriva da
     due feed, tiene quello della fonte che pesa di più. */
  const perUrl = new Map();
  for (const { voci } of esiti) {
    for (const v of voci) {
      const gia = perUrl.get(v.url);
      if (!gia || v.peso > gia.peso) perUrl.set(v.url, v);
    }
  }

  const articoli = [...perUrl.values()]
    .sort((a, b) => String(b.quando ?? '').localeCompare(String(a.quando ?? '')));

  return { esiti, articoli };
}

/* ---------- 5. Il grezzo su disco --------------------------- */

async function scrivi(articoli, esiti) {
  const dir = T.percorsi.grezzo;
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });

  const ora  = new Date().toISOString().slice(0, 13).replace(':', '');
  const file = path.join(dir, `${ora}.json`);

  await writeFile(file, JSON.stringify({
    raccolto: new Date().toISOString(),
    fonti_ok: esiti.filter(e => !e.errore).length,
    fonti_ko: esiti.filter(e =>  e.errore).map(e => ({ id: e.fonte.id, errore: e.errore })),
    articoli,
  }, null, 1));

  return file;
}

/* Le istantanee vecchie non servono: il clustering guarda pochi
   giorni indietro, e il resto è peso morto nel repo. */
async function ruota() {
  const dir = T.percorsi.grezzo;
  if (!existsSync(dir)) return 0;
  const limite = Date.now() - GIORNI_GREZZO * 86400_000;
  let tolti = 0;
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.json')) continue;
    const g = new Date(f.slice(0, 10));
    if (!isNaN(g) && g.getTime() < limite) { await unlink(path.join(dir, f)); tolti++; }
  }
  return tolti;
}

/* ---------- 5b. La finestra compatta ------------------------ */

async function accumula(articoli) {
  const dir  = T.percorsi.grezzo;
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  const file = path.join(dir, 'finestra.json');

  let prima = [];
  if (existsSync(file)) {
    try { prima = JSON.parse(await readFile(file, 'utf8')).articoli ?? []; } catch {}
  }

  const snello = a => ({
    t: a.titolo,
    s: (a.sommario ?? '').slice(0, MAX_SOMMARIO_COMPATTO),
    u: a.url, q: a.quando, f: a.fonte,
  });

  /* Il nuovo vince sul vecchio: un titolo corretto dopo la
     pubblicazione è la versione buona. */
  const perUrl = new Map(prima.map(a => [a.u, a]));
  for (const a of articoli) {
    const gia = perUrl.get(a.url);
    const s = snello(a);
    /* Qualche feed non data proprio gli articoli — NBER e Nikkei Asia
       non hanno alcun campo di data. Senza data venivano scartati dalla
       finestra, cioè quelle fonti non entravano mai nel giornale pur
       rispondendo benissimo. Il momento in cui li abbiamo visti per la
       prima volta è una buona approssimazione, e `qs` dice che è una
       stima nostra e non una data della fonte. */
    if (!s.q) {
      s.q = gia?.q ?? new Date().toISOString();
      s.qs = 1;
    }
    perUrl.set(a.url, s);
  }

  const limite = Date.now() - ORE_FINESTRA_COMPATTA * 36e5;
  const dentro = [...perUrl.values()]
    .filter(a => a.q && new Date(a.q).getTime() >= limite)
    .sort((a, b) => String(b.q).localeCompare(String(a.q)));

  await writeFile(file, JSON.stringify({
    aggiornato: new Date().toISOString(),
    finestra_ore: ORE_FINESTRA_COMPATTA,
    legenda: { t: 'titolo', s: 'sommario', u: 'url', q: 'quando', f: 'fonte',
               qs: 'quando è una stima nostra: il feed non datava l\'articolo' },
    articoli: dentro,
  }));

  return { file, quanti: dentro.length, nuovi: dentro.length - prima.length };
}

/* ---------- 6. Avvio ---------------------------------------- */

const prova    = process.argv.includes('--prova');
const compatta = process.argv.includes('--compatta');
const t0 = Date.now();
const { esiti, articoli } = await raccogli();

/* Un feed muore in due modi. Il primo è rumoroso: smette di rispondere,
   e si vede subito. Il secondo è silenzioso e molto peggio — continua a
   rispondere, con dieci articoli regolari, ma sono sempre gli stessi da
   anni. Contare le voci non lo scopre: csis rispondeva con dieci voci
   ferme al 2016 e prendeva la spunta verde. Bisogna guardare la data.

   La soglia è generosa apposta: un think tank pubblica quando ha
   qualcosa da dire, e sei settimane di silenzio possono essere normali.
   Quello che si va a cercare è il feed fermo da mesi o da anni. */
const GIORNI_CONGELATO = 45;

function giorniDaUltimo(voci) {
  const date = (voci ?? []).map(v => Date.parse(v.quando ?? '')).filter(t => !isNaN(t));
  if (!date.length) return null;
  /* Le date nel futuro sono un errore della fonte, non freschezza: si
     tengono a oggi invece di far comparire numeri negativi. */
  return Math.max(0, Math.floor((Date.now() - Math.max(...date)) / 86400000));
}

if (prova) {
  /* In prova non si scrive niente: si guarda solo chi risponde.
     Serve anche come guardia nel tempo — i feed muoiono in silenzio. */
  console.log('\nFONTE                          VOCI   ULTIMO      ESITO');
  console.log('─'.repeat(72));
  const congelate = [];
  for (const e of esiti.sort((a, b) => a.fonte.tipo.localeCompare(b.fonte.tipo) || b.voci.length - a.voci.length)) {
    const g = e.errore ? null : giorniDaUltimo(e.voci);
    const eta = g == null ? (e.errore ? '' : 'senza data') : g === 0 ? 'oggi' : `${g}g fa`;
    let stato = e.errore ? `✗ ${e.errore}` : '✓';
    /* Una rivista trimestrale tace per mesi ed è viva: la cadenza attesa
       la dichiara la fonte, in `giorni_attesi`. Senza dichiarazione vale
       la soglia generale. */
    const soglia = e.fonte.giorni_attesi ?? GIORNI_CONGELATO;
    if (g != null && g > soglia) { stato = `⚠ congelato da ${g} giorni`; congelate.push(e.fonte.id); }
    console.log(`${e.fonte.id.padEnd(28)} ${String(e.voci.length).padStart(4)}   ${eta.padEnd(11)} ${stato}`);
  }
  const ko = esiti.filter(e => e.errore || e.voci.length === 0);
  console.log('─'.repeat(72));
  console.log(`[${T.id}] ${esiti.length} fonti · ${articoli.length} articoli dopo la deduplica · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (ko.length) console.log(`\nNon rispondono: ${ko.map(e => e.fonte.id).join(', ')}`);
  if (congelate.length) {
    console.log(`\nCongelate — rispondono ma non pubblicano più: ${congelate.join(', ')}`);
    console.log('Vanno sostituite, o segnate in «_scartate» con la ragione.');
  }
  /* Un feed morto è un guasto, non una curiosità: chi lancia questo
     comando dentro un'automazione deve poterlo sapere dal codice d'uscita. */
  if (ko.length || congelate.length) process.exitCode = 1;
} else if (compatta) {
  const { file, quanti, nuovi } = await accumula(articoli);
  const kb = ((await readFile(file)).length / 1024).toFixed(0);
  console.log(`[${T.id}] ${articoli.length} raccolti · finestra a ${quanti} articoli (${nuovi >= 0 ? '+' : ''}${nuovi}) · ${kb} kB → ${path.relative(BASE, file)}`);
  const ko = esiti.filter(e => e.errore);
  if (ko.length) console.log(`Non hanno risposto: ${ko.map(e => e.fonte.id).join(', ')}`);
} else {
  const file  = await scrivi(articoli, esiti);
  const tolti = await ruota();
  /* La guardia sulle fonti congelate non vive solo nella prova manuale:
     un feed che risponde ma non pubblica più da mesi (è successo, con
     Gazzetta e Reuters) deve comparire nel registro di ogni giro, o il
     giornale si impoverisce in silenzio. */
  const congelate = esiti
    .filter(e => !e.errore)
    .filter(e => { const g = giorniDaUltimo(e.voci); return g != null && g > (e.fonte.giorni_attesi ?? GIORNI_CONGELATO); })
    .map(e => e.fonte.id);
  console.log(`[${T.id}] ${articoli.length} articoli da ${esiti.filter(e => !e.errore).length}/${esiti.length} fonti → ${path.relative(BASE, file)}${tolti ? ` (${tolti} istantanee vecchie rimosse)` : ''}${congelate.length ? ` · ⚠ congelate: ${congelate.join(', ')}` : ''}`);
  const ko = esiti.filter(e => e.errore);
  if (ko.length) console.log(`Non hanno risposto: ${ko.map(e => `${e.fonte.id} (${e.errore})`).join(', ')}`);
}
