/* ============================================================
   News — logica dell'app
   Legge dati/indice.json e apre un pezzo alla volta prendendolo
   da dati/pezzi/. L'indice è leggero apposta: il testo intero si
   scarica solo quando serve, così l'apertura resta immediata
   anche quando l'archivio sarà lungo.

   Quattro sezioni, che rispondono a quattro domande diverse:
   che cosa è successo, che cosa sta per succedere, a che punto
   sono le storie aperte, e se le cose che abbiamo detto si sono
   poi avverate.
   ============================================================ */

const VERSIONE = '2.0.0';

/* ---------- 1. Costanti e stato ----------------------------- */

const NOMI_TEMI = {
  'macro': 'Macro', 'politica-monetaria': 'Politica monetaria', 'mercati': 'Mercati',
  'economia': 'Economia', 'commercio': 'Commercio', 'geopolitica': 'Geopolitica',
  'guerre': 'Guerre', 'difesa': 'Difesa', 'politica-ue': 'Politica UE',
  'politica-it': 'Politica italiana', 'regolamentazione': 'Regole',
  'energia': 'Energia', 'tecnologia': 'Tecnologia',
};

const NOMI_AREE = {
  italia: 'Italia', europa: 'Europa', usa: 'Stati Uniti',
  asia: 'Asia', africa: 'Africa', globale: 'Mondo',
};

const NOMI_TIPI = {
  notizia: null,                      // il caso normale non ha bisogno di etichetta
  analisi: 'analisi',
  calendario: 'in arrivo',
  mancato: 'non è successo',
};

const NOMI_ESITI = {
  aperta: 'in attesa', giusta: 'azzeccata',
  sbagliata: 'sbagliata', non_verificabile: 'non verificabile',
};

const stato = {
  pezzi: [], testi: new Map(), aperti: new Set(),
  macro: null, calendario: null, dossier: [], previsioni: null,
  filtro: null, cerca: '',
  sezione: 'flusso',
  densita: localStorage.getItem('news-densita') || 'estesa',
  letti: new Set(JSON.parse(localStorage.getItem('news-letti') || '[]')),
  storiaAperta: null,
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
  if (min < 2)  return 'adesso';
  if (min < 60) return `${min} minuti fa`;
  const ore = Math.round(min / 60);
  if (ore < 36) return ore === 1 ? 'un\'ora fa' : `${ore} ore fa`;
  return `${d.getDate()} ${MESI[d.getMonth()]}`;
}

/* Il periodo di un dato si scrive come lo direbbe una persona:
   «23 ago» per un dato giornaliero, «lug 2026» per un mensile,
   «2º trim 2026» per un trimestrale. Un'etichetta ISO in cima alla
   pagina è un residuo di database, non un'informazione. */
const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

function periodoIn(periodo) {
  const p = String(periodo);
  const t = /^(\d{4})-Q(\d)$/.exec(p);
  if (t) return `${t[2]}º trim ${t[1]}`;
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  if (m) return `${MESI_BREVI[+m[2] - 1]} ${m[1]}`;
  const g = /^(\d{4})-(\d{2})-(\d{2})/.exec(p);
  if (g) return `${+g[3]} ${MESI_BREVI[+g[2] - 1]}`;
  return p;
}

function giornoIn(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return `${d.getDate()} ${MESI[d.getMonth()]}`;
}

/* «2%» e «2,0%» non dicono la stessa cosa: il secondo mostra che il
   decimale è stato misurato. Le percentuali tengono un decimale. */
function numeroIn(v, decimali = 2, minimo = 0) {
  return Number(v).toLocaleString('it-IT', {
    maximumFractionDigits: decimali, minimumFractionDigits: Math.min(minimo, decimali),
  });
}

function capoversi(testo) {
  return String(testo ?? '').split(/\n\s*\n/).filter(t => t.trim());
}

function elemento(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = testo;
  return e;
}

