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
import { fileURLToPath } from 'node:url';

const QUI  = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.join(QUI, '..');

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

function quando(xml) {
  const grezza = tag(xml, 'pubDate') || tag(xml, 'dc:date')
              || tag(xml, 'published') || tag(xml, 'updated') || tag(xml, 'date');
  const d = new Date(grezza);
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
  const registro = JSON.parse(await readFile(path.join(BASE, 'fonti.json'), 'utf8'));

  const esiti = await aOndate(registro.fonti, PARALLELE, async (fonte) => {
    try {
      const xml   = await scarica(fonte.url);
      const voci  = leggiFeed(xml, fonte);
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
  const dir = path.join(BASE, 'grezzo');
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
  const dir = path.join(BASE, 'grezzo');
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
  const dir  = path.join(BASE, 'grezzo');
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
  for (const a of articoli) perUrl.set(a.url, snello(a));

  const limite = Date.now() - ORE_FINESTRA_COMPATTA * 36e5;
  const dentro = [...perUrl.values()]
    .filter(a => a.q && new Date(a.q).getTime() >= limite)
    .sort((a, b) => String(b.q).localeCompare(String(a.q)));

  await writeFile(file, JSON.stringify({
    aggiornato: new Date().toISOString(),
    finestra_ore: ORE_FINESTRA_COMPATTA,
    legenda: { t: 'titolo', s: 'sommario', u: 'url', q: 'quando', f: 'fonte' },
    articoli: dentro,
  }));

  return { file, quanti: dentro.length, nuovi: dentro.length - prima.length };
}

/* ---------- 6. Avvio ---------------------------------------- */

const prova    = process.argv.includes('--prova');
const compatta = process.argv.includes('--compatta');
const t0 = Date.now();
const { esiti, articoli } = await raccogli();

if (prova) {
  /* In prova non si scrive niente: si guarda solo chi risponde.
     Serve anche come guardia nel tempo — i feed muoiono in silenzio. */
  console.log('\nFONTE                          VOCI   ESITO');
  console.log('─'.repeat(72));
  for (const e of esiti.sort((a, b) => a.fonte.tipo.localeCompare(b.fonte.tipo) || b.voci.length - a.voci.length)) {
    const stato = e.errore ? `✗ ${e.errore}` : '✓';
    console.log(`${e.fonte.id.padEnd(28)} ${String(e.voci.length).padStart(4)}   ${stato}`);
  }
  const ko = esiti.filter(e => e.errore || e.voci.length === 0);
  console.log('─'.repeat(72));
  console.log(`${esiti.length} fonti · ${articoli.length} articoli dopo la deduplica · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (ko.length) console.log(`\nDa guardare: ${ko.map(e => e.fonte.id).join(', ')}`);
} else if (compatta) {
  const { file, quanti, nuovi } = await accumula(articoli);
  const kb = ((await readFile(file)).length / 1024).toFixed(0);
  console.log(`${articoli.length} raccolti · finestra a ${quanti} articoli (${nuovi >= 0 ? '+' : ''}${nuovi}) · ${kb} kB → ${path.relative(BASE, file)}`);
  const ko = esiti.filter(e => e.errore);
  if (ko.length) console.log(`Non hanno risposto: ${ko.map(e => e.fonte.id).join(', ')}`);
} else {
  const file  = await scrivi(articoli, esiti);
  const tolti = await ruota();
  console.log(`${articoli.length} articoli da ${esiti.filter(e => !e.errore).length}/${esiti.length} fonti → ${path.relative(BASE, file)}${tolti ? ` (${tolti} istantanee vecchie rimosse)` : ''}`);
  const ko = esiti.filter(e => e.errore);
  if (ko.length) console.log(`Non hanno risposto: ${ko.map(e => `${e.fonte.id} (${e.errore})`).join(', ')}`);
}
