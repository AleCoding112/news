/* ============================================================
   News — la testata
   Il progetto pubblica due giornali con la stessa macchina ma
   criteri diversi: le notizie, che mettono lo sport nella lista
   nera, e il calcio, che di sport vive. Non possono condividere
   il criterio, quindi ogni testata porta il suo in un file.

   Qui si carica quel file: percorsi, soglie, temi, tipi di pezzo
   e le liste di rumore, che sono stringhe in JSON e diventano
   espressioni regolari qui. È il motivo per cui la lista di ciò
   che è rumore si corregge senza toccare il codice.

   Uso:  import { caricaTestata } from './testata.mjs';
         const T = await caricaTestata();      // legge --testata
   ============================================================ */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI  = path.dirname(fileURLToPath(import.meta.url));
export const BASE = path.join(QUI, '..');

/* Quale testata dice la riga di comando; senza indicazioni, le notizie. */
export function qualeTestata(argv = process.argv) {
  const i = argv.indexOf('--testata');
  return (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[i + 1] : 'news';
}

function compila(r) {
  if (!r) return null;
  return new RegExp(r.re, r.bandiere ?? 'i');
}

export async function caricaTestata(id = qualeTestata()) {
  const file = path.join(BASE, 'testate', `${id}.json`);
  let cfg;
  try {
    cfg = JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    throw new Error(`testata «${id}» non caricabile (${file}): ${e.message}`);
  }

  const dove = p => path.join(BASE, p);

  return {
    id: cfg.id,
    nome: cfg.nome,
    claim: cfg.claim,
    accento: cfg.accento,

    /* I percorsi sono assoluti da qui in poi: nessuno strumento deve
       più sapere che le notizie stanno in `dati/` e il calcio in
       `dati/calcio/`. */
    percorsi: {
      fonti:     dove(cfg.percorsi.fonti),
      grezzo:    dove(cfg.percorsi.grezzo),
      dati:      dove(cfg.percorsi.dati),
      pezzi:     dove(path.join(cfg.percorsi.dati, 'pezzi')),
      indice:    dove(path.join(cfg.percorsi.dati, 'indice.json')),
      candidati: dove(cfg.percorsi.candidati),
      coperti:   dove(cfg.percorsi.coperti),
      linea:     dove(cfg.linea),
      prompt:    dove(cfg.prompt),
    },

    soglie: cfg.soglie,
    temi:   cfg.temi,
    aree:   cfg.aree,
    tipi:   cfg.tipi,

    /* Le liste editoriali, compilate. */
    cifra:      compila(cfg.cifra),
    decisione:  compila(cfg.decisione),
    valutativi: compila(cfg.valutativi),
    rumore:     (cfg.rumore ?? []).map(r => ({ re: compila(r), punti: r.punti, perche: r.perche })),
    ancore:     (cfg.ancore ?? []).map(a => ({ re: compila(a), serie: a.serie })),

    /* Parole tematiche proprie della testata: si aggiungono a quelle
       comuni, non le sostituiscono. Al calcio servono i nomi delle
       squadre, alle notizie no. */
    tematiche: cfg.tematiche ?? [],

    /* Nel calcio «Roma» e «Torino» sono squadre, non città: se restassero
       fra i nomi geografici verrebbero trattati come entità troppo comuni
       per reggere un accostamento, e due notizie sulla Roma non si
       riconoscerebbero come la stessa storia. */
    geografia_togli: cfg.geografia_togli ?? [],

    /* Solo il calcio dichiara quanto vale ciò che pubblica. */
    certezze:  cfg.certezze ?? null,

    /* E solo il calcio ha un perimetro: la Premier League non è nel
       giornale di un tifoso della Juventus, se non tocca le coppe. */
    /* La regola locale: una fonte sola autorevole regge un fatto,
       se la testata lo dichiara (vedi LINEA-TRENTINO.md §4). */
    fonte_sola: cfg.fonte_sola ?? null,

    perimetro: cfg.perimetro
      ? { dentro: compila(cfg.perimetro.dentro), punti: cfg.perimetro.fuori_punti ?? -4, guarda: cfg.perimetro.guarda ?? 'titoli' }
      : null,

    grezzo_extra: cfg.grezzo_extra ?? {},
    _cfg: cfg,
  };
}

/* Le fonti stanno in un file a parte per le notizie (fonti.json, che
   esisteva prima delle testate) e dentro la configurazione per il
   calcio. Da qui in avanti la differenza non si vede. */
export async function caricaFonti(T) {
  if (T._cfg.fonti) return T._cfg.fonti;
  const r = JSON.parse(await readFile(T.percorsi.fonti, 'utf8'));
  return r.fonti;
}
