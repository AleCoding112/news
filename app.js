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

const VERSIONE = '2.1.1';

/* ---------- 1. Costanti e stato ----------------------------- */

/* Le due testate hanno temi e aree diversi: qui stanno insieme perché
   le chiavi non si sovrappongono, e chi legge non deve sapere che
   esistono due vocabolari. */
const NOMI_TEMI = {
  'risultati': 'Risultati', 'mercato': 'Mercato', 'infortuni': 'Infortuni',
  'disciplina': 'Giudice sportivo', 'allenatori': 'Panchine', 'tattica': 'Tattica',
  'regolamenti': 'Regolamenti', 'coppe': 'Coppe',
  'macro': 'Macro', 'politica-monetaria': 'Politica monetaria', 'mercati': 'Mercati',
  'economia': 'Economia', 'commercio': 'Commercio', 'geopolitica': 'Geopolitica',
  'guerre': 'Guerre', 'difesa': 'Difesa', 'politica-ue': 'Politica UE',
  'politica-it': 'Politica italiana', 'regolamentazione': 'Regole',
  'energia': 'Energia', 'tecnologia': 'Tecnologia',
};

const NOMI_AREE = {
  italia: 'Italia', europa: 'Europa', usa: 'Stati Uniti',
  asia: 'Asia', africa: 'Africa', globale: 'Mondo',
  juventus: 'Juventus', 'serie-a': 'Serie A', champions: 'Champions',
  'europa-league': 'Europa League', nazionale: 'Nazionale', mondo: 'Mondo',
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

/* Le due facce. Stessa macchina, due giornali: le notizie mettono lo
   sport nella lista nera, il calcio di sport vive. Non condividono i
   criteri, e qui non condividono nemmeno i dati — solo il codice. */
const FACCE = {
  news: {
    nome: 'News',
    claim: 'Le notizie che contano, con i criteri scritti in chiaro',
    linea: 'LINEA-EDITORIALE.md',
    dati: './dati',
    sezioni: [['flusso', 'Flusso'], ['arrivo', 'In arrivo'], ['dossier', 'Dossier'], ['previsioni', 'Previsioni']],
    altra: 'calcio',
  },
  calcio: {
    nome: 'Calcio',
    claim: 'Juventus, Serie A e coppe — i fatti, e quanto valgono',
    linea: 'LINEA-CALCIO.md',
    dati: './dati/calcio',
    sezioni: [['flusso', 'Flusso'], ['classifica', 'Classifica'], ['arrivo', 'In arrivo']],
    altra: 'news',
  },
};

const NOMI_CERTEZZE = {
  fatto: 'fatto', ufficiale: 'ufficiale',
  trattativa: 'trattativa', voce: 'voce',
};

const stato = {
  faccia: localStorage.getItem('news-faccia') === 'calcio' ? 'calcio' : 'news',
  pezzi: [], testi: new Map(), aperti: new Set(),
  macro: null, calendario: null, dossier: [], previsioni: null, campo: null, ciclo: null,
  filtro: null, cerca: '',
  sezione: 'flusso',
  densita: localStorage.getItem('news-densita') || 'estesa',
  testo: localStorage.getItem('news-testo') || 'normale',
  letti: new Set(),
  storiaAperta: null,

  /* Aggiunte della 2.1 */
  partitaAperta: null,        // l'unica scheda partita aperta per volta
  scrollDi: {},               // dove si era lasciata ogni sezione
  stampati: 0,                // quanti pezzi del flusso sono già nel DOM
  indirizzo: '',              // l'ultimo indirizzo applicato, per capire i «indietro»
  caricataIl: Date.now(),     // quando l'edizione in mano è stata presa
  aggiornamentoInCorso: false,
};

/* Quante schede si stampano prima di aspettare che si scorra. Non è la
   velocità di oggi a decidere — con tre pezzi qualunque numero va bene —
   ma l'archivio fra un anno. */
const PRIMO_BLOCCO = 40;
const PASSO_BLOCCO = 25;

/* Dopo quanto, tornando sull'app, vale la pena richiedere l'edizione. */
const RIENTRO_FRESCO = 3 * 60 * 1000;

const F = () => FACCE[stato.faccia];

const $ = s => document.querySelector(s);

/* ---------- 2. Dati ----------------------------------------- */

async function json(percorso) {
  const r = await fetch(percorso, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${percorso}: HTTP ${r.status}`);
  return r.json();
}

async function testoDi(id) {
  if (stato.testi.has(id)) return stato.testi.get(id);
  const p = await json(`${F().dati}/pezzi/${id}.json`);
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

/* Un identificativo stabile da un nome proprio: serve agli indirizzi
   delle partite, che devono restare gli stessi fra un ciclo e l'altro. */
function sillabe(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/* ---------- 3b. Quello che l'app ha da dire -------------------
   Un posto solo, in fondo allo schermo, per le cose che vanno dette
   senza spostare il testo sotto gli occhi di chi legge: una nuova
   edizione, la rete che manca, un indirizzo copiato. Ogni avviso ha
   una chiave, così lo stesso non si accumula due volte. */

const avvisiVivi = new Map();

function avviso(chiave, testo, opzioni = {}) {
  chiudiAvviso(chiave);
  const n = elemento(opzioni.azione ? 'button' : 'div', 'avviso');
  if (opzioni.azione) n.type = 'button';
  if (opzioni.icona) n.appendChild(icona(opzioni.icona));
  n.appendChild(elemento('span', null, testo));
  if (opzioni.azione) {
    n.appendChild(elemento('span', 'azione', opzioni.etichetta ?? 'Aggiorna'));
    n.onclick = () => { chiudiAvviso(chiave); opzioni.azione(); };
  }
  $('#avvisi').appendChild(n);
  avvisiVivi.set(chiave, n);
  annuncia(testo);
  if (opzioni.durata) setTimeout(() => chiudiAvviso(chiave), opzioni.durata);
}

function chiudiAvviso(chiave) {
  const n = avvisiVivi.get(chiave);
  if (n) { n.remove(); avvisiVivi.delete(chiave); }
}

/* L'unica cosa che i lettori di schermo devono sentire di nostra
   iniziativa. Il palco non ha più aria-live apposta: rileggeva l'intera
   lista a ogni ridisegno. */
function annuncia(testo) {
  const a = $('#annuncio');
  if (a) a.textContent = testo;
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
  if (stato.faccia === 'calcio') return strisciaCampo();
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

/* In cima al calcio non stanno i numeri ma la classifica, con la
   squadra che si segue sempre visibile — anche se è nona, e soprattutto
   se è nona — e la prossima partita col conto alla rovescia. */
function strisciaCampo() {
  const dove = $('#macro');
  dove.textContent = '';
  const c = stato.campo;
  if (!c?.classifica?.length) { dove.hidden = true; return; }

  const mia = c.squadra_seguita?.nome ?? 'Juventus';
  const prossima = (c.prossime ?? [])
    .filter(p => new Date(p.quando) >= new Date(Date.now() - 3 * 36e5))
    .find(p => new RegExp(mia, 'i').test(`${p.casa} ${p.ospite}`));

  if (prossima) {
    const v = elemento('button', 'voce partita');
    v.type = 'button';
    v.appendChild(elemento('span', 'che', 'Prossima'));
    v.appendChild(elemento('div', 'val', `${prossima.casa} – ${prossima.ospite}`));
    const q = new Date(prossima.quando);
    const ore = Math.round((q - Date.now()) / 36e5);
    /* Se il punteggio l'abbiamo, è la prima cosa che si vuole vedere
       aprendo l'app — ma va etichettato per quello che è, e «in corso»
       si dice solo di una partita che davvero si sta giocando. */
    const vivo = inDiretta(prossima);
    const st = comeSta(prossima);
    if (vivo) {
      v.classList.add('mia');
      v.querySelector('.che').textContent = st === 'in-corso' ? 'In corso' : 'Finita';
      v.querySelector('.val').textContent = `${prossima.casa} ${vivo} ${prossima.ospite}`;
    }
    v.appendChild(elemento('span', 'quando',
      vivo ? 'provvisorio' :
      ore < 0 ? 'in corso' : ore < 24 ? `fra ${ore <= 1 ? 'un\'ora' : ore + ' ore'}` :
      q.toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })));
    v.onclick = () => vaiA('arrivo');
    dove.appendChild(v);
  }

  const suoPosto = c.classifica.findIndex(r => new RegExp(mia, 'i').test(r.squadra));
  const mostrate = new Set([0, 1, 2, 3]);
  if (suoPosto >= 0) mostrate.add(suoPosto);

  for (const i of [...mostrate].sort((a, b) => a - b)) {
    const r = c.classifica[i];
    if (!r) continue;
    const v = elemento('button', 'voce' + (i === suoPosto ? ' mia' : ''));
    v.type = 'button';
    v.appendChild(elemento('span', 'che', `${r.pos}ª`));
    v.appendChild(elemento('div', 'val', r.squadra));
    v.appendChild(elemento('span', 'quando', `${r.punti} pt · ${r.giocate}g`));
    v.onclick = () => vaiA('classifica');
    dove.appendChild(v);
  }
  dove.hidden = false;
  $('#storia').hidden = true;
}

/* ---------- 6. Letto e non letto ----------------------------
   Serve a rispondere a colpo d'occhio alla domanda «c'è qualcosa
   di nuovo?». Lo stato vive nel dispositivo: è una comodità di chi
   legge, non un dato del giornale. */

/* Ogni faccia ha i suoi non letti: aver letto le notizie non vuol dire
   aver letto il calcio. */
const chiaveLetti = () => `news-letti-${stato.faccia}`;

function caricaLetti() {
  try { stato.letti = new Set(JSON.parse(localStorage.getItem(chiaveLetti()) || '[]')); }
  catch { stato.letti = new Set(); }
}

function salvaLetti() {
  try { localStorage.setItem(chiaveLetti(), JSON.stringify([...stato.letti].slice(-400))); } catch {}
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
  if (pallino) {
    pallino.textContent = n > 99 ? '99+' : String(n);
    pallino.hidden = n === 0;
  }
  $('#claim').textContent = n
    ? `${n} ${n === 1 ? 'pezzo non letto' : 'pezzi non letti'}`
    : F().claim;

  /* Sull'app installata il numero finisce sull'icona, come in un'app
     vera. Dove non è previsto non succede niente, e va benissimo. */
  try {
    if (n) navigator.setAppBadge?.(n); else navigator.clearAppBadge?.();
  } catch {}
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
  /* Il filtro acceso da fuori (una squadra toccata in classifica) deve
     avere la sua pastiglia, o non si capisce più come spegnerlo. */
  if (stato.filtro?.startsWith('squadra:')) fai(stato.filtro, stato.filtro.slice(8));
  if (stato.pezzi.some(p => !stato.letti.has(p.id))) fai('nuovi', 'Non letti');
  /* Nel calcio si pubblicano anche le voci di mercato: chi in quel
     momento non vuole chiacchiere le toglie con un tocco. */
  if (stato.pezzi.some(p => p.certezza && p.certezza !== 'fatto' && p.certezza !== 'ufficiale')) {
    fai('fatti', 'Solo fatti');
  }
  for (const a of aree) fai(`area:${a}`, NOMI_AREE[a] ?? a);
  for (const t of temi) fai(`tema:${t}`, NOMI_TEMI[t] ?? t);
}

function passa(p) {
  if (stato.filtro === 'nuovi' && stato.letti.has(p.id)) return false;
  if (stato.filtro === 'fatti' && p.certezza && !['fatto', 'ufficiale'].includes(p.certezza)) return false;
  if (stato.filtro?.startsWith('area:') && p.area !== stato.filtro.slice(5)) return false;
  if (stato.filtro?.startsWith('tema:') && !p.temi.includes(stato.filtro.slice(5))) return false;
  /* Filtro nato dalla classifica: il nome della squadra nel titolo o nel
     sommario. Grezzo, ma su nomi propri sbaglia poco. */
  if (stato.filtro?.startsWith('squadra:')) {
    const chi = new RegExp(`\\b${scappa(stato.filtro.slice(8))}\\b`, 'i');
    if (!chi.test(`${p.titolo ?? ''} ${p.unaRiga ?? ''} ${p.occhiello ?? ''}`)) return false;
  }

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
  stato.stampati = 0;

  const visibili = stato.pezzi.filter(passa);
  if (!visibili.length) {
    palco.appendChild(elemento('p', 'vuoto',
      stato.cerca ? 'Nessun pezzo con queste parole. La ricerca guarda titolo, sommario e occhiello di tutti i pezzi; il testo intero solo di quelli già aperti.'
      : stato.filtro === 'nuovi' ? 'Hai letto tutto.'
      : stato.filtro === 'fatti' ? 'Solo trattative e voci, per ora: nessun fatto accertato.'
      : !stato.pezzi.length ? `Non è ancora uscito niente su ${F().nome.toLowerCase()}.`
      : 'Nessun pezzo per questo filtro.'));
    return;
  }
  stampaBlocco(visibili);
  annuncia(`${visibili.length} ${visibili.length === 1 ? 'pezzo' : 'pezzi'}`);
}

/* L'archivio cresce e non si ferma: si stampa un blocco per volta e il
   successivo arriva quando la sentinella entra nello schermo. Con tre
   pezzi non cambia niente; con trecento cambia tutto. */
let sentinella = null, osservatore = null;

function stampaBlocco(visibili) {
  const palco = $('#palco');
  const quanti = stato.stampati === 0 ? PRIMO_BLOCCO : PASSO_BLOCCO;
  const fetta = visibili.slice(stato.stampati, stato.stampati + quanti);
  osservatore?.disconnect();
  sentinella?.remove();
  sentinella = osservatore = null;

  for (const p of fetta) palco.appendChild(scheda(p));
  stato.stampati += fetta.length;

  if (stato.stampati < visibili.length) {
    sentinella = elemento('div', 'sentinella');
    palco.appendChild(sentinella);
    osservatore = new IntersectionObserver(voci => {
      if (voci.some(v => v.isIntersecting)) stampaBlocco(visibili);
    }, { rootMargin: '700px' });
    osservatore.observe(sentinella);
  }
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
  /* Quanto vale ciò che stai per leggere, prima di leggerlo. Una voce
     di mercato e un risultato non sono la stessa cosa, e chi scorre
     deve poterlo distinguere senza aprire. */
  if (p.certezza && p.certezza !== 'fatto') {
    alta.appendChild(elemento('span', 'sep', '·'));
    alta.appendChild(elemento('span', `certezza ${p.certezza}`, NOMI_CERTEZZE[p.certezza] ?? p.certezza));
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
    /* Un pulsante e non un paragrafo: in densità compatta era l'unico
       modo di aprire un pezzo, e da tastiera non si raggiungeva. */
    const riga = elemento('button', 'una-riga', p.unaRiga);
    riga.type = 'button';
    riga.setAttribute('aria-expanded', 'false');
    riga.onclick = () => apri(p);
    art.appendChild(riga);
  } else {
    const h = elemento('h2', null, p.titolo);
    h.onclick = () => apri(p);
    art.appendChild(h);
    art.appendChild(elemento('p', 'occhiello', p.occhiello));

    const b = elemento('button', 'apri');
    b.type = 'button';
    b.setAttribute('aria-expanded', String(aperto));
    b.setAttribute('aria-controls', `c-${p.id}`);
    b.appendChild(elemento('span', null, aperto ? 'Chiudi' : 'Leggi'));
    b.appendChild(icona(aperto ? 'i-su' : 'i-giu'));
    b.onclick = () => apri(p);
    art.appendChild(b);
  }

  if (aperto && stato.testi.has(p.id)) {
    const c = corpo(stato.testi.get(p.id));
    c.id = `c-${p.id}`;
    art.appendChild(c);
  }
  return art;
}

async function apri(p) {
  const eraAperto = stato.aperti.has(p.id);
  if (eraAperto) {
    stato.aperti.delete(p.id);
  } else {
    stato.aperti.add(p.id);
    segnaLetto(p.id);
    try {
      await testoDi(p.id);
    } catch {
      stato.aperti.delete(p.id);
      avviso('pezzo', 'Non riesco a caricare questo pezzo.', { durata: 4000 });
      rifaiScheda(p);
      return;
    }
  }
  rifaiScheda(p);
  pastiglie();
  scriviIndirizzo();
  if (!eraAperto) portaInVista(`p-${p.id}`);
}

/* Cambia solo la sua scheda. Ricostruire tutto il flusso a ogni apertura
   faceva sfarfallare la pagina e saltare la posizione: era la ragione
   principale per cui sembrava un sito invece che un'app.

   Un pezzo aperto mentre il filtro è «non letti» resta dov'è anche se
   diventa letto: sparire sotto il dito di chi ha appena toccato sarebbe
   peggio dell'incoerenza. Al prossimo ridisegno se ne andrà. */
function rifaiScheda(p) {
  const vecchia = document.getElementById(`p-${p.id}`);
  if (!vecchia) { disegna(); return null; }
  const nuova = scheda(p);
  vecchia.replaceWith(nuova);
  return nuova;
}

/* Se quello che si è aperto è finito sotto la barra delle sezioni lo si
   riporta in vista — ma non si strappa la pagina a chi lo vedeva già. */
function portaInVista(idNodo) {
  const n = document.getElementById(idNodo);
  if (!n) return;
  const alto = ($('.sezioni')?.offsetHeight ?? 0) + 8;
  const y = n.getBoundingClientRect().top;
  if (y < alto) window.scrollTo({ top: window.scrollY + y - alto - 6, behavior: 'smooth' });
}

/* Un pezzo si condivide col suo indirizzo, non con quello della home:
   chi lo riceve deve aprire quel pezzo, non il giornale di oggi. */
async function condividi(p) {
  const url = new URL(location.href);
  url.hash = indirizzoDi({ faccia: stato.faccia, sezione: 'flusso', tipo: 'pezzo', cosa: p.id });
  try {
    if (navigator.share) {
      await navigator.share({ title: p.titolo, text: p.unaRiga ?? p.occhiello ?? '', url: url.href });
      return;
    }
    await navigator.clipboard.writeText(url.href);
    avviso('condiviso', 'Indirizzo copiato.', { durata: 2600, icona: 'i-catena' });
  } catch (e) {
    if (e?.name === 'AbortError') return;      // ha solo chiuso il foglio di condivisione
    avviso('condiviso', 'Non riesco a condividere da qui.', { durata: 3200 });
  }
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

  /* Niente titolo né occhiello qui: li mette già la scheda, che quando
     un pezzo è aperto passa alla vista estesa anche in densità compatta.
     Rimetterli faceva vedere tutto due volte. */

  if (p.certezza && !['fatto', 'ufficiale'].includes(p.certezza)) {
    const a = elemento('p', `avviso-certezza ${p.certezza}`);
    a.textContent = p.certezza === 'voce'
      ? 'Questa è una voce: nessuna delle parti l\'ha confermata. Sotto trovi chi l\'ha riportata.'
      : 'Questa è una trattativa in corso, confermata da almeno una delle parti. Non è ancora successo niente.';
    c.appendChild(a);
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

  const cond = elemento('button', 'rimando');
  cond.type = 'button';
  cond.appendChild(icona('i-condividi'));
  cond.appendChild(elemento('span', null, 'Condividi'));
  cond.onclick = () => condividi(p);
  coda.appendChild(cond);

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

/* ---------- 10b. Le partite ---------------------------------
   Una partita non è una riga di calendario: è un'ora, un canale, due
   squadre che stasera stanno in un certo punto della classifica. Tutto
   questo si apre toccandola, e quello che non sappiamo — quasi sempre
   il canale — si dice invece di indovinarlo. */

const DURATA_PARTITA = 2 * 36e5;   // fischio d'inizio, intervallo, recuperi

/* Dove va chi vuole sapere il canale quando noi non lo sappiamo. Sono
   pagine ufficiali, e ci stanno solo quelle verificate: se una cambia
   indirizzo, la riga da correggere è questa.

   Champions ed Europa League non ci sono di proposito. uefa.com risponde
   403 a qualunque richiesta che non venga da un browser, quindi il suo
   indirizzo non è verificabile da qui — e un collegamento morto in una
   scheda che si vanta di non indovinare sarebbe la peggiore delle ironie.
   Chi ce l'ha sottomano lo aggiunga qui: due righe. */
const PROGRAMMAZIONE = {
  'serie-a': ['Il calendario della Lega Serie A', 'https://www.legaseriea.it/it/serie-a'],
  'coppa-italia': ['Il tabellone di Coppa Italia', 'https://www.legaseriea.it/it/coppa-italia'],
};

/* «Serie A 2026-2027» e «Serie A» devono dare lo stesso identificativo,
   o la partita giocata non ritrova quella che era in calendario. */
function nomeCompetizione(s, ripiego) {
  return String(s ?? ripiego ?? 'Serie A').replace(/\s+\d{4}\s*[-–/]?\s*\d{0,4}\s*$/, '').trim();
}

/* L'identificativo di una partita non sta nei dati: si ricava. Deve
   restare lo stesso da un ciclo all'altro, perché ci si possa mandare
   un indirizzo che funziona anche domani. */
function idPartita(p, giornata) {
  const g = p.giornata ?? giornata ?? 'x';
  return `${sillabe(nomeCompetizione(p.competizione))}-g${g}-${sillabe(p.casa)}-${sillabe(p.ospite)}`;
}

/* Le partite in un elenco solo. `ultima_giornata` non porta la data —
   appartiene alla giornata scritta in cima al file — e serve soprattutto
   a riattaccare il risultato alla partita che prima era in calendario. */
function elencoPartite() {
  const c = stato.campo;
  if (!c) return [];
  const g = c.giornata;
  const comp = nomeCompetizione(c.campionato);
  const per = new Map();

  for (const r of c.prossime ?? []) {
    const p = { ...r, competizione: nomeCompetizione(r.competizione, comp) };
    p.id = idPartita(p, g);
    per.set(p.id, p);
  }
  for (const r of c.ultima_giornata ?? []) {
    const p = { ...r, competizione: nomeCompetizione(r.competizione, comp), giornata: r.giornata ?? g };
    const id = idPartita(p, g);
    const gia = per.get(id);
    if (gia) {
      gia.risultato = r.risultato ?? gia.risultato;
      gia.marcatori = r.marcatori ?? gia.marcatori;
    } else {
      p.id = id;
      per.set(id, p);
    }
  }
  return [...per.values()];
}

/* Quattro stati, e uno di questi è «finita ma non lo sappiamo»: è il
   modo in cui ci si accorge che campo.json è rimasto indietro. */
function comeSta(p) {
  if (p.risultato) return 'finita';
  if (!p.quando) return 'finita-ignota';
  const q = new Date(p.quando).getTime();
  if (isNaN(q)) return 'attesa';
  const ora = Date.now();
  if (ora < q) return 'attesa';
  return ora < q + DURATA_PARTITA ? 'in-corso' : 'finita-ignota';
}

/* Il punteggio letto in diretta da una fonte di cronaca (tools/diretta.mjs).
   Vale finché il ciclo non porta quello buono in «ultima_giornata»: da quel
   momento il risultato vero ha sempre la precedenza. */
const inDiretta = p => (!p.risultato && p.diretta?.risultato) ? p.diretta.risultato : null;

const squadraSeguita = () => stato.campo?.squadra_seguita?.nome ?? 'Juventus';
const scappa = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const riguarda = (p, chi) => new RegExp(scappa(chi), 'i').test(`${p.casa} ${p.ospite}`);

/* «fra due ore» si capisce senza fare i conti; «fra 46 minuti» pure. */
function quantoManca(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (isNaN(ms) || ms < 0) return '';
  const min = Math.round(ms / 60000);
  if (min < 1)  return 'sta per cominciare';
  if (min < 60) return `fra ${min} ${min === 1 ? 'minuto' : 'minuti'}`;
  const ore = Math.floor(min / 60), resto = min % 60;
  if (ore < 24) return `fra ${ore === 1 ? "un'ora" : ore + ' ore'}${resto ? ` e ${resto} min` : ''}`;
  const gg = Math.round(ore / 24);
  return gg === 1 ? 'domani' : `fra ${gg} giorni`;
}

function leProssime() {
  const palco = $('#palco');
  palco.textContent = '';
  fermaOrologio();

  const tutte = elencoPartite();
  if (!tutte.length) {
    palco.appendChild(elemento('p', 'vuoto', 'Nessuna partita nei dati caricati.'));
    return;
  }

  const daVenire = tutte.filter(p => p.quando && comeSta(p) !== 'finita')
    .sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
  const giocate = tutte.filter(p => !daVenire.includes(p));

  let giornoMostrato = null;
  for (const p of daVenire) {
    const q = new Date(p.quando);
    const giorno = q.toDateString();
    if (giorno !== giornoMostrato) {
      giornoMostrato = giorno;
      palco.appendChild(elemento('h3', 'giorno-partite',
        q.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })));
    }
    palco.appendChild(rigaPartita(p));
  }

  if (!daVenire.length) {
    palco.appendChild(elemento('p', 'vuoto', 'Nessuna partita in programma nei dati caricati.'));
  }

  if (giocate.length) {
    const g = document.createElement('div');
    for (const p of giocate) g.appendChild(rigaPartita(p));
    const quale = stato.campo?.giornata;
    palco.appendChild(sezione('giocate-sez', 'i-campo',
      quale ? `Già giocate · ${quale}ª giornata` : 'Già giocate', g));
  }

  if (stato.campo?.coppe) {
    const d = document.createElement('div');
    for (const [k, testo] of Object.entries(stato.campo.coppe)) {
      /* Le chiavi del file sono identificativi: «europa_league» si scrive
         così per comodità di chi lo compila, non per essere letto. */
      const nome = k.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
      const riga = elemento('p');
      riga.appendChild(elemento('strong', null, `${nome}. `));
      riga.appendChild(elemento('span', null, testo));
      d.appendChild(riga);
    }
    palco.appendChild(sezione('coppe-sez', 'i-calendario', 'Le coppe', d));
  }
}

function rigaPartita(p) {
  const nostra = riguarda(p, squadraSeguita());
  const aperta = stato.partitaAperta === p.id;
  const art = elemento('article', 'partita' + (nostra ? ' nostra' : ''));
  art.id = `pt-${p.id}`;

  const st = comeSta(p);
  const b = elemento('button', 'riga-partita');
  b.type = 'button';
  b.setAttribute('aria-expanded', String(aperta));
  b.setAttribute('aria-controls', `sp-${p.id}`);

  const vivo = inDiretta(p);
  const ora = elemento('span', 'ora' + (p.risultato ? ' finita' : vivo ? ' viva' : ''));
  ora.textContent = p.risultato ?? vivo
    ?? (p.quando ? new Date(p.quando).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '–');
  b.appendChild(ora);

  const sfida = elemento('span', 'sfida');
  sfida.appendChild(elemento('span', 'casa', p.casa));
  sfida.appendChild(elemento('span', 'contro', '–'));
  sfida.appendChild(elemento('span', 'ospite', p.ospite));
  b.appendChild(sfida);

  const coda = `${p.competizione ?? 'Serie A'}${p.giornata ? ` · ${p.giornata}ª` : ''}` +
    (st === 'in-corso' ? ' · in corso' : st === 'finita-ignota' ? ' · finita' : '');
  b.appendChild(elemento('span', 'comp', coda));
  b.appendChild(icona('i-giu', 'freccia'));
  b.onclick = () => apriPartita(p);
  art.appendChild(b);

  if (aperta) art.appendChild(schedaPartita(p));
  return art;
}

function apriPartita(p) {
  const era = stato.partitaAperta === p.id;
  const prima = stato.partitaAperta;
  fermaOrologio();
  stato.partitaAperta = era ? null : p.id;

  if (prima && prima !== p.id) {
    const altra = elencoPartite().find(x => x.id === prima);
    if (altra) document.getElementById(`pt-${prima}`)?.replaceWith(rigaPartita(altra));
  }
  document.getElementById(`pt-${p.id}`)?.replaceWith(rigaPartita(p));
  scriviIndirizzo();
  if (!era) portaInVista(`pt-${p.id}`);
}

/* Il conto alla rovescia scorre finché la scheda è aperta: un numero
   fermo su «fra 2 ore» mentre passa il tempo è peggio di nessun numero. */
let orologioPartita = null;
function fermaOrologio() {
  if (orologioPartita) { clearInterval(orologioPartita); orologioPartita = null; }
}

function spRiga(nomeIcona, che, contenuto) {
  const r = elemento('div', 'sp-riga');
  r.appendChild(icona(nomeIcona));
  const c = elemento('div', 'sp-corpo');
  c.appendChild(elemento('span', 'sp-che', che));
  c.appendChild(typeof contenuto === 'string' ? elemento('p', null, contenuto) : contenuto);
  r.appendChild(c);
  return r;
}

function schedaPartita(p) {
  const d = elemento('div', 'scheda-partita');
  d.id = `sp-${p.id}`;
  const st = comeSta(p);

  /* 1. quando, e quanto manca */
  const q = p.quando ? new Date(p.quando) : null;
  const quando = document.createElement('div');
  if (st === 'finita') {
    quando.appendChild(elemento('p', 'sp-forte', `Finita ${p.risultato}`));
    if (p.marcatori?.length) {
      quando.appendChild(elemento('p', null,
        p.marcatori.map(m => `${m.chi}${m.minuto ? ` ${m.minuto}'` : ''}`).join(' · ')));
    }
  } else if (st === 'in-corso' || st === 'finita-ignota') {
    const vivo = inDiretta(p);
    if (vivo) {
      quando.appendChild(elemento('p', 'sp-forte',
        st === 'in-corso' ? `Si sta giocando: ${vivo}` : `Finita ${vivo}`));
      /* Da dove viene e di quando è: un punteggio letto dal titolo di un
         articolo non è un risultato ufficiale, e non deve sembrarlo. */
      const d = new Date(p.diretta.quando);
      quando.appendChild(elemento('p', 'sp-manca',
        `Provvisorio. Letto da ${p.diretta.fonte} alle ` +
        `${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}` +
        `${st === 'in-corso' ? ', e la partita non è finita' : ''}. ` +
        'Il risultato buono arriva col prossimo giro del giornale.'));
      if (p.diretta.url) {
        const a = document.createElement('a');
        a.href = p.diretta.url; a.target = '_blank'; a.rel = 'noopener';
        a.className = 'sp-fonte'; a.textContent = 'La cronaca';
        quando.appendChild(a);
      }
    } else if (st === 'in-corso') {
      quando.appendChild(elemento('p', 'sp-forte', 'Si sta giocando adesso.'));
      quando.appendChild(elemento('p', 'sp-manca',
        'Il punteggio non è ancora comparso in nessuna delle fonti che leggiamo.'));
    } else {
      quando.appendChild(elemento('p', 'sp-manca',
        'È finita, ma il risultato non è ancora stato letto: vuol dire che i dati del campo sono rimasti indietro.'));
    }
  } else if (q) {
    quando.appendChild(elemento('p', 'sp-forte',
      q.toLocaleString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })));
    const manca = elemento('p', 'sp-manca', quantoManca(p.quando));
    manca.id = 'manca-adesso';
    quando.appendChild(manca);
    orologioPartita = setInterval(() => {
      const n = document.getElementById('manca-adesso');
      if (!n) return fermaOrologio();
      n.textContent = quantoManca(p.quando);
    }, 30000);
  }
  if (p.stadio) quando.appendChild(elemento('p', 'sp-manca', p.stadio));
  d.appendChild(spRiga(st === 'attesa' ? 'i-orologio' : 'i-campo',
    st === 'attesa' ? 'Quando' : 'Com\'è andata', quando));

  /* 2. dove si vede — e se non lo sappiamo, si dice */
  if (st === 'attesa' || st === 'in-corso') d.appendChild(spRiga('i-tv', 'Dove si vede', doveSiVede(p)));

  /* 3. le due squadre stasera */
  const conf = confronto(p);
  if (conf) d.appendChild(spRiga('i-cifre', 'Le due squadre', conf));

  /* 4. l'aritmetica, per la squadra che si segue */
  const ip = ipotesi(p);
  if (ip) d.appendChild(spRiga('i-mira', 'Che cosa cambia in classifica', ip));

  /* 5. che cosa abbiamo scritto su questa partita */
  const collegati = pezziDellaPartita(p);
  if (collegati.length) {
    const g = elemento('div', 'sp-pezzi');
    for (const x of collegati) {
      const b = elemento('button', 'sp-pezzo');
      b.type = 'button';
      b.appendChild(elemento('span', null, x.titolo));
      b.appendChild(elemento('span', 'quando', quandoIn(x.quando)));
      b.onclick = () => { vaiA('flusso'); apri(x); };
      g.appendChild(b);
    }
    d.appendChild(spRiga('i-fonte', 'Ne abbiamo scritto', g));
  }

  /* 6. portarsela via */
  const azioni = elemento('div', 'sp-azioni');
  if (q && st === 'attesa') {
    const a = elemento('button', 'sp-azione');
    a.type = 'button';
    a.appendChild(icona('i-agenda'));
    a.appendChild(elemento('span', null, 'Metti in agenda'));
    a.onclick = () => inAgenda(p);
    azioni.appendChild(a);
  }
  const cond = elemento('button', 'sp-azione');
  cond.type = 'button';
  cond.appendChild(icona('i-condividi'));
  cond.appendChild(elemento('span', null, 'Condividi'));
  cond.onclick = () => condividiPartita(p);
  azioni.appendChild(cond);
  d.appendChild(azioni);

  return d;
}

/* Il canale è l'unico dato di questa scheda che non possediamo. La
   regola è quella della testata: non si finge una certezza che non si
   ha (LINEA-CALCIO.md §3). Meglio ammetterlo e indicare dove guardare
   che scrivere «DAZN» perché di solito è così. */
function doveSiVede(p) {
  const c = document.createElement('div');
  const canali = p.dove_si_vede ?? [];

  if (canali.length) {
    const g = elemento('div', 'canali');
    for (const v of canali) {
      const nome = typeof v === 'string' ? v : v.canale;
      const n = elemento('span', 'canale' + (v?.esclusiva ? ' esclusiva' : ''), nome);
      if (v?.tipo) n.title = v.tipo;
      g.appendChild(n);
    }
    c.appendChild(g);
    if (p.dove_fonte) {
      const a = document.createElement('a');
      a.href = p.dove_fonte; a.target = '_blank'; a.rel = 'noopener';
      a.className = 'sp-fonte'; a.textContent = 'chi lo dice';
      c.appendChild(a);
    }
    return c;
  }

  c.appendChild(elemento('p', 'sp-manca',
    'Non risulta ancora dove viene trasmessa. Il canale si scrive qui solo quando una fonte lo dice: ' +
    'ricavarlo dal ciclo dei diritti sarebbe indovinare, e non sapresti quando fidarti.'));
  const dove = PROGRAMMAZIONE[sillabe(nomeCompetizione(p.competizione))];
  if (dove) {
    const a = document.createElement('a');
    a.href = dove[1]; a.target = '_blank'; a.rel = 'noopener';
    a.className = 'sp-fonte'; a.textContent = dove[0];
    c.appendChild(a);
  }
  return c;
}

/* Le due squadre come stanno adesso: sono numeri che abbiamo già in
   classifica, e cambiano completamente il peso di una partita. */
function confronto(p) {
  const cl = stato.campo?.classifica ?? [];
  const trova = nome => cl.find(r => sillabe(r.squadra) === sillabe(nome));
  const A = trova(p.casa), B = trova(p.ospite);
  if (!A || !B) return null;

  const mia = new RegExp(scappa(squadraSeguita()), 'i');
  const colonna = (r, classe) => {
    const d = elemento('div', `col${classe}${mia.test(r.squadra) ? ' mia' : ''}`);
    d.appendChild(elemento('span', 'pos', `${r.pos}ª`));
    d.appendChild(elemento('span', 'nome', r.squadra));
    d.appendChild(elemento('span', 'dett',
      `${r.punti} pt · ${r.giocate}g · ${r.gf ?? '–'}:${r.gs ?? '–'}`));
    return d;
  };

  const g = elemento('div', 'confronto');
  g.appendChild(colonna(A, ''));
  g.appendChild(elemento('span', 'vs', 'contro'));
  g.appendChild(colonna(B, ' b'));
  return g;
}

/* Aritmetica, non pronostico — e la differenza sta tutta nella postilla.
   Si muovono solo le due squadre in campo: le altre restano ferme, e la
   differenza reti non cambia perché i gol non li conosciamo. */
function ipotesi(p) {
  const cl = stato.campo?.classifica ?? [];
  const st = comeSta(p);
  if (!cl.length || (st !== 'attesa' && st !== 'in-corso')) return null;
  if (!riguarda(p, squadraSeguita())) return null;

  const mia = new RegExp(scappa(squadraSeguita()), 'i');
  const nomeMia = mia.test(p.casa) ? p.casa : p.ospite;
  const nomeAltra = nomeMia === p.casa ? p.ospite : p.casa;
  const chiave = n => sillabe(n);
  if (!cl.some(r => chiave(r.squadra) === chiave(nomeMia))) return null;

  const diff = r => (r.gf ?? 0) - (r.gs ?? 0);
  const u = elemento('ul', 'ipotesi');

  for (const [classe, parola, suoi, altrui] of
       [['v', 'se vince', 3, 0], ['n', 'se pareggia', 1, 1], ['p', 'se perde', 0, 3]]) {
    const finta = cl.map(r => ({ ...r }));
    let punti = null;
    for (const r of finta) {
      if (chiave(r.squadra) === chiave(nomeMia))   { r.punti += suoi;   r.giocate += 1; punti = r.punti; }
      if (chiave(r.squadra) === chiave(nomeAltra)) { r.punti += altrui; r.giocate += 1; }
    }
    finta.sort((a, b) => b.punti - a.punti || diff(b) - diff(a) || (b.gf ?? 0) - (a.gf ?? 0));
    const posto = finta.findIndex(r => chiave(r.squadra) === chiave(nomeMia)) + 1;

    const li = elemento('li');
    li.appendChild(elemento('span', `caso ${classe}`, parola));
    li.appendChild(elemento('span', 'dove-finisce',
      posto ? `${posto}ª, con ${punti} ${punti === 1 ? 'punto' : 'punti'}` : '—'));
    u.appendChild(li);
  }

  const g = document.createElement('div');
  g.appendChild(u);
  g.appendChild(elemento('p', 'sp-postilla',
    'Conto sulla classifica di adesso: le altre squadre restano ferme e la differenza reti non cambia, ' +
    'perché i gol non si conoscono in anticipo. A parità di punti in Serie A vale lo scontro diretto, ' +
    'che qui non è calcolato. È aritmetica, non un pronostico.'));
  return g;
}

/* Quello che abbiamo già scritto su questa partita. Il campo `partita`
   nel pezzo, se il redattore l'ha messo, vale più di ogni indovinello
   sui nomi; senza, ci si accontenta di cercarli nel titolo. */
function pezziDellaPartita(p) {
  const nomi = [p.casa, p.ospite].filter(Boolean).map(n => new RegExp(`\\b${scappa(n)}\\b`, 'i'));
  return stato.pezzi.filter(x => {
    if (x.partita === p.id) return true;
    const dove = `${x.titolo ?? ''} ${x.unaRiga ?? ''} ${x.occhiello ?? ''}`;
    return nomi.some(r => r.test(dove));
  }).slice(0, 6);
}

/* Il calendario del telefono. Su iOS il foglio di condivisione con un
   file allegato è l'unica strada che funziona davvero dentro un'app
   installata; il collegamento da scaricare resta come ripiego. */
function testoIcs(p) {
  const esc = s => String(s ?? '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const z = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const inizio = new Date(p.quando);
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//News//Calcio//IT', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${p.id}@news`,
    `DTSTAMP:${z(Date.now())}`,
    `DTSTART:${z(inizio)}`,
    `DTEND:${z(inizio.getTime() + DURATA_PARTITA)}`,
    `SUMMARY:${esc(`${p.casa} – ${p.ospite}`)}`,
    `DESCRIPTION:${esc(`${p.competizione ?? 'Serie A'}${p.giornata ? `, ${p.giornata}ª giornata` : ''}`)}`,
    p.stadio ? `LOCATION:${esc(p.stadio)}` : null,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

async function inAgenda(p) {
  const testo = testoIcs(p);
  const nome = `${p.id}.ics`;
  try {
    const file = new File([testo], nome, { type: 'text/calendar' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `${p.casa} – ${p.ospite}` });
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return;
  }
  try {
    const url = URL.createObjectURL(new Blob([testo], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch {
    avviso('agenda', 'Da qui non riesco a passare la partita al calendario.', { durata: 3600 });
  }
}

async function condividiPartita(p) {
  const url = new URL(location.href);
  url.hash = indirizzoDi({ faccia: 'calcio', sezione: 'arrivo', tipo: 'partita', cosa: p.id });
  const quando = p.quando
    ? new Date(p.quando).toLocaleString('it-IT', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : '';
  try {
    if (navigator.share) {
      await navigator.share({ title: `${p.casa} – ${p.ospite}`, text: quando, url: url.href });
      return;
    }
    await navigator.clipboard.writeText(url.href);
    avviso('condiviso', 'Indirizzo copiato.', { durata: 2600, icona: 'i-catena' });
  } catch (e) {
    if (e?.name === 'AbortError') return;
    avviso('condiviso', 'Non riesco a condividere da qui.', { durata: 3200 });
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

/* ---------- 11b. La classifica ------------------------------ */

function laClassifica() {
  const palco = $('#palco');
  palco.textContent = '';
  const c = stato.campo;
  if (!c?.classifica?.length) {
    palco.appendChild(elemento('p', 'vuoto', 'La classifica non è ancora stata caricata.'));
    return;
  }

  const mia = c.squadra_seguita?.nome ?? 'Juventus';
  const testa = elemento('div', 'riga-alta');
  testa.appendChild(elemento('span', 'area', c.campionato ?? 'Serie A'));
  testa.appendChild(elemento('span', 'sep', '·'));
  testa.appendChild(elemento('span', null, `giornata ${c.giornata ?? '?'}`));
  if (c.giornata_completa === false) {
    testa.appendChild(elemento('span', 'sep', '·'));
    testa.appendChild(elemento('span', null, 'in corso'));
  }
  palco.appendChild(testa);

  /* Una tabella vera: intestazioni dichiarate e sigle spiegate per esteso,
     o a un lettore di schermo questa resta una griglia di numeri muti. */
  const t = elemento('table', 'classifica');
  const capo = document.createElement('thead');
  const intestazione = elemento('tr');
  for (const [testo, cl, esteso] of [
    ['', 'pos', 'Posizione'], ['Squadra', 'sq', null], ['Pt', 'n', 'Punti'],
    ['G', 'n', 'Giocate'], ['V', 'n', 'Vinte'], ['N', 'n', 'Pareggiate'],
    ['P', 'n', 'Perse'], ['GF', 'n', 'Gol fatti'], ['GS', 'n', 'Gol subiti'],
  ]) {
    const th = elemento('th', cl, testo);
    th.setAttribute('scope', 'col');
    if (esteso) th.title = esteso;
    if (esteso && !testo) th.appendChild(elemento('span', 'solo-voce', esteso));
    else if (esteso) th.setAttribute('aria-label', esteso);
    intestazione.appendChild(th);
  }
  capo.appendChild(intestazione);
  t.appendChild(capo);

  const corpoT = document.createElement('tbody');
  for (const r of c.classifica) {
    const tr = elemento('tr', new RegExp(mia, 'i').test(r.squadra) ? 'mia' : null);
    tr.appendChild(elemento('td', 'pos', String(r.pos)));

    /* Toccare una squadra porta alle sue notizie: il filtro c'era già,
       mancava il modo ovvio di accenderlo. */
    const sq = elemento('td', 'sq');
    const b = elemento('button', 'sq-vai', r.squadra);
    b.type = 'button';
    b.title = `Le notizie su ${r.squadra}`;
    b.onclick = () => {
      stato.filtro = `squadra:${r.squadra}`;
      vaiA('flusso', { inCima: true });
      pastiglie();
    };
    sq.appendChild(b);
    tr.appendChild(sq);

    tr.appendChild(elemento('td', 'n pt', String(r.punti)));
    for (const k of ['giocate', 'v', 'n', 'p', 'gf', 'gs']) {
      tr.appendChild(elemento('td', 'n', r[k] == null ? '–' : String(r[k])));
    }
    corpoT.appendChild(tr);
  }
  t.appendChild(corpoT);
  palco.appendChild(t);

  if (c.ultima_giornata?.length) {
    const g = elemento('div', 'risultati');
    for (const p of c.ultima_giornata) {
      const r = elemento('div', 'risultato');
      r.appendChild(elemento('span', 'casa', p.casa));
      r.appendChild(elemento('span', 'punteggio', p.risultato));
      r.appendChild(elemento('span', 'ospite', p.ospite));
      g.appendChild(r);
    }
    palco.appendChild(sezione('risultati-sez', 'i-cifre', 'Ultima giornata', g));
  }

  if (c.squadra_seguita) {
    const s2 = c.squadra_seguita;
    const d = elemento('div', 'rosa');
    if (s2.allenatore) d.appendChild(elemento('p', null, `Allenatore: ${s2.allenatore}`));
    for (const [titolo, voci] of [['Acquisti', s2.acquisti], ['Cessioni', s2.cessioni]]) {
      if (!voci?.length) continue;
      d.appendChild(elemento('h4', null, titolo));
      const u = elemento('ul', 'movimenti');
      for (const m of voci) u.appendChild(elemento('li', null, `${m.chi} — ${m.da ?? m.a} · ${m.cifra}`));
      d.appendChild(u);
    }
    palco.appendChild(sezione('rosa-sez', 'i-dossier', `${s2.nome}: la stagione`, d));
  }

  const nota = elemento('p', 'provenienza-campo');
  nota.textContent = `Letto da Wikipedia, aggiornato al ${new Date(c.aggiornato).toLocaleString('it-IT')}.`;
  /* Due giorni è la soglia oltre la quale tools/campo.mjs si rifiuta di
     citare la classifica. Chi legge ha diritto di saperlo quanto il ciclo. */
  const giorni = Math.floor((Date.now() - new Date(c.aggiornato).getTime()) / 864e5);
  if (giorni > 2) {
    nota.appendChild(elemento('span', 'vecchio-nota',
      ` Ha ${giorni} giorni: non è la fotografia di adesso.`));
  }
  if (c.incerto) nota.appendChild(elemento('span', null, ` ${c.incerto}`));
  palco.appendChild(nota);
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

const chiaveScroll = (faccia, sez) => `${faccia}/${sez}`;
const menoMovimento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function vaiA(sez, opzioni = {}) {
  const cambia = stato.sezione !== sez;
  /* Dove si era lasciata la sezione che si abbandona. */
  if (cambia) stato.scrollDi[chiaveScroll(stato.faccia, stato.sezione)] = window.scrollY;
  stato.sezione = sez;
  fermaOrologio();

  for (const b of document.querySelectorAll('#sezioni button')) {
    const suo = b.dataset.sez === sez;
    b.setAttribute('aria-selected', String(suo));
    b.tabIndex = suo ? 0 : -1;
  }
  $('#filtri').hidden = sez !== 'flusso';

  const dipingi = () => {
    if (sez === 'flusso')          disegna();
    else if (sez === 'classifica') laClassifica();
    else if (sez === 'arrivo')     stato.faccia === 'calcio' ? leProssime() : inArrivo();
    else if (sez === 'dossier')    iDossier();
    else if (sez === 'previsioni') lePrevisioni();
  };

  /* Si torna dove si era, non in cima: è la differenza fra riprendere
     una lettura e ricominciarla. */
  const riporta = () => {
    const y = opzioni.inCima ? 0 : (stato.scrollDi[chiaveScroll(stato.faccia, sez)] ?? 0);
    requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'auto' }));
  };

  if (document.startViewTransition && !menoMovimento()) {
    document.startViewTransition(dipingi).updateCallbackDone.then(riporta).catch(() => {});
  } else {
    dipingi(); riporta();
  }

  if (!opzioni.zitto) scriviIndirizzo({ nuovo: cambia });
}

/* La barra di stato del telefono deve avere il colore della pagina, e la
   pagina ha quattro combinazioni fra tema e testata: si legge il colore
   vero invece di tenerne una copia che prima o poi diverge. */
function coloreBarra() {
  const carta = getComputedStyle(document.documentElement).getPropertyValue('--carta').trim();
  if (!carta) return;
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.remove();
  const m = document.createElement('meta');
  m.name = 'theme-color';
  m.content = carta;
  document.head.appendChild(m);
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
    coloreBarra();
    annuncia(nuovo === 'scuro' ? 'Tema scuro' : 'Tema chiaro');
  };

  /* Se il telefono passa da solo a notte fonda, la barra lo segue. */
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', coloreBarra);
  coloreBarra();
}

/* Il doppio tap non ingrandisce più (§0 del foglio di stile): la
   dimensione del testo si sceglie qui, che in un giornale è il posto
   giusto. Tre passi bastano; cinque sarebbero una preferenza da
   pannello di controllo. */
const SCALE = ['piccolo', 'normale', 'grande'];
const NOMI_SCALE = { piccolo: 'Testo piccolo', normale: 'Testo normale', grande: 'Testo grande' };

function applicaScala() {
  if (stato.testo === 'normale') delete document.documentElement.dataset.testo;
  else document.documentElement.dataset.testo = stato.testo;
  const b = $('#btn-testo');
  b.title = NOMI_SCALE[stato.testo];
  b.setAttribute('aria-label', `${NOMI_SCALE[stato.testo]}. Tocca per cambiare`);
}

function dimensioneTesto() {
  applicaScala();
  $('#btn-testo').onclick = () => {
    stato.testo = SCALE[(SCALE.indexOf(stato.testo) + 1) % SCALE.length];
    localStorage.setItem('news-testo', stato.testo);
    applicaScala();
    annuncia(NOMI_SCALE[stato.testo]);
  };
}

/* ---------- 13b. L'indirizzo ---------------------------------
   Prima di questa sezione aprire un pezzo non lasciava traccia: nessun
   indirizzo da mandare a qualcuno, e il tasto «indietro» usciva dall'app
   invece di chiudere quello che avevi appena aperto. Era, insieme al
   ridisegno completo del flusso, la ragione per cui sembrava un sito.

   La forma è `#/faccia/sezione/tipo/cosa?filtro=…`, per esempio
   `#/calcio/arrivo/partita/serie-a-g1-frosinone-juventus`. Il filtro
   viaggia in coda ma non fa storia: cambiarlo dieci volte non deve
   costringere a premere «indietro» dieci volte. */

function indirizzoDi({ faccia, sezione, tipo, cosa, filtro }) {
  let h = `#/${faccia}/${sezione}`;
  if (tipo && cosa) h += `/${tipo}/${encodeURIComponent(cosa)}`;
  if (filtro) h += `?filtro=${encodeURIComponent(filtro)}`;
  return h;
}

function indirizzoOra() {
  const o = { faccia: stato.faccia, sezione: stato.sezione, filtro: stato.filtro };
  if (stato.sezione === 'flusso') {
    const ultimo = [...stato.aperti].at(-1);
    if (ultimo) { o.tipo = 'pezzo'; o.cosa = ultimo; }
  } else if (stato.partitaAperta) {
    o.tipo = 'partita'; o.cosa = stato.partitaAperta;
  }
  return indirizzoDi(o);
}

function leggiIndirizzo(h) {
  const [percorso, query] = String(h || '').replace(/^#\/?/, '').split('?');
  const parti = percorso.split('/').filter(Boolean);
  return {
    faccia:  FACCE[parti[0]] ? parti[0] : null,
    sezione: parti[1] || null,
    tipo:    parti[2] || null,
    cosa:    parti[3] ? decodeURIComponent(parti[3]) : null,
    filtro:  new URLSearchParams(query || '').get('filtro') || null,
  };
}

function scriviIndirizzo(opzioni = {}) {
  const h = indirizzoOra();
  if (h === stato.indirizzo) return;
  const prima = stato.indirizzo;
  stato.indirizzo = h;
  try {
    if (opzioni.nuovo === false || !prima) history.replaceState({ h }, '', h);
    else history.pushState({ h }, '', h);
  } catch {}
}

/* Un pezzo che non è più nell'edizione di oggi ma di cui qualcuno ha il
   link: si va a prenderlo da solo, così il collegamento ricevuto porta
   dove promette invece che su una pagina vuota. */
async function pezzoFuoriIndice(id) {
  try {
    const p = await json(`${F().dati}/pezzi/${id}.json`);
    stato.testi.set(id, p);
    if (!stato.pezzi.some(x => x.id === id)) stato.pezzi = [p, ...stato.pezzi];
    stato.aperti.add(id);
    return true;
  } catch {
    avviso('mancante', 'Questo pezzo non è nell\'edizione che ho.', { durata: 4000 });
    return false;
  }
}

async function applicaIndirizzo(h, opzioni = {}) {
  const a = leggiIndirizzo(h);
  const faccia = a.faccia ?? stato.faccia;

  if (faccia !== stato.faccia) {
    stato.faccia = faccia;
    localStorage.setItem('news-faccia', faccia);
    await caricaFaccia();
  }

  /* Quello che l'indirizzo di prima teneva aperto e questo non nomina
     più si chiude: così «indietro» chiude esattamente un passo, e non
     tutto quello che si era aperto durante la lettura. */
  const prima = leggiIndirizzo(stato.indirizzo);
  const pezzo = a.tipo === 'pezzo' ? a.cosa : null;
  if (prima.tipo === 'pezzo' && prima.cosa && prima.cosa !== pezzo) stato.aperti.delete(prima.cosa);

  stato.filtro = a.filtro;
  stato.partitaAperta = a.tipo === 'partita' ? a.cosa : null;

  if (pezzo && !stato.aperti.has(pezzo)) {
    if (stato.pezzi.some(x => x.id === pezzo)) {
      stato.aperti.add(pezzo);
      try { await testoDi(pezzo); } catch { stato.aperti.delete(pezzo); }
    } else {
      await pezzoFuoriIndice(pezzo);
    }
  }

  const valide = F().sezioni.map(s => s[0]);
  contaNuovi();
  pastiglie();
  vaiA(valide.includes(a.sezione) ? a.sezione : 'flusso', { zitto: true, inCima: !!opzioni.iniziale });

  if (pezzo) portaInVista(`p-${pezzo}`);
  else if (stato.partitaAperta) portaInVista(`pt-${stato.partitaAperta}`);
  stato.indirizzo = indirizzoOra();
}

/* ---------- 13c. L'edizione che cambia sotto ------------------
   Il giornale esce sei volte al giorno; l'app mostrava quello che aveva
   preso all'apertura finché non la si ricaricava a mano. Adesso guarda
   da sola — ma non sposta il testo sotto gli occhi di chi sta leggendo:
   annuncia, e aspetta di essere toccata. */

async function controllaEdizione(opzioni = {}) {
  if (stato.aggiornamentoInCorso) return;
  stato.aggiornamentoInCorso = true;
  try {
    const indice = await json(`${F().dati}/indice.json`);
    const arrivati = (indice.pezzi ?? []).filter(p => !stato.pezzi.some(x => x.id === p.id));

    const applica = async () => {
      const apertiPrima = new Set(stato.aperti);
      stato.pezzi = indice.pezzi ?? [];
      stato.aperti = new Set([...apertiPrima].filter(id => stato.pezzi.some(p => p.id === id)));
      stato.caricataIl = Date.now();
      segnaAggiornamento(indice);
      await caricaContorno();
      contaNuovi(); pastiglie();
      if (stato.sezione === 'flusso') disegna(); else vaiA(stato.sezione, { zitto: true });
    };

    if (!arrivati.length) {
      stato.caricataIl = Date.now();
      segnaAggiornamento(indice);
      await caricaContorno();
      if (opzioni.dichiarato) {
        avviso('edizione', 'Sei già all\'ultima edizione.', { durata: 2400, icona: 'i-letti' });
      }
      return;
    }

    /* Se non sta leggendo niente ed è in cima, si aggiorna e basta:
       chiedere il permesso per qualcosa che non disturba è una noia. */
    if (opzioni.dichiarato || (window.scrollY < 120 && !stato.aperti.size)) {
      await applica();
      avviso('edizione',
        `${arrivati.length} ${arrivati.length === 1 ? 'pezzo nuovo' : 'pezzi nuovi'}.`,
        { durata: 2600, icona: 'i-aggiorna' });
    } else {
      avviso('edizione',
        `${arrivati.length} ${arrivati.length === 1 ? 'pezzo nuovo' : 'pezzi nuovi'}`,
        { icona: 'i-aggiorna', etichetta: 'Mostra', azione: () => applica() });
    }
  } catch {
    if (opzioni.dichiarato) avviso('edizione', 'Non riesco a raggiungere il giornale.', { durata: 3200 });
  } finally {
    stato.aggiornamentoInCorso = false;
  }
}

/* Tornando sull'app dopo qualche minuto si guarda se è uscito altro:
   è il momento in cui un lettore se lo aspetta. */
function sorvegliaRientro() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - stato.caricataIl < RIENTRO_FRESCO) return;
    controllaEdizione();
  });
}

/* Il trascinamento in cima. È possibile perché il foglio di stile ferma
   la catena dei rimbalzi con `contain` invece di `none`: il gesto resta
   nostro senza togliere l'elasticità dentro la pagina. */
function sorvegliaTrascinamento() {
  const spia = $('#trascina');
  const SOGLIA = 72;
  let y0 = null, tirato = 0;

  addEventListener('touchstart', e => {
    y0 = (e.touches.length === 1 && window.scrollY <= 0) ? e.touches[0].clientY : null;
    tirato = 0;
  }, { passive: true });

  addEventListener('touchmove', e => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy <= 0 || window.scrollY > 0) { y0 = null; spia.style.cssText = ''; return; }
    tirato = dy;
    const q = Math.min(1, dy / SOGLIA);
    spia.style.opacity = String(q);
    spia.style.transform = `translateY(${Math.min(dy, SOGLIA) - 44}px) rotate(${Math.round(q * 270)}deg)`;
  }, { passive: true });

  addEventListener('touchend', () => {
    if (y0 == null) return;
    const basta = tirato >= SOGLIA;
    y0 = null; tirato = 0;
    spia.style.cssText = '';
    if (!basta) return;
    spia.classList.add('gira');
    controllaEdizione({ dichiarato: true }).finally(() => spia.classList.remove('gira'));
  }, { passive: true });
}

/* Senza rete non si finge che vada tutto bene: si dice che quello che si
   sta leggendo è l'ultima copia scaricata. */
function sorvegliaRete() {
  const dillo = () => {
    document.body.classList.toggle('senza-rete', !navigator.onLine);
    if (navigator.onLine) chiudiAvviso('rete');
    else avviso('rete', 'Sei senza rete: stai leggendo l\'ultima copia scaricata.', { icona: 'i-fonte' });
  };
  addEventListener('online', dillo);
  addEventListener('offline', dillo);
  if (!navigator.onLine) dillo();
}

/* Il guscio nuovo arriva in silenzio e la pagina aperta continua col
   codice vecchio: senza avviso non te ne accorgi fino al riavvio. */
async function sorvegliaVersione() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    reg.addEventListener('updatefound', () => {
      const arrivo = reg.installing;
      if (!arrivo) return;
      arrivo.addEventListener('statechange', () => {
        if (arrivo.state === 'installed' && navigator.serviceWorker.controller) {
          avviso('versione', 'C\'è una versione nuova dell\'app.',
            { icona: 'i-aggiorna', etichetta: 'Ricarica', azione: () => location.reload() });
        }
      });
    });
  } catch {}
}