function icona(nome, classe) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  if (classe) svg.setAttribute('class', classe);
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${nome}`);
  svg.appendChild(use);
  return svg;
}

/* ---------- 4. La micro-serie -------------------------------
   Dieci anni di storia in cinquanta pixel. Non serve a leggere i
   valori — serve a vedere se il numero di oggi è un ritorno alla
   normalità o un'anomalia, che è la domanda che un numero solo non
   può mai sfiorare. */

function microSerie(punti, larghezza = 56, altezza = 18) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'micro');
  svg.setAttribute('viewBox', `0 0 ${larghezza} ${altezza}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  if (!punti || punti.length < 2) return svg;

  const min = Math.min(...punti), max = Math.max(...punti);
  const campo = (max - min) || 1;
  const y = v => altezza - 1.5 - ((v - min) / campo) * (altezza - 3);
  const x = i => (i / (punti.length - 1)) * larghezza;

  const linea = punti.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');

  const area = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  area.setAttribute('class', 'micro-area');
  area.setAttribute('points', `0,${altezza} ${linea} ${larghezza},${altezza}`);
  svg.appendChild(area);

  const tratto = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  tratto.setAttribute('class', 'micro-linea');
  tratto.setAttribute('points', linea);
  svg.appendChild(tratto);

  const punto = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  punto.setAttribute('class', 'micro-oggi');
  punto.setAttribute('cx', larghezza - 1.2);
  punto.setAttribute('cy', y(punti.at(-1)));
  punto.setAttribute('r', 1.6);
  svg.appendChild(punto);

  return svg;
}

/* ---------- 5. La striscia dei numeri -----------------------
   Ogni valore porta il suo periodo di riferimento. Le serie marcate
   obsolete si vedono: un dato vecchio presentato come attuale è
   l'errore peggiore che questo sito possa fare. */

function decimaliDi(s) {
  return { dec: Math.abs(s.valore) >= 1000 ? 0 : 2, min: (s.unita === '%' || s.unita === 'pp') ? 1 : 0 };
}

function striscia() {
  const dove = $('#macro');
  dove.textContent = '';
  const serie = (stato.macro?.serie ?? [])
    .filter(s => !s.errore && s.striscia)
    .sort((a, b) => a.striscia - b.striscia);
  if (!serie.length) return;

  for (const s of serie) {
    const v = elemento('button', 'voce' + (s.obsoleto ? ' vecchio' : ''));
    v.type = 'button';
    v.setAttribute('aria-pressed', String(stato.storiaAperta === s.id));
    v.appendChild(elemento('span', 'che', s.breve ?? s.cosa));

    const { dec, min } = decimaliDi(s);
    const riga = elemento('div', 'riga');
    riga.appendChild(elemento('span', 'val', numeroIn(s.valore, dec, min) + (s.unita === '%' ? '%' : '')));
    if (s.variazione != null && s.variazione !== 0) {
      const segno = s.variazione > 0 ? '+' : '−';
      riga.appendChild(elemento('span', 'var' + (s.variazione < 0 ? ' giu' : ''),
        ` ${segno}${numeroIn(Math.abs(s.variazione), dec, min)}${s.unita === 'pb' ? ' pb' : ''}`));
    }
    v.appendChild(riga);

    if (s.storia?.punti) v.appendChild(microSerie(s.storia.punti));
    v.appendChild(elemento('span', 'quando', periodoIn(s.periodo)));

    v.onclick = () => {
      stato.storiaAperta = stato.storiaAperta === s.id ? null : s.id;
      striscia(); laStoria();
    };
    dove.appendChild(v);
  }
  dove.hidden = false;
}

/* Un numero interrogato risponde: da dove viene, quanto è vecchio,
   e soprattutto se è alto o basso rispetto a sé stesso. */
