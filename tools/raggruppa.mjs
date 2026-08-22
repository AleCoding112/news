/* ============================================================
   News — raggruppa e pesa
   Dal grezzo ai candidati: stesso evento da fonti diverse
   diventa un gruppo solo, i gruppi prendono un punteggio, e
   quelli già trattati escono di scena.

   Serve a due cose. Ridurre millequattrocento articoli a poche
   decine di eventi, e applicare in modo meccanico la parte di
   LINEA-EDITORIALE.md che si può applicare meccanicamente —
   così il giudizio del modello si spende dove serve davvero.
   ============================================================ */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI  = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.join(QUI, '..');

/* ---------- 1. Soglie --------------------------------------
   Tutte qui, con i nomi in chiaro: cambiarle è il modo previsto
   per correggere la selezione. */

const ORE_FINESTRA   = 30;   // quanto indietro si guarda
const SOMIGLIANZA    = 0.30; // sopra questa, due titoli sono lo stesso evento
const PESO_ENTITA    = 0.65; // nomi propri e cifre contano più delle parole comuni
const MIN_PUNTEGGIO  = 3;    // sotto, non vale la pena nemmeno mostrarlo
const MAX_CANDIDATI  = 60;

/* ---------- 2. Parole -------------------------------------- */

const VUOTE = new Set(`
il lo la i gli le un uno una di a da in con su per tra fra del della dei delle dal dalla
al alla ai alle nel nella nei nelle sul sulla e ed o ma se che chi cui non più meno come
dopo prima ancora anche solo sono essere stato stata hanno avere fa fatto dice detto dopo
verso contro senza sotto sopra oltre circa ecco cosa quando dove perché però mentre
the a an of to in on for with by from at as is are was were be been has have had will
would can could may might should must this that these those it its his her their they
he she we you i not no but or and if then than so such about after before over under
new says said say make made get got than into out up down more most less least
`.trim().split(/\s+/));

/* Le sigle cambiano con la lingua ma indicano la stessa cosa: senza
   questo, la BCE italiana e la ECB inglese restano due eventi diversi. */
const SINONIMI = new Map(Object.entries({
  ecb: 'bce', bundesbank: 'bundesbank', fed: 'fed', federalreserve: 'fed',
  eu: 'ue', europeanunion: 'ue', unioneeuropea: 'ue', bruxelles: 'ue', brussels: 'ue',
  usa: 'usa', us: 'usa', unitedstates: 'usa', statiuniti: 'usa', america: 'usa',
  uk: 'uk', britain: 'uk', regnounito: 'uk',
  germany: 'germania', france: 'francia', spain: 'spagna', italy: 'italia', china: 'cina',
  russia: 'russia', ukraine: 'ucraina', israel: 'israele', gaza: 'gaza', iran: 'iran',
  japan: 'giappone', india: 'india', turkey: 'turchia', egypt: 'egitto',
  inflation: 'inflazione', tariffs: 'dazi', tariff: 'dazi', trade: 'commercio',
  rates: 'tassi', rate: 'tassi', interest: 'tassi', bond: 'obbligazioni', bonds: 'obbligazioni',
  unemployment: 'disoccupazione', growth: 'crescita', gdp: 'pil',
  budget: 'bilancio', deficit: 'deficit', debt: 'debito', tax: 'tasse', taxes: 'tasse',
  war: 'guerra', ceasefire: 'tregua', sanctions: 'sanzioni', election: 'elezioni',
  elections: 'elezioni', migration: 'migrazione', energy: 'energia', oil: 'petrolio',
  gas: 'gas', defence: 'difesa', defense: 'difesa', nato: 'nato', un: 'onu',
}));

/* I nomi di paese sono entità, ma sono le entità più comuni che esistano:
   due notizie che condividono solo «UK» non parlano della stessa cosa.
   Servono a confermare un accostamento, mai a produrlo. */