/* ---------- 14. Avvio --------------------------------------- */

/* Le schede non stanno nell'HTML perché cambiano con la faccia: le
   notizie hanno i dossier e le previsioni, il calcio la classifica. */
function costruisciSezioni() {
  const dove = $('#sezioni');
  dove.textContent = '';
  for (const [id, etichetta] of F().sezioni) {
    const b = elemento('button', null, etichetta);
    b.type = 'button';
    b.dataset.sez = id;
    /* Sono schede, non interruttori: `aria-selected` dice a un lettore di
       schermo «1 di 4», che `aria-pressed` non sa dire. */
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(stato.sezione === id));
    b.tabIndex = stato.sezione === id ? 0 : -1;
    if (id === 'flusso') {
      const pallino = elemento('span', 'pallino');
      pallino.id = 'conta-nuovi';
      pallino.hidden = true;
      b.appendChild(pallino);
    }
    b.onclick = () => vaiA(id);
    dove.appendChild(b);
  }

  /* In una fila di schede le frecce spostano la selezione: è quello che
     si aspetta chi naviga da tastiera, e costa otto righe. */
  dove.onkeydown = e => {
    const passo = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!passo) return;
    e.preventDefault();
    const schede = [...dove.querySelectorAll('button')];
    const ora = schede.findIndex(b => b.dataset.sez === stato.sezione);
    const prossima = schede[(ora + passo + schede.length) % schede.length];
    vaiA(prossima.dataset.sez);
    prossima.focus();
  };

  dove.hidden = false;
}