function laStoria() {
  const dove = $('#storia');
  dove.textContent = '';
  const s = (stato.macro?.serie ?? []).find(x => x.id === stato.storiaAperta);
  if (!s) { dove.hidden = true; return; }

  const { dec, min } = decimaliDi(s);
  const n = v => numeroIn(v, dec, min);

  dove.appendChild(elemento('h3', null, s.cosa));

  if (s.storia) {
    const st = s.storia;
    const frasi = [];
    frasi.push(st.percentile >= 50
      ? `Più alto del ${st.percentile}% delle rilevazioni degli ultimi ${st.anni} anni.`
      : `Più basso del ${100 - st.percentile}% delle rilevazioni degli ultimi ${st.anni} anni.`);
    frasi.push(`Media del periodo ${n(st.media)}${s.unita === '%' ? '%' : ''}.`);
    frasi.push(`Minimo ${n(st.min.valore)} a ${periodoIn(st.min.quando)}, massimo ${n(st.max.valore)} a ${periodoIn(st.max.quando)}.`);
    if (st.max_di_sempre) frasi.push(`Il massimo di sempre resta ${n(st.max_di_sempre.valore)}, a ${periodoIn(st.max_di_sempre.quando)}.`);
    dove.appendChild(elemento('p', 'racconto', frasi.join(' ')));

    const grande = microSerie(st.punti, 300, 54);
    grande.setAttribute('class', 'micro grande');
    dove.appendChild(grande);
    const estremi = elemento('p', 'estremi');
    estremi.appendChild(elemento('span', null, periodoIn(st.da)));
    estremi.appendChild(elemento('span', null, periodoIn(st.a)));
    dove.appendChild(estremi);
  }

  const meta = elemento('p', 'provenienza');
  meta.appendChild(elemento('span', null, `Fonte: ${s.fonte}. Dato riferito a ${periodoIn(s.periodo)}.`));
  if (s.obsoleto) meta.appendChild(elemento('span', 'vecchio-nota', ` Ha ${s.giorni_dal_dato} giorni: non è la fotografia di oggi.`));
  dove.appendChild(meta);

  dove.hidden = false;
}

/* ---------- 6. Letto e non letto ----------------------------
   Serve a rispondere a colpo d'occhio alla domanda «c'è qualcosa
   di nuovo?». Lo stato vive nel dispositivo: è una comodità di chi
   legge, non un dato del giornale. */

function salvaLetti() {
  try { localStorage.setItem('news-letti', JSON.stringify([...stato.letti].slice(-400))); } catch {}
}

function segnaLetto(id) {
  if (stato.letti.has(id)) return;
  stato.letti.add(id);
  salvaLetti();
  contaNuovi();
}

function contaNuovi() {
  const n = stato.pezzi.filter(p => !stato.letti.has(p.id)).length;
  const pallino = $('#conta-nuovi');
  pallino.textContent = n > 99 ? '99+' : String(n);
  pallino.hidden = n === 0;
  $('#claim').textContent = n
    ? `${n} ${n === 1 ? 'pezzo non letto' : 'pezzi non letti'}`
    : 'Le notizie che contano, con i criteri scritti in chiaro';
}

/* ---------- 7. Filtri e ricerca ----------------------------- */

function pastiglie() {
  const dove = $('#pastiglie');
  dove.textContent = '';

  const temi = [...new Set(stato.pezzi.flatMap(p => p.temi))];
  const aree = [...new Set(stato.pezzi.map(p => p.area))];

  const fai = (chiave, etichetta) => {
    const b = elemento('button', 'pastiglia', etichetta);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(chiave === null ? !stato.filtro : stato.filtro === chiave));
    b.onclick = () => { stato.filtro = stato.filtro === chiave ? null : chiave; disegna(); pastiglie(); };
    dove.appendChild(b);
  };

  fai(null, 'Tutto');
  if (stato.pezzi.some(p => !stato.letti.has(p.id))) fai('nuovi', 'Non letti');
  for (const a of aree) fai(`area:${a}`, NOMI_AREE[a] ?? a);
  for (const t of temi) fai(`tema:${t}`, NOMI_TEMI[t] ?? t);
}

