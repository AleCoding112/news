/* ============================================================
   News — logica dell'app
   Legge dati/indice.json e dati/macro.json, mostra il flusso e
   apre un pezzo alla volta prendendolo da dati/pezzi/.

   L'indice è leggero apposta: il testo intero di un pezzo si
   scarica solo quando lo si apre, così l'apertura dell'app resta
   immediata anche quando l'archivio sarà lungo.
   ============================================================ */

const VERSIONE = '1.0.0';

/* ---------- 1. Costanti e stato ----------------------------- */

const NOMI_TEMI = {
  'macro': 'Macro',
  'politica-monetaria': 'Politica monetaria',
  'mercati': 'Mercati',
  'economia': 'Economia',
  'commercio': 'Commercio',
  'geopolitica': 'Geopolitica',
  'guerre': 'Guerre',
  'difesa': 'Difesa',
  'politica-ue': 'Politica UE',
  'politica-it': 'Politica italiana',
  'regolamentazione': 'Regole',
  'energia': 'Energia',
  'tecnologia': 'Tecnologia',
};

const NOMI_AREE = {
  italia: 'Italia', europa: 'Europa', usa: 'Stati Uniti',
  asia: 'Asia', africa: 'Africa', globale: 'Mondo',
};

/* Quali serie meritano la striscia in cima: quelle che spiegano il
   resto. Le altre restano in macro.json per essere citate nei pezzi. */
const IN_STRISCIA = ['bce-mro', 'hicp-ea', 'spread-btp-bund', 'ust-10a',
                     'cpi-usa', 'fed-funds', 'brent', 'eurusd', 'ftsemib', 'sp500'];

const stato = {
  pezzi: [],          // metadati dall'indice
  testi: new Map(),   // testi già scaricati, per id
  aperti: new Set(),
  filtro: null,       // un tema o un'area, oppure niente
  cerca: '',
};

const $ = s => document.querySelector(s);

/* ---------- 2. Dati ----------------------------------------- */

async function json(percorso) {
  const r = await fetch(percorso, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${percorso}: HTTP ${r.status}`);
  return r.json();
}

async function testoDi(id) {
  if (stato.testi.has(id)) return stato.testi.get(id);
  const p = await json(`./dati/pezzi/${id}.json`);
  stato.testi.set(id, p);
  return p;
}

/* ---------- 3. Formattazione -------------------------------- */

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
              'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/* «3 ore fa» dice quanto è fresca la notizia meglio di un orario;
   oltre le trentasei ore la data assoluta torna più informativa. */
function quandoIn(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 2)    return 'adesso';
  if (min < 60)   return `${min} minuti fa`;
  const ore = Math.round(min / 60);
  if (ore < 36)   return ore === 1 ? 'un\'ora fa' : `${ore} ore fa`;
  return `${d.getDate()} ${MESI[d.getMonth()]}`;
}

/* «2%» e «2,0%» non dicono la stessa cosa: il secondo mostra che il
   decimale e stato misurato. Le percentuali tengono sempre un decimale. */
function numeroIn(v, decimali = 2, minimo = 0) {
  return Number(v).toLocaleString('it-IT', {
    maximumFractionDigits: decimali, minimumFractionDigits: Math.min(minimo, decimali),
  });
}

/* I testi arrivano con i capoversi separati da righe vuote. */
function capoversi(testo) {
  return String(testo ?? '').split(/\n\s*\n/).filter(t => t.trim());
}

function elemento(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = testo;
  return e;
}

function icona(nome) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${nome}`);
  svg.appendChild(use);
  return svg;
}

/* ---------- 4. La striscia dei numeri -----------------------
   Ogni valore porta il suo periodo di riferimento. Le serie
   marcate obsolete si vedono: un dato vecchio presentato come
   attuale è l'errore peggiore che questo sito possa fare. */

function striscia(macro) {
  const dove = $('#macro');
  const serie = IN_STRISCIA
    .map(id => macro.serie.find(s => s.id === id && !s.errore))
    .filter(Boolean);
  if (!serie.length) return;

  for (const s of serie) {
    const v = elemento('div', 'voce' + (s.obsoleto ? ' vecchio' : ''));
    v.appendChild(elemento('span', 'che', s.cosa));

    const grande = Math.abs(s.valore) >= 1000;
    const dec = grande ? 0 : 2;
    const min = (s.unita === '%' || s.unita === 'pp') ? 1 : 0;
    const riga = elemento('div');
    riga.appendChild(elemento('span', 'val', numeroIn(s.valore, dec, min) + (s.unita === '%' ? '%' : '')));

    if (s.variazione != null && s.variazione !== 0) {
      const segno = s.variazione > 0 ? '+' : '−';
      const testo = ` ${segno}${numeroIn(Math.abs(s.variazione), dec, min)}${s.unita === 'pb' ? ' pb' : ''}`;
      riga.appendChild(elemento('span', 'var' + (s.variazione < 0 ? ' giu' : ''), testo));
    }
    v.appendChild(riga);
    v.appendChild(elemento('span', 'quando', s.periodo));
    v.title = `${s.cosa}: ${s.valore} — ${s.fonte}, periodo ${s.periodo}`;
    dove.appendChild(v);
  }
  dove.hidden = false;
}