/* Al posto della parola «Carico…»: la forma di quello che sta per
   arrivare. Chi aspetta vede quanto manca invece del vuoto. */
function scheletri(quanti = 4) {
  const g = document.createDocumentFragment();
  for (let i = 0; i < quanti; i++) {
    const s = elemento('div', 'scheletro');
    s.setAttribute('aria-hidden', 'true');
    for (const c of ['alta', 'tit', 'tit2', 'occ']) s.appendChild(elemento('span', c));
    g.appendChild(s);
  }
  return g;
}

/* Il contorno non blocca la lettura: se un pezzo di dati manca, la sua
   sezione lo dice e il resto funziona lo stesso. Sta in una funzione sua
   perché serve due volte: all'apertura e a ogni rinfresco. */
function caricaContorno() {
  /* Come è andato l'ultimo giro del giornale. Vale per entrambe le
     testate, e non deve bloccare niente: se il file non c'è, vuol dire
     che il ciclo non è ancora passato da quando esiste il referto. */
  json(`${F().dati}/stato-ciclo.json`).then(s => { stato.ciclo = s; segnaGuasto(); }).catch(() => {});

  if (stato.faccia === 'news') {
    json(`${F().dati}/macro.json`).then(m => { stato.macro = m; striscia(); }).catch(() => {});
    json(`${F().dati}/calendario.json`).then(c => { stato.calendario = c; }).catch(() => {});
    json(`${F().dati}/previsioni.json`).then(p => { stato.previsioni = p; }).catch(() => {});
    const slugs = [...new Set(stato.pezzi.map(p => p.dossier).filter(Boolean))];
    return Promise.all(slugs.map(x => json(`${F().dati}/dossier/${x}.json`).catch(() => null)))
      .then(d => { stato.dossier = d.filter(Boolean); });
  }
  return json(`${F().dati}/campo.json`).then(c => { stato.campo = c; striscia(); }).catch(() => {});
}