function passa(p) {
  if (stato.filtro === 'nuovi' && stato.letti.has(p.id)) return false;
  if (stato.filtro?.startsWith('area:') && p.area !== stato.filtro.slice(5)) return false;
  if (stato.filtro?.startsWith('tema:') && !p.temi.includes(stato.filtro.slice(5))) return false;

  if (stato.cerca) {
    const testo = stato.testi.get(p.id);
    const dove = [p.titolo, p.unaRiga, p.occhiello,
                  testo?.fatti, testo?.perche_conta, testo?.cosa_non_sappiamo]
      .filter(Boolean).join(' ').toLowerCase();
    if (!dove.includes(stato.cerca)) return false;
  }
  return true;
}

/* ---------- 8. Il flusso ------------------------------------ */

function disegna() {
  if (stato.sezione !== 'flusso') return;
  const palco = $('#palco');
  palco.textContent = '';

  const visibili = stato.pezzi.filter(passa);
  if (!visibili.length) {
    palco.appendChild(elemento('p', 'vuoto',
      stato.cerca ? 'Nessun pezzo con queste parole.'
      : stato.filtro === 'nuovi' ? 'Hai letto tutto.'
      : 'Nessun pezzo per questo filtro.'));
    return;
  }
  for (const p of visibili) palco.appendChild(scheda(p));
}

function scheda(p) {
  const letto = stato.letti.has(p.id);
  const aperto = stato.aperti.has(p.id);
  const art = elemento('article', `pezzo${letto ? ' letto' : ''}${stato.densita === 'compatta' && !aperto ? ' compatta' : ''}`);
  art.id = `p-${p.id}`;

  const alta = elemento('div', 'riga-alta');
  if (!letto) alta.appendChild(elemento('span', 'nuovo', ''));
  alta.appendChild(elemento('span', 'area', NOMI_AREE[p.area] ?? p.area));
  if (NOMI_TIPI[p.tipo]) {
    alta.appendChild(elemento('span', 'sep', '·'));
    alta.appendChild(elemento('span', 'tipo', NOMI_TIPI[p.tipo]));
  }
  if (stato.densita !== 'compatta' || aperto) {
    for (const t of p.temi) {
      alta.appendChild(elemento('span', 'sep', '·'));
      alta.appendChild(elemento('span', null, NOMI_TEMI[t] ?? t));
    }
  }
  alta.appendChild(elemento('span', 'sep', '·'));
  alta.appendChild(elemento('span', null, quandoIn(p.quando)));
  if (p.confidenza !== 'alta') {
    alta.appendChild(elemento('span', 'sep', '·'));
    alta.appendChild(elemento('span', `fiducia ${p.confidenza}`, `confidenza ${p.confidenza}`));
  }
  if (p.previsione) {
    const b = elemento('span', 'bollino');
    b.appendChild(icona('i-mira'));
    b.appendChild(elemento('span', null, 'previsione'));
    alta.appendChild(b);
  }
  if (p.sviluppo_di) {
    const c = elemento('span', 'bollino');
    c.appendChild(icona('i-catena'));
    c.appendChild(elemento('span', null, 'sviluppo'));
    alta.appendChild(c);
  }
  art.appendChild(alta);

  /* Compatta: una riga sola, il fatto in sé. Estesa: il titolo e
     l'occhiello. Aperta: tutto. Tre profondità, si sceglie la propria. */
  if (stato.densita === 'compatta' && !aperto) {
    const riga = elemento('p', 'una-riga', p.unaRiga);
    riga.onclick = () => apri(p);
    art.appendChild(riga);
  } else {
    const h = elemento('h2', null, p.titolo);
    h.onclick = () => apri(p);
    art.appendChild(h);
    art.appendChild(elemento('p', 'occhiello', p.occhiello));

    const b = elemento('button', 'apri');
    b.type = 'button';
    b.appendChild(elemento('span', null, aperto ? 'Chiudi' : 'Leggi'));
    b.appendChild(icona(aperto ? 'i-su' : 'i-giu'));
    b.onclick = () => apri(p);
    art.appendChild(b);
  }

  if (aperto && stato.testi.has(p.id)) art.appendChild(corpo(stato.testi.get(p.id)));
  return art;
}