/* ---------- 5. Filtri e ricerca ----------------------------- */

function pastiglie() {
  const dove = $('#pastiglie');
  dove.textContent = '';

  const temi = [...new Set(stato.pezzi.flatMap(p => p.temi))];
  const aree = [...new Set(stato.pezzi.map(p => p.area))];

  const fai = (chiave, etichetta) => {
    const b = elemento('button', 'pastiglia', etichetta);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(stato.filtro === chiave));
    b.onclick = () => { stato.filtro = stato.filtro === chiave ? null : chiave; disegna(); pastiglie(); };
    dove.appendChild(b);
  };

  fai(null, 'Tutto');
  for (const a of aree) fai(`area:${a}`, NOMI_AREE[a] ?? a);
  for (const t of temi) fai(`tema:${t}`, NOMI_TEMI[t] ?? t);

  /* «Tutto» è attivo quando non c'è nessun filtro. */
  dove.firstChild.setAttribute('aria-pressed', String(!stato.filtro));
}

function passa(p) {
  if (stato.filtro?.startsWith('area:') && p.area !== stato.filtro.slice(5)) return false;
  if (stato.filtro?.startsWith('tema:') && !p.temi.includes(stato.filtro.slice(5))) return false;

  if (stato.cerca) {
    const testo = stato.testi.get(p.id);
    const dove = [p.titolo, p.occhiello,
                  testo?.fatti, testo?.perche_conta, testo?.cosa_non_sappiamo]
      .filter(Boolean).join(' ').toLowerCase();
    if (!dove.includes(stato.cerca)) return false;
  }
  return true;
}

/* ---------- 6. Il feed -------------------------------------- */

function disegna() {
  const feed = $('#feed');
  feed.textContent = '';

  const visibili = stato.pezzi.filter(passa);
  if (!visibili.length) {
    feed.appendChild(elemento('p', 'vuoto',
      stato.cerca ? 'Nessun pezzo con queste parole.' : 'Nessun pezzo per questo filtro.'));
    return;
  }

  for (const p of visibili) feed.appendChild(scheda(p));
}

function scheda(p) {
  const art = elemento('article', 'pezzo');
  art.id = `p-${p.id}`;

  const alta = elemento('div', 'riga-alta');
  alta.appendChild(elemento('span', 'area', NOMI_AREE[p.area] ?? p.area));
  for (const t of p.temi) {
    alta.appendChild(elemento('span', 'sep', '·'));
    alta.appendChild(elemento('span', null, NOMI_TEMI[t] ?? t));
  }
  alta.appendChild(elemento('span', 'sep', '·'));
  alta.appendChild(elemento('span', null, quandoIn(p.quando)));
  if (p.confidenza !== 'alta') {
    alta.appendChild(elemento('span', 'sep', '·'));
    alta.appendChild(elemento('span', `fiducia ${p.confidenza}`, `confidenza ${p.confidenza}`));
  }
  if (p.sviluppo_di) {
    const c = elemento('span', 'catena');
    c.appendChild(icona('i-catena'));
    c.appendChild(elemento('span', null, 'sviluppo'));
    alta.appendChild(c);
  }
  art.appendChild(alta);

  const h = elemento('h2', null, p.titolo);
  h.onclick = () => apri(p, art);
  art.appendChild(h);
  art.appendChild(elemento('p', 'occhiello', p.occhiello));

  const b = elemento('button', 'apri');
  b.type = 'button';
  b.appendChild(elemento('span', null, stato.aperti.has(p.id) ? 'Chiudi' : 'Leggi'));
  b.appendChild(icona(stato.aperti.has(p.id) ? 'i-su' : 'i-giu'));
  b.onclick = () => apri(p, art);
  art.appendChild(b);

  if (stato.aperti.has(p.id) && stato.testi.has(p.id)) {
    art.appendChild(corpo(stato.testi.get(p.id)));
  }
  return art;
}