/* Quanto è vecchia l'edizione che si ha in mano. Un giornale che esce sei
   volte al giorno e mostra quello di stanotte deve dirlo. */
function segnaAggiornamento(indice) {
  const quando = new Date(indice.aggiornato);
  const piede = $('#aggiornato');
  piede.textContent = `Ultimo aggiornamento: ${quando.toLocaleString('it-IT')} · versione ${VERSIONE}`;
  const ore = (Date.now() - quando.getTime()) / 36e5;
  if (ore > 12) {
    piede.appendChild(elemento('span', 'vecchio-nota',
      ` — sono passate ${Math.round(ore)} ore: il ciclo potrebbe essersi fermato.`));
  }
}

/* Un giornale che dichiara le proprie incertezze deve dichiarare anche i
   propri guasti. Senza questo, un ciclo fallito è indistinguibile da una
   giornata in cui non è successo niente — e le due cose non si somigliano
   per niente. Il registro in .state/ non lo legge nessuno; questo si vede. */
const GUASTI = {
  'redattore-fallito':   'L\'ultimo giro del giornale si è interrotto',
  'validazione-respinta': 'L\'ultimo giro è stato respinto dai controlli',
  'push-fallito':        'L\'ultimo giro non è stato pubblicato',
};

function segnaGuasto() {
  document.getElementById('guasto')?.remove();
  const c = stato.ciclo;
  if (!c || !GUASTI[c.esito]) return;
  const p = elemento('p', 'guasto');
  p.id = 'guasto';
  p.appendChild(icona('i-dubbio'));
  const testo = `${GUASTI[c.esito]}, ${quandoIn(c.quando)}.` +
    `${c.nota ? ` ${c.nota}` : ''} Quello che vedi è l'edizione di prima.`;
  p.appendChild(elemento('span', null, testo));
  $('#chiusa').prepend(p);
}