async function apri(p) {
  if (stato.aperti.has(p.id)) { stato.aperti.delete(p.id); disegna(); return; }
  stato.aperti.add(p.id);
  segnaLetto(p.id);
  try { await testoDi(p.id); }
  catch { stato.aperti.delete(p.id); disegna(); return; }
  disegna(); pastiglie();
  document.getElementById(`p-${p.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/* ---------- 9. Il corpo del pezzo ---------------------------
   L'ordine è quello della linea editoriale: i fatti, il canale
   causale, l'incertezza, le divergenze, la previsione, i numeri,
   le fonti. Incertezza e divergenze non stanno in fondo per caso:
   vengono prima delle fonti perché fanno parte del pezzo, non del
   corredo. */

function sezione(classe, nomeIcona, titolo, contenuto) {
  const s = elemento('section', `sezione ${classe}`);
  const h = elemento('h3');
  h.appendChild(icona(nomeIcona));
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

  if (stato.densita === 'compatta') {
    c.appendChild(elemento('h2', 'titolo-interno', p.titolo));
    c.appendChild(elemento('p', 'occhiello', p.occhiello));
  }

  if (p.fatti) c.appendChild(testoIn(p.fatti));
  if (p.perche_conta)      c.appendChild(sezione('perche', 'i-perche', 'Perché conta', testoIn(p.perche_conta)));
  if (p.cosa_non_sappiamo) c.appendChild(sezione('dubbio', 'i-dubbio', 'Cosa non sappiamo', testoIn(p.cosa_non_sappiamo)));
  if (p.divergenze?.trim()) c.appendChild(sezione('diverge', 'i-diverge', 'Le fonti divergono', testoIn(p.divergenze)));

  if (p.previsione) {
    const d = elemento('div', `previsione esito-${p.previsione.esito ?? 'aperta'}`);
    d.appendChild(elemento('p', 'afferma', p.previsione.afferma));
    const meta = elemento('p', 'meta');
    meta.appendChild(elemento('span', 'esito', NOMI_ESITI[p.previsione.esito ?? 'aperta']));
    meta.appendChild(elemento('span', null, `entro il ${giornoIn(p.previsione.scade)}`));
    d.appendChild(meta);
    d.appendChild(elemento('p', 'verifica', `Si verifica così: ${p.previsione.come_si_verifica}`));
    c.appendChild(sezione('mira', 'i-mira', 'La previsione che questo pezzo si assume', d));
  }

  if (p.numeri?.length) {
    const g = elemento('div', 'numeri');
    for (const n of p.numeri) {
      const r = elemento('div', 'numero');
      r.appendChild(elemento('span', 'val', n.valore));
      r.appendChild(elemento('span', 'che', n.cosa));
      r.appendChild(elemento('span', 'prov', `${n.fonte} · ${n.quando}`));
      const s = (stato.macro?.serie ?? []).find(x => x.id === n.serie);
      if (s?.storia) {
        const nota = s.storia.percentile >= 50
          ? `sopra il ${s.storia.percentile}% delle rilevazioni di ${s.storia.anni} anni`
          : `sotto il ${100 - s.storia.percentile}% delle rilevazioni di ${s.storia.anni} anni`;
        r.appendChild(elemento('span', 'contesto', nota));
        r.appendChild(microSerie(s.storia.punti));
      }
      g.appendChild(r);
    }
    c.appendChild(sezione('cifre', 'i-cifre', 'I numeri, dalla fonte primaria', g));
  }

  const g = elemento('div', 'fonti');
  for (const f of p.fonti ?? []) {
    const r = elemento('div', 'fonte');
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

  const coda = elemento('div', 'coda');
  if (p.dossier) {
    const d = stato.dossier.find(x => x.slug === p.dossier);
    if (d) {
      const b = elemento('button', 'rimando');
      b.type = 'button';
      b.appendChild(icona('i-dossier'));
      b.appendChild(elemento('span', null, `Dossier: ${d.titolo}`));
      b.onclick = () => vaiA('dossier');
      coda.appendChild(b);
    }
  }
  if (p.sviluppo_di) {
    const prima = stato.pezzi.find(x => x.id === p.sviluppo_di);
    if (prima) {
      const s = elemento('span', 'rimando');
      s.appendChild(icona('i-catena'));
      s.appendChild(elemento('span', null, `Sviluppo di: ${prima.titolo}`));
      coda.appendChild(s);
    }
  }
  if (coda.childElementCount) c.appendChild(coda);

  return c;
}

/* ---------- 10. In arrivo -----------------------------------
   Sapere che giovedì decide la BCE vale spesso più che sapere
   cos'è successo ieri. */

function inArrivo() {
  const palco = $('#palco');
  palco.textContent = '';

  const cal = stato.calendario;
  if (!cal?.eventi?.length) {
    palco.appendChild(elemento('p', 'vuoto', 'Il calendario è vuoto.'));
    return;
  }

  const oggi = new Date().toISOString().slice(0, 10);
  const prossimi = cal.eventi.filter(e => e.quando >= oggi).sort((a, b) => a.quando.localeCompare(b.quando));

  if (!prossimi.length) {
    palco.appendChild(elemento('p', 'vuoto', 'Niente in programma: il calendario va rinfrescato.'));
    return;
  }

  for (const e of prossimi) {
    const g = Math.round((new Date(e.quando) - new Date(oggi)) / 86400000);
    const v = elemento('article', 'evento');

    const q = elemento('div', 'data');
    q.appendChild(elemento('span', 'giorno', giornoIn(e.quando)));
    q.appendChild(elemento('span', 'fra', g === 0 ? 'oggi' : g === 1 ? 'domani' : `fra ${g} giorni`));
    v.appendChild(q);

    const d = elemento('div', 'dettaglio');
    const alta = elemento('div', 'riga-alta');
    alta.appendChild(elemento('span', 'area', NOMI_AREE[e.area] ?? e.area));
    alta.appendChild(elemento('span', 'sep', '·'));
    alta.appendChild(elemento('span', null, e.tipo));
    d.appendChild(alta);
    d.appendChild(elemento('h2', null, e.cosa));
    if (e.perche)  d.appendChild(elemento('p', 'occhiello', e.perche));
    if (e.atteso)  d.appendChild(elemento('p', 'atteso', `Atteso: ${e.atteso}`));
    const a = document.createElement('a');
    a.href = e.fonte; a.target = '_blank'; a.rel = 'noopener';
    a.className = 'fonte-link'; a.textContent = 'la fonte';
    d.appendChild(a);
    v.appendChild(d);

    palco.appendChild(v);
  }

  if (cal.buchi_noti) {
    const n = elemento('div', 'avvertenza');
    n.appendChild(elemento('h3', null, 'Che cosa manca da questo calendario'));
    for (const testo of Object.values(cal.buchi_noti)) n.appendChild(elemento('p', null, testo));
    palco.appendChild(n);
  }
}

/* ---------- 11. Dossier -------------------------------------
   Una storia che continua non si riscrive da capo: si aggiorna.
   Qui si vede il filo intero invece dell'ultimo anello. */

function iDossier() {
  const palco = $('#palco');
  palco.textContent = '';

  if (!stato.dossier.length) {
    palco.appendChild(elemento('p', 'vuoto', 'Nessun dossier aperto.'));
    return;
  }

  for (const d of stato.dossier) {
    const v = elemento('article', 'dossier');
    const alta = elemento('div', 'riga-alta');
    alta.appendChild(elemento('span', 'area', NOMI_AREE[d.area] ?? d.area));
    alta.appendChild(elemento('span', 'sep', '·'));
    alta.appendChild(elemento('span', null, d.stato === 'aperto' ? 'in corso' : 'chiuso'));
    alta.appendChild(elemento('span', 'sep', '·'));
    alta.appendChild(elemento('span', null, `dal ${giornoIn(d.aperto)}`));
    v.appendChild(alta);

    v.appendChild(elemento('h2', null, d.titolo));
    v.appendChild(sezione('perche', 'i-perche', 'Dove siamo', testoIn(d.dove_siamo)));

    if (d.cronologia?.length) {
      const c = elemento('ol', 'cronologia');
      for (const t of d.cronologia) {
        const li = elemento('li');
        li.appendChild(elemento('span', 'quando', periodoIn(t.quando)));
        li.appendChild(elemento('span', 'cosa', t.cosa));
        if (t.pezzo) {
          const b = elemento('button', 'vai', 'il pezzo');
          b.type = 'button';
          b.onclick = () => { vaiA('flusso'); const p = stato.pezzi.find(x => x.id === t.pezzo); if (p) apri(p); };
          li.appendChild(b);
        }
        c.appendChild(li);
      }
      v.appendChild(sezione('storia-sez', 'i-calendario', 'Come ci siamo arrivati', c));
    }

    if (d.cosa_guardare?.length) {
      const u = elemento('ul', 'guardare');
      for (const g of d.cosa_guardare) u.appendChild(elemento('li', null, g));
      v.appendChild(sezione('mira', 'i-mira', 'Cosa guardare', u));
    }

    palco.appendChild(v);
  }
}

/* ---------- 12. Previsioni ----------------------------------
   L'unica misura onesta del fatto che il giornale funzioni invece
   di essere soltanto ben scritto. Va mostrata anche quando è
   imbarazzante — soprattutto allora. */

function lePrevisioni() {
  const palco = $('#palco');
  palco.textContent = '';

  const reg = stato.previsioni;
  if (!reg?.previsioni?.length) {
    palco.appendChild(elemento('p', 'vuoto', 'Nessuna previsione ancora.'));
    return;
  }

  const t = reg.tabellone;
  const tab = elemento('div', 'tabellone');
  const voce = (n, che, classe) => {
    const d = elemento('div', `punto ${classe ?? ''}`);
    d.appendChild(elemento('span', 'n', String(n)));
    d.appendChild(elemento('span', 'che', che));
    tab.appendChild(d);
  };
  voce(t.aperte, 'in attesa');
  voce(t.giuste, 'azzeccate', 'bene');
  voce(t.sbagliate, 'sbagliate', 'male');
  if (t.tasso != null) voce(`${t.tasso}%`, 'di riuscita');
  palco.appendChild(tab);

  if (t.tasso == null) {
    palco.appendChild(elemento('p', 'nota-tabellone',
      'Nessuna previsione è ancora scaduta: il tasso di riuscita comparirà quando ce ne sarà almeno una chiusa. Le previsioni aperte non contano né come giuste né come sbagliate.'));
  }

  for (const p of reg.previsioni) {
    const v = elemento('article', `previsione esito-${p.esito}`);
    const alta = elemento('div', 'riga-alta');
    alta.appendChild(elemento('span', 'esito', NOMI_ESITI[p.esito]));
    alta.appendChild(elemento('span', 'sep', '·'));
    alta.appendChild(elemento('span', null, `entro il ${giornoIn(p.scade)}`));
    v.appendChild(alta);

    v.appendChild(elemento('p', 'afferma', p.afferma));
    v.appendChild(elemento('p', 'verifica', `Si verifica così: ${p.come_si_verifica}`));
    if (p.nota) v.appendChild(elemento('p', 'nota', p.nota));

    const b = elemento('button', 'vai', `dal pezzo: ${p.titolo}`);
    b.type = 'button';
    b.onclick = () => { vaiA('flusso'); const x = stato.pezzi.find(y => y.id === p.pezzo); if (x) apri(x); };
    v.appendChild(b);

    palco.appendChild(v);
  }
}

/* ---------- 13. Sezioni, densità, tema ---------------------- */

function vaiA(sez) {
  stato.sezione = sez;
  for (const b of document.querySelectorAll('#sezioni button')) {
    b.setAttribute('aria-pressed', String(b.dataset.sez === sez));
  }
  $('#filtri').hidden = sez !== 'flusso';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (sez === 'flusso')          disegna();
  else if (sez === 'arrivo')     inArrivo();
  else if (sez === 'dossier')    iDossier();
  else if (sez === 'previsioni') lePrevisioni();
}

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

/* ---------- 14. Avvio --------------------------------------- */

async function avvia() {
  tema();

  try {
    const indice = await json('./dati/indice.json');
    stato.pezzi = indice.pezzi ?? [];
    $('#aggiornato').textContent =
      `Ultimo aggiornamento: ${new Date(indice.aggiornato).toLocaleString('it-IT')} · versione ${VERSIONE}`;
  } catch {
    $('#palco').textContent = '';
    $('#palco').appendChild(elemento('p', 'vuoto',
      'Non trovo dati/indice.json. Serve un server: `python3 -m http.server 8765`.'));
    return;
  }

  /* Il contorno non blocca la lettura: se un pezzo di dati manca,
     la sua sezione lo dice e il resto funziona lo stesso. */
  json('./dati/macro.json').then(m => { stato.macro = m; striscia(); }).catch(() => {});
  json('./dati/calendario.json').then(c => { stato.calendario = c; }).catch(() => {});
  json('./dati/previsioni.json').then(p => { stato.previsioni = p; }).catch(() => {});

  const slugs = [...new Set(stato.pezzi.map(p => p.dossier).filter(Boolean))];
  Promise.all(slugs.map(s => json(`./dati/dossier/${s}.json`).catch(() => null)))
    .then(d => { stato.dossier = d.filter(Boolean); });

  contaNuovi();
  pastiglie();
  $('#sezioni').hidden = false;
  $('#filtri').hidden = false;
  $('#chiusa').hidden = false;
  disegna();

  for (const b of document.querySelectorAll('#sezioni button')) {
    b.onclick = () => vaiA(b.dataset.sez);
  }

  const campo = $('#cerca'), pulisci = $('#pulisci');
  campo.oninput = () => {
    stato.cerca = campo.value.trim().toLowerCase();
    pulisci.hidden = !stato.cerca;
    disegna();
  };
  pulisci.onclick = () => { campo.value = ''; stato.cerca = ''; pulisci.hidden = true; disegna(); campo.focus(); };

  const btnDensita = $('#densita');
  const aggiornaDensita = () => {
    btnDensita.setAttribute('aria-pressed', String(stato.densita === 'compatta'));
    btnDensita.title = stato.densita === 'compatta' ? 'Torna al titolo esteso' : 'Una riga per pezzo';
  };
  aggiornaDensita();
  btnDensita.onclick = () => {
    stato.densita = stato.densita === 'compatta' ? 'estesa' : 'compatta';
    localStorage.setItem('news-densita', stato.densita);
    aggiornaDensita(); disegna();
  };

  $('#segna-letti').onclick = () => {
    for (const p of stato.pezzi) stato.letti.add(p.id);
    salvaLetti(); contaNuovi(); pastiglie(); disegna();
  };

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

avvia();
