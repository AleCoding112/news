# News

Un quotidiano personale che seleziona secondo criteri scritti, invece che secondo quello
che indigna.

I telegiornali non falliscono perché scrivono male: falliscono perché **selezionano su un
criterio sbagliato**, e quel criterio non è scritto da nessuna parte. Qui è scritto — sta in
[`LINEA-EDITORIALE.md`](LINEA-EDITORIALE.md) — quindi si può contestare e correggere. Se un
pezzo non è servito, la riga da cambiare è lì dentro.

## Che cosa fa

Raccoglie da 44 fonti verificate, raggruppa lo stesso evento raccontato da testate diverse
anche in lingue diverse, scarta il rumore riconoscibile, e su quel che resta esercita un
giudizio editoriale: sceglie, approfondisce, scrive e **rilegge cercando i propri errori**.

Il testo che ne esce è tarato su un lettore che di economia sa: spread, curva dei rendimenti
e output gap si usano e non si spiegano.

Ogni pezzo dichiara quattro cose che un notiziario non dichiara mai:

- **i fatti**, con i numeri e le date;
- **perché conta**, inteso come canale causale — non «è importante perché riguarda tutti»,
  ma cosa agisce su cosa, con che ritardo;
- **cosa non sappiamo**, campo obbligatorio: un pezzo senza incertezza dichiarata mente per
  omissione;
- **dove le fonti divergono**, quando divergono, senza scegliere la versione più comoda.

E dichiara le fonti una per una, dicendo di ognuna se è primaria e **se è stata letta per
intero o solo vista passare** dietro un paywall.

## I numeri

Le cifre non vengono dagli articoli ma dalle fonti statistiche primarie: **Eurostat**,
**FRED**, il **portale dati della BCE**, Yahoo Finance per i mercati. Nessuna chiave,
nessun account.

Ogni serie porta il suo periodo di riferimento, e quelle troppo vecchie per la loro frequenza
vengono marcate: un dato di dicembre presentato come la fotografia di oggi è l'errore peggiore
che questo sito possa commettere. Se un articolo dà una cifra diversa da quella della fonte
primaria, vince la fonte primaria e la discrepanza finisce fra le divergenze — e il validatore
rifiuta il pezzo che non lo fa.

## Il ciclo

```bash
node tools/raccogli.mjs      # 1. i feed → grezzo/
node tools/macro.mjs         # 2. i numeri veri → dati/macro.json
node tools/raggruppa.mjs     # 3. gli eventi con punteggio → candidati.json
#    4-7  selezione, approfondimento, scrittura, rilettura critica  (il giudizio)
node tools/valida.mjs        # 8. respinge e ricostruisce dati/indice.json
```

I passi 1-3 e 8 sono codice: non richiedono giudizio e non ne esercitano. I passi 4-7 sì, e
oggi li esegue Claude Code leggendo [`LINEA-EDITORIALE.md`](LINEA-EDITORIALE.md). Il giorno
in cui un modello locale sarà abbastanza bravo, cambia chi legge quel file: non il file.
È la ragione per cui i criteri stanno in un documento e non nel codice.

**Non esiste una quota di pezzi.** Se in un giro non è successo niente che meritasse, il
numero giusto di pezzi è zero.

## Gli strumenti

| Comando | Cosa fa |
|---|---|
| `node tools/raccogli.mjs --prova` | Quali fonti rispondono ancora, una per una. I feed muoiono in silenzio: Reuters l'ha fatto |
| `node tools/raccogli.mjs --compatta` | Accumula la finestra leggera delle ultime 48 ore (è quello che gira su GitHub) |
| `node tools/raggruppa.mjs --mostra` | Stampa gli eventi con punteggio e motivazione: serve a giudicare la selezione **prima** che intervenga il modello |
| `node tools/valida.mjs` | Schema, lessico, regole sulle fonti, numeri contro `dati/macro.json`, link |
| `node tools/schermo.mjs --apri` | Apre il sito in un iPhone virtuale, misura i traboccamenti e ne salva la fotografia |
| `node tools/icone.mjs` | Rigenera le icone PNG |

Per provarlo in locale: `python3 -m http.server 8765` e apri `http://127.0.0.1:8765`.

## Com'è fatto

Nessuna dipendenza, nessun passo di build: file statici che il browser esegue così come sono.

```
index.html            struttura e libreria di icone
styles.css            tipografia da lettura lunga, chiaro e scuro
app.js                flusso, filtri, ricerca, apertura dei pezzi
sw.js                 funzionamento offline
fonti.json            le 44 fonti, con tipo e peso — e quelle scartate, con il perché
LINEA-EDITORIALE.md   i criteri: il cuore del progetto
CLAUDE.md             come si esegue un ciclo
dati/macro.json       i numeri dalle fonti primarie
dati/indice.json      elenco dei pezzi: è quello che il sito carica
dati/pezzi/           un file per pezzo
tools/                gli strumenti del ciclo
```

## Le fonti scartate, e perché

Vale quanto l'elenco di quelle tenute. In `fonti.json` c'è la motivazione di ognuna:

- **GDELT** — rate limit aggressivo, risultati dominati da copie d'agenzia duplicate su
  aggregatori minori, titoli corrotti. Rumore, non copertura.
- **Google News RSS** — trova gli articoli, ma i link sono URL opachi che rispondono HTTP 400
  senza JavaScript. Un pezzo con link morti non serve a niente.
- **Reuters** — nessun feed vivo: `/world/rss` dà 401, `feeds.reuters.com` non risponde più.
- **IMF, OECD, BIS, NATO, Euractiv, VoxEU** — 403 o 404 su ogni percorso provato.

## Pubblicarlo

File statici, quindi GitHub Pages basta: **Settings → Pages → Deploy from a branch**, ramo
`main`, cartella `/ (root)`. Dal telefono, **Condividi → Aggiungi alla schermata Home**: si
comporta come un'app, si apre a schermo intero e resta leggibile senza rete.

> GitHub sospende i workflow schedulati nei repository fermi da 60 giorni: basta un commit
> qualsiasi per riattivarli.
