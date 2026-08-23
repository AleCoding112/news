# News

Un quotidiano personale che seleziona secondo criteri scritti, invece che secondo quello
che indigna.

I telegiornali non falliscono perché scrivono male: falliscono perché **selezionano su un
criterio sbagliato**, e quel criterio non è scritto da nessuna parte. Qui è scritto — sta in
[`LINEA-EDITORIALE.md`](LINEA-EDITORIALE.md) — quindi si può contestare e correggere. Se un
pezzo non è servito, la riga da cambiare è lì dentro.

## Che cosa fa

**Esce da solo, sei volte al giorno.** Raccoglie da 63 fonti verificate, raggruppa lo stesso
evento raccontato da testate diverse anche in lingue diverse, scarta il rumore riconoscibile,
e su quel che resta esercita un giudizio editoriale: sceglie, approfondisce, scrive e
**rilegge cercando i propri errori**.

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

## Due facce

L'app ha **due giornali**, e un interruttore in cima per passare dall'uno all'altro.

**News** è il giornale serio: economia, geopolitica, guerre, politica europea e italiana.
Mette lo sport nella lista nera.

**Calcio** è l'altra faccia: Juventus, Serie A, coppe europee, nazionale. Di sport vive.

Non condividono i criteri — sarebbe impossibile — ma condividono la macchina: raccolta,
raggruppamento, punteggio, validazione e ciclo automatico sono gli stessi. Ogni testata porta
il proprio criterio in un file suo (`LINEA-EDITORIALE.md`, `LINEA-CALCIO.md`) e la propria
configurazione in `testate/`, dove stanno anche **le liste di ciò che è rumore**: correggerle
non richiede di toccare il codice.

### La certezza dichiarata

Nel calcio si pubblicano anche le voci di mercato — è metà del gioco. Ma il principio del
progetto non cambia: **non si finge mai una certezza che non si ha.** Ogni pezzo dichiara se è
un `fatto`, qualcosa di `ufficiale`, una `trattativa` confermata da una delle parti, o una
`voce`. Il validatore **respinge** un pezzo che è una voce e ha un titolo che afferma, e sul
sito un tocco su «solo fatti» toglie di mezzo le chiacchiere.

Il giornalismo sportivo italiano è il più populista che ci sia — un campione vero, preso dai
feed in un pomeriggio qualunque: *5 nomi su cui puntare al fantacalcio*, *il pagellone della
Serie B*, *cambiano le quote scudetto: ecco chi vincerà per i bookie*, *dove vedere Torino-Milan
in tv*, *calciomercato h24*. La lista nera del calcio è tarata su quel campione.

## Le quattro domande

Il sito ha quattro sezioni perché sono quattro le domande a cui un giornale dovrebbe
rispondere, e i notiziari ne trattano una sola.

- **Flusso** — che cosa è successo. Tre livelli di lettura: una riga per scorrere, titolo e
  occhiello per capire, il pezzo intero per approfondire. Ciò che hai già letto si smorza.
- **In arrivo** — che cosa sta per succedere. Riunioni BCE e Fed, uscite dei dati, scadenze
  negoziali. Sapere che giovedì decide la BCE vale spesso più che sapere cos'è successo ieri.
- **Dossier** — a che punto sono le storie aperte. Dove siamo, come ci siamo arrivati, cosa
  guardare. I pezzi quotidiani ci si agganciano invece di ripetere ogni volta l'antefatto.
- **Previsioni** — se le cose che abbiamo detto si sono poi avverate. Ogni pezzo che spiega un
  meccanismo si assume una previsione falsificabile, con una data e un modo preciso di
  sbagliare. Il tabellone tiene il conto **anche quando è imbarazzante**: è l'unica misura
  onesta del fatto che il giornale funzioni invece di essere soltanto ben scritto.

## I segnali deboli

Una storia raccontata da una fonte sola non è pubblicabile — servono due fonti indipendenti,
o una primaria. Ma quella regola dice che servono due fonti **per pubblicare**, non per
accorgersi. Quindi le storie con sostanza e poca copertura non vengono buttate: finiscono in
un elenco a parte dove il compito non è «giudica se merita» ma **«vai a cercare la seconda
fonte»**. È la differenza fra un archivista e un editore.

## I numeri

Le cifre non vengono dagli articoli ma dalle fonti statistiche primarie: **Eurostat**,
**FRED**, il **portale dati della BCE**, Yahoo Finance per i mercati. Nessuna chiave,
nessun account.

Ogni serie porta **dieci anni della propria storia**, così un numero non arriva mai nudo:
il 3,3% di inflazione americana si legge accanto alla media del decennio, al percentile in cui
si colloca e alla distanza dal picco, con la curva disegnata. Toccare una voce della striscia
in cima la fa raccontare per esteso.

Ogni serie porta anche il suo periodo di riferimento, e quelle troppo vecchie per la loro
frequenza vengono marcate: un dato di dicembre presentato come la fotografia di oggi è
l'errore peggiore che questo sito possa commettere. Se un articolo dà una cifra diversa da quella della fonte
primaria, vince la fonte primaria e la discrepanza finisce fra le divergenze — e il validatore
rifiuta il pezzo che non lo fa.

## Il ciclo

```bash
bash tools/ciclo.sh                    # le notizie, e pubblica
bash tools/ciclo.sh --testata calcio   # il calcio
bash tools/ciclo.sh --secco            # tutto tranne il push
```

