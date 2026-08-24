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
import { caricaTestata, caricaFonti, BASE } from './testata.mjs';

/* Quale giornale si sta raggruppando lo dice `--testata`: le notizie
   mettono lo sport nella lista nera, il calcio di sport vive. Stessa
   macchina, criteri opposti. */
const T = await caricaTestata();

/* ---------- 1. Soglie e liste ------------------------------
   Vengono tutte dal file della testata: cambiarle è il modo previsto
   per correggere la selezione, e non richiede di toccare il codice. */

const {
  ore_finestra:  ORE_FINESTRA,
  somiglianza:   SOMIGLIANZA,
  peso_entita:   PESO_ENTITA,
  imparentati:   IMPARENTATI,
  min_punteggio: MIN_PUNTEGGIO,
  min_sostanza:  MIN_SOSTANZA,
  max_candidati: MAX_CANDIDATI,
  max_deboli:    MAX_DEBOLI,
} = T.soglie;

/* `min_sostanza` e `max_deboli` reggono i segnali deboli: una storia
   coperta da una fonte sola non passa la regola delle due fonti
   indipendenti (§3) e prima veniva scartata qui, in silenzio — è morto
   così «Euro digitale, confronto BCE-istituti», che aveva solo ANSA.
   Ma la regola dice che servono due fonti *per pubblicare*, non per
   accorgersi: è la differenza fra un archivista e un editore. */

const RUMORE = T.rumore;
const ANCORE = T.ancore;
const CIFRA     = T.cifra;
const DECISIONE = T.decisione;

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
`.trim().split(/\s+/).filter(p => !T.geografia_togli.includes(p)));

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
`.trim().split(/\s+/).concat(T.tematiche));

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


/* Al contrario: segnali che un titolo porta un fatto misurabile. */

/* Le serie di macro.json a cui un titolo può essere ancorato. Si
   riconoscono dal concetto — «inflazione», «tassi», «disoccupazione» —
   perché è il concetto a rendere il numero pertinente. */

/* ---------- 4. Il punteggio --------------------------------- */

function pesa(gruppo, macro) {
  const motivi = [];
  let punti = 0;
  let sostanza = 0;     // quanto vale il fatto in sé, a prescindere da quanti lo raccontano

  const testate = new Set(gruppo.map(a => a.fonte.replace(/-.*$/, '')));  // le sezioni di una testata sono una fonte
  const primarie = gruppo.filter(a => a.tipo === 'primaria');
  const analisi  = gruppo.filter(a => a.tipo === 'analisi');

  /* Su una testata locale molte notizie vere le copre una fonte sola:
     se la linea lo prevede (`fonte_sola` nella configurazione), una
     fonte abbastanza autorevole regge un fatto da sola. */
  const pesoFonte = Math.max(...gruppo.map(a => a.peso ?? 0));
  const solaAmmessa = !!(T.fonte_sola && pesoFonte >= T.fonte_sola.peso_min);

  if (primarie.length) {
    punti += 8; sostanza += 8; motivi.push(`fonte primaria (${primarie[0].testata})`);
  }
  if (analisi.length) {
    punti += 2; sostanza += 2; motivi.push('ripreso da analisi');
  }

  const indip = testate.size;
  if (indip >= 4)      { punti += 5; motivi.push(`${indip} testate indipendenti`); }
  else if (indip >= 2) { punti += indip; motivi.push(`${indip} testate indipendenti`); }
  else if (!primarie.length && !solaAmmessa) { punti -= 2; motivi.push('una sola fonte, non primaria'); }

  const titoli = gruppo.map(a => a.titolo).join(' · ');

  if (CIFRA.test(titoli))     { punti += 3; sostanza += 3; motivi.push('porta una cifra'); }
  if (DECISIONE.test(titoli)) { punti += 3; sostanza += 3; motivi.push('è una decisione, non un annuncio'); }

  /* Se l'evento tocca una serie che seguiamo, il pezzo potrà essere
     ancorato a un numero verificabile invece che a un aggettivo.
     L'aggancio deve scattare sul concetto, non sul paese: cercando le
     parole del nome della serie, «Inflazione Italia» si agganciava a
     qualunque titolo contenesse «Italia», birraturismo compreso. */
  const aggancio = ANCORE.find(a => a.re.test(titoli));
  if (aggancio && macro.some(s => s.id === aggancio.serie)) {
    punti += 2; sostanza += 2;
    motivi.push(`ancorabile a ${macro.find(s => s.id === aggancio.serie).cosa}`);
  }

  const peso = Math.max(...gruppo.map(a => a.peso ?? 0));
  punti += Math.round(peso / 3);
  sostanza += Math.round(peso / 3);

  /* Fuori perimetro: non si censura, si pesa meno. Una vittoria del
     Brentford resta una notizia, ma non nel giornale di chi segue la
     Juventus — a meno che non tocchi le coppe, e allora il titolo lo
     dice da sé. */
  /* Dove guardare lo dice la testata: sui titoli di norma, ma un
     giornale locale può chiedere di guardare anche i sommari
     (`guarda: "sommari"`), perché il paese spesso sta lì e non nel
     titolo. */
  const dovePerimetro = T.perimetro?.guarda === 'sommari'
    ? `${titoli} · ${gruppo.map(a => a.sommario ?? '').join(' · ')}`
    : titoli;
  if (T.perimetro && !T.perimetro.dentro.test(dovePerimetro)) {
    punti += T.perimetro.punti;
    sostanza += T.perimetro.punti;
    motivi.push('fuori perimetro');
  }

  let rumoroso = false;
  for (const r of RUMORE) {
    if (r.re.test(titoli)) {
      punti += r.punti; sostanza += r.punti;
      motivi.push(r.perche);
      if (r.punti <= -4) rumoroso = true;   // il rumore forte esclude anche dai deboli
    }
  }

  return { punti, sostanza, motivi, rumoroso, indipendenti: indip, primaria: primarie.length > 0, sola_ammessa: solaAmmessa };
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
  const f = T.percorsi.coperti;
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
const dirGrezzo = T.percorsi.grezzo;
const perId     = new Map((await caricaFonti(T)).map(f => [f.id, f]));

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
    console.error(`Nessun grezzo per «${T.id}»: lancia prima \`node tools/raccogli.mjs --testata ${T.id}\`.`);
    process.exit(1);
  }
  return { articoli: [...dentro.values()], da: da.join(' + ') };
}