async function caricaFaccia() {
  document.documentElement.dataset.faccia = stato.faccia;
  $('#nome-testata').textContent = F().nome;
  $('#altra-faccia').textContent = FACCE[F().altra].nome;
  $('#altra-faccia').title = `Passa a ${FACCE[F().altra].nome}`;
  document.title = F().nome;
  $('#quale-linea').textContent = F().linea;

  /* Tutto ciò che apparteneva all'altra faccia se ne va: i testi
     scaricati, i pezzi aperti, i filtri. Restano solo le preferenze. */
  stato.pezzi = []; stato.testi = new Map(); stato.aperti = new Set();
  stato.macro = stato.calendario = stato.previsioni = stato.campo = stato.ciclo = null;
  stato.dossier = []; stato.filtro = null; stato.storiaAperta = null;
  stato.sezione = 'flusso'; stato.partitaAperta = null; stato.stampati = 0;
  fermaOrologio();
  caricaLetti();

  $('#macro').hidden = true;
  $('#storia').hidden = true;
  $('#palco').textContent = '';
  $('#palco').appendChild(scheletri());
  coloreBarra();

  try {
    const indice = await json(`${F().dati}/indice.json`);
    stato.pezzi = indice.pezzi ?? [];
    stato.caricataIl = Date.now();
    segnaAggiornamento(indice);
  } catch {
    $('#palco').textContent = '';
    $('#palco').appendChild(elemento('p', 'vuoto',
      `Non trovo ${F().dati}/indice.json. Se sei in locale serve un server: \`python3 -m http.server 8765\`.`));
    costruisciSezioni();
    return;
  }

  caricaContorno();

  costruisciSezioni();   // il pallino dei non letti vive dentro una scheda: prima si costruiscono
  contaNuovi();
  pastiglie();
  $('#filtri').hidden = false;
  $('#chiusa').hidden = false;
  disegna();
}