Dentro:

```
lucchetto → raccogli · macro · raggruppa → claude -p (il giudizio) → valida → commit e push
```

Raccolta, numeri, raggruppamento e validazione sono codice: non richiedono giudizio e non ne
esercitano. Selezione, approfondimento, scrittura e rilettura sì, e oggi li esegue Claude Code
leggendo [`LINEA-EDITORIALE.md`](LINEA-EDITORIALE.md) e
[`tools/prompt-ciclo.md`](tools/prompt-ciclo.md). Il giorno in cui un modello locale sarà
abbastanza bravo, cambia chi legge quei file: non i file. È la ragione per cui i criteri
stanno in un documento e non nel codice.

`launchd` lancia il ciclo sei volte al giorno fra le 7 e le 22 — mai di notte, perché le fonti
che contano non pubblicano e un ciclo a vuoto consuma e basta. Se il Mac dormiva, il ciclo
parte al risveglio: l'edizione arriva tardi invece di non arrivare.

**Non esiste una quota di pezzi.** Se in un giro non è successo niente che meritasse, il
numero giusto di pezzi è zero.

## Gli strumenti

| Comando | Cosa fa |
|---|---|
| `node tools/raccogli.mjs --prova` | Quali fonti rispondono ancora, una per una. I feed muoiono in silenzio: Reuters l'ha fatto |
| `node tools/raccogli.mjs --compatta` | Accumula la finestra leggera delle ultime 48 ore (è quello che gira su GitHub) |
| `node tools/raggruppa.mjs --mostra` | Eventi con punteggio e segnali deboli: serve a giudicare la selezione **prima** che intervenga il modello |
| `node tools/previsioni.mjs --scadute` | Quali previsioni vanno verificate adesso |
| `node tools/calendario.mjs --mancati` | Cosa era atteso e non è stato raccontato |
| `node tools/campo.mjs` | Classifica e prossima partita, col controllo che i punti tornino |
| `node tools/raggruppa.mjs --testata calcio --mostra` | Lo stesso, sulla testata calcio |
| `node tools/valida.mjs` | Schema, lessico, regole sulle fonti, numeri contro `dati/macro.json`, link |
| `node tools/schermo.mjs --apri` | Apre il sito in un iPhone virtuale, misura i traboccamenti e ne salva la fotografia |
| `node tools/icone.mjs` | Rigenera le icone PNG |

Per provarlo in locale: `python3 -m http.server 8765` e apri `http://127.0.0.1:8765`.

## Com'è fatto

Nessuna dipendenza, nessun passo di build: file statici che il browser esegue così come sono.

```
index.html            struttura e libreria di icone
styles.css            tipografia da lettura lunga, chiaro e scuro, due accenti
app.js                le due facce, flusso, filtri, ricerca, apertura dei pezzi
sw.js                 funzionamento offline
LINEA-EDITORIALE.md   i criteri delle notizie: il cuore del progetto
LINEA-CALCIO.md       i criteri del calcio
testate/news.json     soglie, temi, tipi e liste di rumore delle notizie
testate/calcio.json   le stesse cose per il calcio, più le sue 17 fonti
fonti.json            le 63 fonti delle notizie — e quelle morte, con il perché
CLAUDE.md             come si esegue un ciclo
dati/macro.json       i numeri dalle fonti primarie, con dieci anni di storia
dati/indice.json      elenco dei pezzi: è quello che il sito carica
dati/calcio/campo.json  classifica e partite, lette da Wikipedia
tools/                gli strumenti del ciclo, tutti con --testata
```

## Le fonti scartate, e perché

Vale quanto l'elenco di quelle tenute. In `fonti.json` c'è la motivazione di ognuna:

- **GDELT** — rate limit aggressivo, risultati dominati da copie d'agenzia duplicate su
  aggregatori minori, titoli corrotti. Rumore, non copertura.
- **Google News RSS** — trova gli articoli, ma i link sono URL opachi che rispondono HTTP 400
  senza JavaScript. Un pezzo con link morti non serve a niente.
- **Reuters** — nessun feed vivo: `/world/rss` dà 401, `feeds.reuters.com` non risponde più.
- **IMF, OECD, BIS, NATO, Euractiv, VoxEU** — 403 o 404 su ogni percorso provato.
- **Banca d'Italia, Bundesbank, Banque de France** — 403 o 404 ovunque. Fra le banche centrali
  nazionali regge solo la Bank of England.
- **World Bank, Brookings, IFO** — rispondono 200 ma servono HTML: il percorso RSS non esiste più.

E per il calcio: **UEFA, FIFA, Lega Serie A, FIGC e il sito della Juventus** non hanno un feed
vivo; **Corriere dello Sport e Tuttosport** servono HTML. Sui dati, **football-data.org**
richiede la registrazione e **TheSportsDB** nel piano gratuito tronca la classifica a cinque
squadre — una classifica di cinque squadre non è una classifica. Restano Wikipedia e il
buonsenso.

## Pubblicarlo

File statici, quindi GitHub Pages basta: **Settings → Pages → Deploy from a branch**, ramo
`main`, cartella `/ (root)`. Dal telefono, **Condividi → Aggiungi alla schermata Home**: si
comporta come un'app, si apre a schermo intero e resta leggibile senza rete.

> GitHub sospende i workflow schedulati nei repository fermi da 60 giorni: basta un commit
> qualsiasi per riattivarli.