const grezzo = await leggiGrezzo();
const file = grezzo.da;
const macroFile = path.join(T.percorsi.dati, 'macro.json');
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

const tuttiIGruppi = gruppi.map(g => {
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
    sostanza: p.sostanza,
    rumoroso: p.rumoroso,
    motivi: p.motivi,
    indipendenti: p.indipendenti,
    primaria: p.primaria,
    sola_ammessa: p.sola_ammessa,
    gia_coperto: gia ? { id: gia.id, titolo: gia.titolo, quando: gia.quando } : null,
    titolo_guida: ordinati[0].titolo,
    articoli: ordinati.map((a, i) => ({
      titolo: a.titolo, testata: a.testata, tipo: a.tipo, url: a.url,
      quando: a.quando, sommario: a.sommario, paywall: a.paywall, area: a.area, temi: a.temi,
      ...(i === 0 ? { _chiavi: { parole: a.parole, entita: a.entita, forti: a.forti } } : {}),
    })),
  };
});

/* Due liste, e la linea che le separa non è il punteggio: è la regola
   §3. Un evento raccontato da una fonte sola non primaria **non è
   pubblicabile così com'è**, per quanto alto sia il suo punteggio — e
   metterlo fra i candidati significa solo farlo scartare più tardi.
   Va invece in una lista propria, dove l'azione richiesta è diversa:
   non «giudica se merita» ma «vai a cercare la seconda fonte».
   Eccezione dichiarata: una testata con `fonte_sola` nella propria
   configurazione ammette il fatto retto da una sola fonte autorevole
   (è la regola §4 della linea Trentino). */
const pubblicabile = c => c.indipendenti >= 2 || c.primaria || c.sola_ammessa;

const candidati = tuttiIGruppi
  .filter(c => pubblicabile(c) && c.punti >= MIN_PUNTEGGIO)
  .sort((a, b) => b.punti - a.punti)
  .slice(0, MAX_CANDIDATI);

const deboli = tuttiIGruppi
  .filter(c => !pubblicabile(c)
            && !c.rumoroso
            && !c.gia_coperto
            && c.sostanza >= MIN_SOSTANZA)
  .sort((a, b) => b.sostanza - a.sostanza)
  .slice(0, MAX_DEBOLI);

candidati.forEach((c, i) => { c.id = `c${String(i + 1).padStart(2, '0')}`; });
deboli.forEach((c, i)    => { c.id = `d${String(i + 1).padStart(2, '0')}`; });

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
for (const c of [...candidati, ...deboli]) for (const a of c.articoli) delete a._chiavi;

if (mostra) {
  console.log(`\n[${T.id}] ${dentro.length} articoli nelle ultime ${ORE_FINESTRA}h → ${gruppi.length} eventi → ${candidati.length} candidati + ${deboli.length} segnali deboli\n`);
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

  if (deboli.length) {
    console.log('─'.repeat(72));
    console.log('SEGNALI DEBOLI — sostanza alta, una fonte sola: cercare la seconda\n');
    for (const c of deboli) {
      console.log(`${c.id} [sostanza ${String(c.sostanza).padStart(2)}] ${c.titolo_guida.slice(0, 84)}`);
      console.log(`      ${c.articoli[0].testata} · ${c.motivi.join(' · ')}`);
    }
    console.log();
  }
} else {
  await writeFile(T.percorsi.candidati, JSON.stringify({
    generato: new Date().toISOString(),
    testata: T.id,
    da: file,
    finestra_ore: ORE_FINESTRA,
    articoli_esaminati: dentro.length,
    eventi: gruppi.length,
    candidati,
    segnali_deboli: deboli,
  }, null, 1));
  console.log(`[${T.id}] ${dentro.length} articoli → ${gruppi.length} eventi → ${candidati.length} candidati + ${deboli.length} segnali deboli → ${path.relative(BASE, T.percorsi.candidati)}`);
}