function cambiaFaccia() {
  stato.faccia = F().altra;
  localStorage.setItem('news-faccia', stato.faccia);
  window.scrollTo({ top: 0 });
  const vai = async () => { await caricaFaccia(); scriviIndirizzo(); };
  /* Due giornali diversi con due colori diversi: la dissolvenza dice che
     si è cambiato mondo, invece di far sbattere le palpebre alla pagina. */
  if (document.startViewTransition && !menoMovimento()) document.startViewTransition(vai);
  else vai();
}

async function avvia() {
  tema();
  dimensioneTesto();
  $('#altra-faccia').onclick = cambiaFaccia;

  const campo = $('#cerca'), pulisci = $('#pulisci');
  /* Ogni tasto premuto ridisegnava la lista intera. Un respiro di
     centoventi millisecondi non si sente scrivendo, e si sente eccome
     quando i pezzi saranno tanti. */
  let attesaCerca = null;
  campo.oninput = () => {
    pulisci.hidden = !campo.value.trim();
    clearTimeout(attesaCerca);
    attesaCerca = setTimeout(() => {
      stato.cerca = campo.value.trim().toLowerCase();
      disegna();
    }, 120);
  };
  pulisci.onclick = () => {
    clearTimeout(attesaCerca);
    campo.value = ''; stato.cerca = ''; pulisci.hidden = true; disegna(); campo.focus();
  };

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
    annuncia('Segnati tutti come letti');
  };

  /* Un indirizzo ricevuto vince sull'ultima faccia visitata: chi apre un
     link al calcio deve trovarsi nel calcio. */
  const iniziale = leggiIndirizzo(location.hash);
  if (iniziale.faccia) stato.faccia = iniziale.faccia;

  await caricaFaccia();

  if (iniziale.faccia) await applicaIndirizzo(location.hash, { iniziale: true });
  else scriviIndirizzo({ nuovo: false });

  /* Il tasto «indietro» chiude quello che si è aperto invece di uscire
     dall'app. È l'unica cosa che qui distingue davvero un'app da un sito. */
  addEventListener('popstate', () => applicaIndirizzo(location.hash));

  sorvegliaRientro();
  sorvegliaTrascinamento();
  sorvegliaRete();
  sorvegliaVersione();
}

avvia();