async function apri(p, art) {
  if (stato.aperti.has(p.id)) { stato.aperti.delete(p.id); disegna(); return; }
  stato.aperti.add(p.id);
  try {
    await testoDi(p.id);
  } catch (e) {
    stato.aperti.delete(p.id);
    art.appendChild(elemento('p', 'vuoto', 'Il testo non è raggiungibile.'));
    return;
  }
  disegna();
  document.getElementById(`p-${p.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/* ---------- 7. Il corpo del pezzo ---------------------------
   L'ordine è quello della linea editoriale: i fatti, il canale
   causale, l'incertezza, le divergenze, i numeri, le fonti.
   Incertezza e divergenze non sono in fondo per caso: stanno
   prima delle fonti perché fanno parte del pezzo, non del corredo. */

function sezione(classe, iconaNome, titolo, contenuto) {
  const s = elemento('section', `sezione ${classe}`);
  const h = elemento('h3');
  h.appendChild(icona(iconaNome));
  h.appendChild(elemento('span', null, titolo));
  s.appendChild(h);
  s.appendChild(contenuto);
  return s;
}

function testoIn(t) {
  const d = document.createElement('div');
  for (const c of capoversi(t)) d.appendChild(elemento('p', null, c));
  return d;
}

function corpo(p) {
  const c = elemento('div', 'corpo');

  c.appendChild(testoIn(p.fatti));
  c.appendChild(sezione('perche', 'i-perche', 'Perché conta', testoIn(p.perche_conta)));
  c.appendChild(sezione('dubbio', 'i-dubbio', 'Cosa non sappiamo', testoIn(p.cosa_non_sappiamo)));

  if (p.divergenze?.trim()) {
    c.appendChild(sezione('diverge', 'i-diverge', 'Le fonti divergono', testoIn(p.divergenze)));
  }

  if (p.numeri?.length) {
    const g = elemento('div', 'numeri');
    for (const n of p.numeri) {
      const r = elemento('div', 'numero');
      r.appendChild(elemento('span', 'val', n.valore));
      r.appendChild(elemento('span', 'che', n.cosa));
      r.appendChild(elemento('span', 'prov', `${n.fonte} · ${n.quando}`));
      g.appendChild(r);
    }
    c.appendChild(sezione('cifre', 'i-tema', 'I numeri, dalla fonte primaria', g));
  }

  const g = elemento('div', 'fonti');
  for (const f of p.fonti ?? []) {
    const r = elemento('div', 'fonte');

    /* La testata viene prima del titolo, come in un lancio d'agenzia:
       apre il blocco e dice subito di chi stiamo per leggere le parole.
       Accanto, come l'abbiamo usata — una fonte primaria e una che
       abbiamo solo visto passare non valgono lo stesso, e chi legge
       deve poterlo distinguere senza chiederlo. */
    const meta = elemento('div', 'meta');
    meta.appendChild(elemento('span', 'testata', f.testata));
    if (f.tipo === 'primaria') meta.appendChild(elemento('span', 'bollo primaria', 'primaria'));
    if (f.tipo === 'analisi')  meta.appendChild(elemento('span', 'bollo', 'analisi'));
    if (!f.letto)              meta.appendChild(elemento('span', 'bollo nonletto', 'solo titolo'));
    r.appendChild(meta);

    const a = document.createElement('a');
    a.href = f.url; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = f.titolo || f.testata;
    r.appendChild(a);

    g.appendChild(r);
  }
  c.appendChild(sezione('fonti-sez', 'i-fonte', 'Fonti', g));

  if (p.sviluppo_di) {
    const prima = stato.pezzi.find(x => x.id === p.sviluppo_di);
    if (prima) {
      const s = elemento('div', 'catena');
      s.appendChild(icona('i-catena'));
      s.appendChild(elemento('span', null, `Sviluppo di: ${prima.titolo}`));
      c.appendChild(s);
    }
  }
  return c;
}

/* ---------- 8. Tema ----------------------------------------- */

function tema() {
  const salvato = localStorage.getItem('news-tema');
  if (salvato) document.documentElement.dataset.tema = salvato;

  $('#btn-tema').onclick = () => {
    const scuroOra = document.documentElement.dataset.tema
      ? document.documentElement.dataset.tema === 'scuro'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    const nuovo = scuroOra ? 'chiaro' : 'scuro';
    document.documentElement.dataset.tema = nuovo;
    localStorage.setItem('news-tema', nuovo);
  };
}

/* ---------- 9. Avvio ---------------------------------------- */

async function avvia() {
  tema();

  try {
    const indice = await json('./dati/indice.json');
    stato.pezzi = indice.pezzi ?? [];
    $('#aggiornato').textContent =
      `Ultimo aggiornamento: ${new Date(indice.aggiornato).toLocaleString('it-IT')} · versione ${VERSIONE}`;
  } catch (e) {
    $('#feed').textContent = '';
    $('#feed').appendChild(elemento('p', 'vuoto',
      'Non trovo dati/indice.json. Serve un server: `python3 -m http.server 8765`.'));
    return;
  }

  /* I numeri non bloccano la lettura: se non ci sono, la striscia
     semplicemente non compare. */
  json('./dati/macro.json').then(striscia).catch(() => {});

  pastiglie();
  $('#filtri').hidden = false;
  $('#chiusa').hidden = false;
  disegna();

  const campo = $('#cerca'), pulisci = $('#pulisci');
  campo.oninput = () => {
    stato.cerca = campo.value.trim().toLowerCase();
    pulisci.hidden = !stato.cerca;
    disegna();
  };
  pulisci.onclick = () => { campo.value = ''; stato.cerca = ''; pulisci.hidden = true; disegna(); campo.focus(); };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

avvia();