const GEOGRAFIA = new Set(`
italia usa uk ue europa germania francia spagna cina russia ucraina israele gaza iran
giappone india turchia egitto canada messico brasile australia corea polonia grecia
olanda belgio svizzera austria svezia norvegia danimarca finlandia portogallo irlandaa
irlanda romania ungheria bulgaria croazia serbia africa asia america roma milano parigi
berlino londra madrid mosca kiev pechino tokyo washington bruxelles francoforte nato onu
`.trim().split(/\s+/));

function senzaAccenti(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function parole(testo) {
  return senzaAccenti(String(testo).toLowerCase())
    .replace(/['’`]/g, ' ')
    .split(/[^a-z0-9%]+/)
    .filter(p => p.length >= 3 && !VUOTE.has(p))
    .map(p => SINONIMI.get(p) ?? p);
}

/* Le entità reggono il confronto fra lingue: «Lagarde», «BCE», «2,4%»
   restano sé stesse in italiano e in inglese, dove «decisione» e
   «decision» non si somigliano affatto. */
function entita(titolo) {
  const dentro = new Set();
  for (const g of String(titolo).matchAll(/\b[\p{Lu}][\p{L}’'-]{2,}\b/gu)) {
    const p = SINONIMI.get(senzaAccenti(g[0].toLowerCase())) ?? senzaAccenti(g[0].toLowerCase());
    if (!VUOTE.has(p)) dentro.add(p);
  }
  for (const g of String(titolo).matchAll(/\b[\p{Lu}]{2,6}\b/gu)) {
    dentro.add(SINONIMI.get(g[0].toLowerCase()) ?? g[0].toLowerCase());
  }
  for (const g of String(titolo).matchAll(/\d+(?:[.,]\d+)?\s*(?:%|per\s?cento|percent|mld|bn|miliardi|billion|milioni|million|punti|bp|pb)?/gi)) {
    const n = g[0].replace(/\s+/g, '').toLowerCase();
    if (/\d/.test(n) && n.length > 1) dentro.add(n);
  }
  return dentro;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let comuni = 0;
  for (const x of a) if (b.has(x)) comuni++;
  return comuni / (a.size + b.size - comuni);
}

/* Le parole tematiche fanno da ancora fra le lingue. SINONIMI porta
   già «tariffs» e «dazi» sulla stessa forma: contandole fra le entità
   forti, «guerra dei dazi fra Stati Uniti e Canada» e «US puts 50%
   tariffs on Canadian goods» tornano a essere un evento solo, che è
   quello che sono. */
const TEMATICHE = new Set(`
dazi tassi inflazione guerra tregua sanzioni elezioni commercio pil debito deficit tasse
energia petrolio gas difesa disoccupazione crescita obbligazioni bilancio migrazione
bce fed ue nato onu
`.trim().split(/\s+/));

function forti(insieme, dalleParole = new Set()) {
  const f = new Set();
  for (const e of insieme)      if (!GEOGRAFIA.has(e)) f.add(e);
  for (const p of dalleParole)  if (TEMATICHE.has(p))  f.add(p);
  return f;
}

function somiglianza(x, y) {
  /* Senza un'entità specifica in comune — un nome, una sigla, una cifra —
     due titoli non parlano dello stesso fatto, per quanto si somiglino
     le parole. È ciò che teneva insieme un incidente stradale e una
     ricerca sugli orti sotterranei: entrambi nel Regno Unito. */
  let comuniForti = 0;
  for (const e of x.forti) if (y.forti.has(e)) comuniForti++;
  if (comuniForti === 0) return 0;

  return PESO_ENTITA * jaccard(x.entita, y.entita)
       + (1 - PESO_ENTITA) * jaccard(x.parole, y.parole);
}

/* ---------- 3. Il rumore ------------------------------------
   La parte di LINEA-EDITORIALE.md §2 che si può riconoscere dal
   solo titolo. Non pretende di essere esatta: toglie punteggio,
   non censura. Il giudizio vero resta al modello. */

const RUMORE = [
  { re: /\b(attacca|attacco a|replica a|risponde a|accusa|smentisce|polemica|bufera|scontro|duro sfogo)\b/i, punti: -4, perche: 'polemica o reazione' },
  { re: /\b(slams|blasts|hits back|lashes out|fires back|clash(es)? with|feud)\b/i,                          punti: -4, perche: 'polemica o reazione' },
  { re: /\b(sondaggio|sondaggi|poll|polls|survey shows|approval rating)\b/i,                                 punti: -3, perche: 'sondaggio' },
  { re: /\b(shock|clamoroso|choc|incredibile|assurdo|drammatic|sconvolgent)\w*/i,                            punti: -4, perche: 'lessico da indignazione' },
  { re: /\b(ecco perch|ecco come|vi spieghiamo|cosa sapere|quello che devi|here'?s why|here'?s what|what to know|explained)\b/i, punti: -3, perche: 'formula da acchiappaclic' },
  { re: /^\s*(perch|come mai|why|how|what|chi |who )\b.*\?\s*$/i,                                            punti: -3, perche: 'titolo a domanda retorica' },
  { re: /!/,                                                                                                 punti: -2, perche: 'punto esclamativo' },
  { re: /\b(my (daughter|son|husband|wife|mother|father)|should i|my friend|i'?m \d+|dear )\b/i,             punti: -6, perche: 'posta del cuore o consiglio personale' },
  { re: /\b(oroscopo|gossip|vip|reality|gol|calcio|serie a|champions|nba|nfl|f1 |sanremo)\b/i,               punti: -6, perche: 'sport o intrattenimento' },
  { re: /\b(anniversar|ricorrenz|amarcord|dieci anni fa|anni fa)\b/i,                                        punti: -3, perche: 'ricorrenza' },
  { re: /\b(classifica|la top|top \d+|i migliori|le peggiori|ranking|best of)\b/i,                           punti: -3, perche: 'classifica' },
  { re: /\b(webinar|conference|convegno|evento|registration|iscrizioni|save the date|join us|panel discussion)\b/i, punti: -5, perche: 'annuncio di evento' },
  { re: /\b(analisti (temono|prevedono|si aspettano)|analysts (fear|expect|predict)|si teme|timori per|fears over)\b/i, punti: -2, perche: 'previsione senza modello' },
  /* Cronaca nera e incidenti: notizia vera per chi la vive, ma senza un
     meccanismo sistemico non passa la prova delle tre domande (§1). */
  { re: /\b(omicidio|femminicidio|accoltell\w+|sparatoria|rapina|stupro|violenza sessuale|incidente stradale|travolto|schianto|scomparsa)\b/i, punti: -5, perche: 'cronaca nera o incidente' },
  { re: /\b(stabbing|sword attack|shooting|murder(ed)?|killed in a (crash|car)|car crash|manhunt|abduct\w+|rape)\b/i, punti: -5, perche: 'cronaca nera o incidente' },
  { re: /\b(fifa|uefa|infantino|olimpiad\w+|olympics?|world record|sprint|mondiali|scudetto|tennis|motogp|ciclismo|tour de france)\b/i, punti: -6, perche: 'sport' },
  { re: /\b(turismo|turisti|sagra|festival|gastronom\w+|degustazion\w+|birr\w+|vino|ricetta)\b/i, punti: -4, perche: 'costume e tempo libero' },
  { re: /\b(celebrit\w+|attore|attrice|cantante|royal family|principe|principessa|matrimonio vip|red carpet)\b/i, punti: -6, perche: 'celebrità' },
];

/* Al contrario: segnali che un titolo porta un fatto misurabile. */
const CIFRA      = /\d+(?:[.,]\d+)?\s*(?:%|per cento|percent|punti|mld|miliardi|billion|bn|milioni|million|pb|bp)/i;
const DECISIONE  = /\b(approva|approvato|firma|firmato|decide|deciso|vara|varato|entra in vigore|taglia|alza|riduce|sospende|vieta|impone|adotta|ratifica|announces|approves|signs|adopts|imposes|raises|cuts|bans|suspends|enacts|rules)\b/i;

/* Le serie di macro.json a cui un titolo può essere ancorato. Si
   riconoscono dal concetto — «inflazione», «tassi», «disoccupazione» —
   perché è il concetto a rendere il numero pertinente. */
const ANCORE = [
  { re: /\b(inflazion\w*|inflation|hicp|cpi|prezzi al consumo|carovita|caro[- ]vita)\b/i, serie: 'hicp-ea' },
  { re: /\b(disoccupazion\w*|unemployment|occupazione|jobless|posti di lavoro|payrolls)\b/i, serie: 'disocc-ue' },
  { re: /\b(pil|gdp|recession\w*|crescita economica|economic growth)\b/i,                    serie: 'pil-ea' },
  { re: /\b(bce|tassi (di interesse|ufficiali|d'interesse)|politica monetaria|monetary policy|rate (cut|hike)|lagarde)\b/i, serie: 'bce-mro' },
  { re: /\b(fed|federal reserve|fomc|powell)\b/i,                                             serie: 'fed-funds' },
  { re: /\b(spread|btp|bund|debito pubblico|sovereign (debt|bond))\b/i,                        serie: 'spread-btp-bund' },
  { re: /\b(petrolio|brent|oil price|greggio|opec)\b/i,                                        serie: 'brent' },
  { re: /\b(euro[\/ ]dollaro|eur[\/]usd|exchange rate|cambio dell'euro)\b/i,                  serie: 'eurusd' },
];

/* ---------- 4. Il punteggio --------------------------------- */

function pesa(gruppo, macro) {
  const motivi = [];
  let punti = 0;

  const testate = new Set(gruppo.map(a => a.fonte.replace(/-.*$/, '')));  // le sezioni di una testata sono una fonte
  const primarie = gruppo.filter(a => a.tipo === 'primaria');
  const analisi  = gruppo.filter(a => a.tipo === 'analisi');

  if (primarie.length) {
    punti += 8; motivi.push(`fonte primaria (${primarie[0].testata})`);
  }
  if (analisi.length) {
    punti += 2; motivi.push('ripreso da analisi');
  }

  const indip = testate.size;
  if (indip >= 4)      { punti += 5; motivi.push(`${indip} testate indipendenti`); }
  else if (indip >= 2) { punti += indip; motivi.push(`${indip} testate indipendenti`); }
  else if (!primarie.length) { punti -= 2; motivi.push('una sola fonte, non primaria'); }

  const titoli = gruppo.map(a => a.titolo).join(' · ');

  if (CIFRA.test(titoli))     { punti += 3; motivi.push('porta una cifra'); }
  if (DECISIONE.test(titoli)) { punti += 3; motivi.push('è una decisione, non un annuncio'); }

  /* Se l'evento tocca una serie che seguiamo, il pezzo potrà essere
     ancorato a un numero verificabile invece che a un aggettivo.
     L'aggancio deve scattare sul concetto, non sul paese: cercando le
     parole del nome della serie, «Inflazione Italia» si agganciava a
     qualunque titolo contenesse «Italia», birraturismo compreso. */
  const aggancio = ANCORE.find(a => a.re.test(titoli));
  if (aggancio && macro.some(s => s.id === aggancio.serie)) {
    punti += 2;
    motivi.push(`ancorabile a ${macro.find(s => s.id === aggancio.serie).cosa}`);
  }

  const peso = Math.max(...gruppo.map(a => a.peso ?? 0));
  punti += Math.round(peso / 3);

  for (const r of RUMORE) {
    if (r.re.test(titoli)) { punti += r.punti; motivi.push(r.perche); }
  }

  return { punti, motivi, indipendenti: indip, primaria: primarie.length > 0 };
}

/* ---------- 5. Raggruppamento -------------------------------
   Insiemi disgiunti: due articoli simili finiscono nello stesso
   gruppo, e la similarità è transitiva quanto basta. */

function raggruppa(articoli) {
  const preparati = articoli.map(a => {
    const ent  = entita(a.titolo);
    const par  = new Set(parole(`${a.titolo} ${a.sommario ?? ''}`.slice(0, 400)));
    /* Le tematiche si cercano solo nel titolo: nel sommario aggancerebbero
       qualunque cosa citi di sfuggita i dazi o i tassi. */
    const temi = new Set(parole(a.titolo));
    return { ...a, parole: par, entita: ent, forti: forti(ent, temi) };
  });

  /* Ogni articolo si confronta col capofila del gruppo, non con un
     membro qualsiasi: altrimenti A somiglia a B, B somiglia a C, e il
     gruppo finisce per tenere insieme A e C che non c'entrano nulla.
     Capofila è chi arriva dalla fonte che pesa di più. */
  const ordine = [...preparati].sort((a, b) =>
    (b.peso ?? 0) - (a.peso ?? 0) || String(b.quando ?? '').localeCompare(String(a.quando ?? '')));

  const gruppi = [];
  for (const a of ordine) {
    let migliore = null, punteggio = SOMIGLIANZA;
    for (const g of gruppi) {
      const s = somiglianza(a, g[0]);
      if (s >= punteggio) { punteggio = s; migliore = g; }
    }
    if (migliore) migliore.push(a); else gruppi.push([a]);
  }

  return gruppi;
}

/* ---------- 6. Che cosa abbiamo già detto ------------------- */

function impronta(gruppo) {
  const e = [...new Set(gruppo.flatMap(a => [...a.entita]))].sort().slice(0, 12);
  return e.join('|');
}

async function giaCoperti() {
  const f = path.join(BASE, '.state', 'coperti.json');
  if (!existsSync(f)) return { storie: [] };
  return JSON.parse(await readFile(f, 'utf8'));
}

/* ---------- 7. Avvio ---------------------------------------- */

const mostra = process.argv.includes('--mostra');

/* Due sorgenti, che si completano. L'istantanea locale ha i sommari
   interi ma esiste solo se il Mac era acceso; la finestra compatta
   arriva dal repo, l'ha scritta l'azione su GitHub anche a Mac spento,
   ed è più povera ma copre i buchi. Si uniscono, e dove entrambe hanno
   lo stesso articolo vince quella con più testo. */
const dirGrezzo = path.join(BASE, 'grezzo');
const registro  = JSON.parse(await readFile(path.join(BASE, 'fonti.json'), 'utf8'));
const perId     = new Map(registro.fonti.map(f => [f.id, f]));

async function leggiGrezzo() {
  const dentro = new Map();
  let da = [];

  const istantanee = existsSync(dirGrezzo)
    ? (await readdir(dirGrezzo)).filter(f => f.endsWith('.json') && f !== 'finestra.json').sort()
    : [];
  const ultima = istantanee.pop();
  if (ultima) {
    const d = JSON.parse(await readFile(path.join(dirGrezzo, ultima), 'utf8'));
    for (const a of d.articoli) dentro.set(a.url, a);
    da.push(ultima);
  }

  const compatta = path.join(dirGrezzo, 'finestra.json');
  if (existsSync(compatta)) {
    const d = JSON.parse(await readFile(compatta, 'utf8'));
    for (const a of d.articoli) {
      if (dentro.has(a.url)) continue;                 // l'istantanea è più ricca
      const f = perId.get(a.f);
      if (!f) continue;
      dentro.set(a.u ?? a.url, {
        titolo: a.t, sommario: a.s, url: a.u, quando: a.q,
        fonte: a.f, testata: f.nome, tipo: f.tipo, peso: f.peso,
        area: f.area, lingua: f.lingua, temi: f.temi ?? [], paywall: f.paywall === true,
      });
    }
    da.push('finestra.json');
  }

  if (!dentro.size) {
    console.error('Nessun grezzo: lancia prima `node tools/raccogli.mjs`.');
    process.exit(1);
  }
  return { articoli: [...dentro.values()], da: da.join(' + ') };
}

const grezzo = await leggiGrezzo();
const file = grezzo.da;
const macroFile = path.join(BASE, 'dati', 'macro.json');
const macro = existsSync(macroFile) ? JSON.parse(await readFile(macroFile, 'utf8')).serie.filter(s => !s.errore) : [];
const coperti = await giaCoperti();

/* Solo il passato recente: alcune fonti di analisi annunciano nei feed
   convegni dei mesi a venire, e non sono notizie. */
const ora = Date.now();
const dentro = grezzo.articoli.filter(a => {
  if (!a.quando) return false;
  const t = new Date(a.quando).getTime();
  return t <= ora + 36e5 && ora - t <= ORE_FINESTRA * 36e5;
});

const gruppi = raggruppa(dentro);

/* Sotto la soglia di fusione ma sopra il caso: due gruppi che si
   somigliano così sono probabilmente la stessa storia inquadrata in
   modi diversi. Unirli d'ufficio produrrebbe accostamenti sbagliati;
   segnalarli lascia la decisione al giudizio semantico, che è il posto
   giusto per prenderla. */
const IMPARENTATI = 0.12;

const candidati = gruppi.map(g => {
  const p = pesa(g, macro);
  const ordinati = [...g].sort((a, b) => (b.peso ?? 0) - (a.peso ?? 0));
  const imp = impronta(g);
  const gia = coperti.storie?.find(s => {
    const mie = new Set(imp.split('|'));
    const sue = new Set(String(s.impronta).split('|'));
    return jaccard(mie, sue) >= 0.55;
  });
  return {
    impronta: imp,
    punti: p.punti,
    motivi: p.motivi,
    indipendenti: p.indipendenti,
    primaria: p.primaria,
    gia_coperto: gia ? { id: gia.id, titolo: gia.titolo, quando: gia.quando } : null,
    titolo_guida: ordinati[0].titolo,
    articoli: ordinati.map((a, i) => ({
      titolo: a.titolo, testata: a.testata, tipo: a.tipo, url: a.url,
      quando: a.quando, sommario: a.sommario, paywall: a.paywall, area: a.area, temi: a.temi,
      ...(i === 0 ? { _chiavi: { parole: a.parole, entita: a.entita, forti: a.forti } } : {}),
    })),
  };
})
  .filter(c => c.punti >= MIN_PUNTEGGIO)
  .sort((a, b) => b.punti - a.punti)
  .slice(0, MAX_CANDIDATI);

candidati.forEach((c, i) => { c.id = `c${String(i + 1).padStart(2, '0')}`; });

/* Ogni candidato dichiara di chi è parente, così chi sceglie vede subito
   che quattro voci sono un'unica storia raccontata da quattro angoli. */
for (let i = 0; i < candidati.length; i++) {
  for (let j = i + 1; j < candidati.length; j++) {
    const a = candidati[i].articoli[0]._chiavi, b = candidati[j].articoli[0]._chiavi;
    const s = somiglianza(a, b);
    if (s >= IMPARENTATI && s < SOMIGLIANZA) {
      (candidati[i].imparentati ??= []).push(candidati[j].id);
      (candidati[j].imparentati ??= []).push(candidati[i].id);
    }
  }
}
for (const c of candidati) for (const a of c.articoli) delete a._chiavi;

if (mostra) {
  console.log(`\n${dentro.length} articoli nelle ultime ${ORE_FINESTRA}h → ${gruppi.length} eventi → ${candidati.length} candidati\n`);
  for (const c of candidati) {
    const nota = c.gia_coperto ? `  ⟳ già trattato: ${c.gia_coperto.id}` : '';
    console.log(`${c.id} [${String(c.punti).padStart(3)}] ${c.titolo_guida.slice(0, 92)}${nota}`);
    console.log(`      ${c.articoli.length} art · ${c.indipendenti} testate · ${c.motivi.join(' · ')}`);
    if (c.imparentati?.length) console.log(`      ~ forse la stessa storia di: ${c.imparentati.join(', ')}`);
    if (c.articoli.length > 1) {
      for (const a of c.articoli.slice(1, 4)) console.log(`      └ ${a.testata}: ${a.titolo.slice(0, 82)}`);
    }
    console.log();
  }
} else {
  await writeFile(path.join(BASE, 'candidati.json'), JSON.stringify({
    generato: new Date().toISOString(),
    da: file,
    finestra_ore: ORE_FINESTRA,
    articoli_esaminati: dentro.length,
    eventi: gruppi.length,
    candidati,
  }, null, 1));
  console.log(`${dentro.length} articoli → ${gruppi.length} eventi → ${candidati.length} candidati → candidati.json`);
}
