# News — come si esegue un ciclo

Sito a criterio esplicito con **quattro testate su due porte**. La porta principale (`/`)
mostra le notizie e il calcio; la porta `/trentino/` è il giornale di un'altra lettrice e
mostra il Trentino e l'Italia. Stessa macchina, criteri diversi — e per questo ogni testata
porta il proprio criterio in un file suo:

| | testata `news` | testata `calcio` | testata `trentino` | testata `italia` |
|---|---|---|---|---|
| criteri | `LINEA-EDITORIALE.md` | `LINEA-CALCIO.md` | `LINEA-TRENTINO.md` | `LINEA-ITALIA.md` |
| procedimento | `tools/prompt-ciclo.md` | `tools/prompt-calcio.md` | `tools/prompt-trentino.md` | `tools/prompt-italia.md` |
| configurazione | `testate/news.json` | `testate/calcio.json` | `testate/trentino.json` | `testate/italia.json` |
| fonti | `fonti.json` (63) | nel file testata (17) | nel file testata (7) | nel file testata (10) |
| dati | `dati/` | `dati/calcio/` | `dati/trentino/` | `dati/italia/` |

Le testate della seconda porta scrivono per una lettrice **senza formazione specifica**:
ogni sigla sciolta, ogni termine spiegato, niente sport, cronaca con sobrietà, nessuna
previsione. Il Trentino ammette il fatto retto da **una sola fonte autorevole**
(`fonte_sola` nella configurazione, §4 della sua linea); l'Italia no.

**Gli strumenti accettano `--testata <id>`, e senza indicazioni fanno le notizie.**

La linea editoriale va letta per intera prima di scegliere e prima di scrivere: questo file
dice *come* si esegue il ciclo, quella dice *cosa* merita di essere scritto.

Il progetto è in italiano: codice, commenti, campi dei dati, interfaccia.

**Il giornale esce da solo.** `launchd` lancia `tools/ciclo.sh` sei volte al giorno per le
notizie (fra le 7 e le 22), tre per il calcio, e due volte al giorno — mattina e sera —
per la coppia trentino+italia (`it.news.edizioni-lei`). Il ciclo fa i passi deterministici,
poi passa il giudizio a `claude -p` che legge il prompt della testata. Quello che segue
serve a capire il sistema o a lanciarlo a mano.

---

## Il ciclo

```bash
bash tools/ciclo.sh                        # le notizie, e pubblica
bash tools/ciclo.sh --testata calcio       # il calcio
bash tools/ciclo.sh --secco                # tutto tranne il push
```

Registro, lucchetto e referto portano il nome della testata (`.state/ciclo-news.log`,
`.state/ciclo-calcio.log`): i due cicli devono poter girare senza escludersi a vicenda.

Dentro, in ordine:

```
lucchetto → raccogli · macro · raggruppa → claude -p (giudizio) → valida → commit e push
```

I passi 1-3 e 8 sono codice: non richiedono giudizio e non ne esercitano. I passi 4-7 sì, e
li descrive `tools/prompt-ciclo.md` — che è il file da correggere quando il redattore sbaglia
il *procedimento*, mentre `LINEA-EDITORIALE.md` è quello da correggere quando sbaglia il
*criterio*.

Il registro di ogni ciclo è in `.state/ciclo.log`; l'ultimo referto del redattore in
`.state/ultimo-redattore.txt`. Entrambi sono ignorati da git e non li legge mai nessuno:
perciò il ciclo scrive anche **`dati/stato-ciclo.json`**, che invece viene pubblicato.

```json
{ "quando": "…", "testata": "calcio", "esito": "pubblicato", "nota": "" }
```

`esito` vale `pubblicato` · `niente-di-nuovo` (zero pezzi è un esito legittimo, non un guasto)
· `redattore-fallito` · `validazione-respinta`. Sugli ultimi due l'app scrive una riga in fondo
alla pagina: un giornale che dichiara le proprie incertezze deve dichiarare anche i propri
guasti, o un ciclo fallito diventa indistinguibile da una giornata in cui non è successo
niente.

### L'automazione

```bash
launchctl load   ~/Library/LaunchAgents/it.news.ciclo.plist    # accendi
launchctl unload ~/Library/LaunchAgents/it.news.ciclo.plist    # spegni
launchctl kickstart -k gui/$(id -u)/it.news.ciclo              # lancia adesso
```

Se il Mac dormiva all'ora prevista, `launchd` recupera al risveglio. Il lucchetto in
`.state/in-corso` evita che due cicli si accavallino; se un ciclo muore, il lucchetto viene
considerato abbandonato dopo un'ora.

**Perché il prompt entra da stdin e non come argomento:** `--allowedTools` accetta più valori
di seguito e si mangerebbe il prompt scambiandolo per il nome di un altro strumento.

**Perché serve `.claude/settings.json` e la fiducia sul progetto:** senza l'elenco dei
permessi il processo si ferma ad aspettare un consenso che alle sette del mattino non darà
nessuno. E i permessi vengono ignorati se il progetto non è marcato `hasTrustDialogAccepted`
in `~/.claude.json`. Le regole `Edit(percorso)` coprono anche le scritture: una regola
`Write(percorso)` non viene guardata.

---

## Lo schema di un pezzo

Un file per pezzo in `dati/pezzi/AAAA-MM-GG-NNN-slug.json`.

```json
{
  "id": "2026-08-22-001-dazi-usa-canada",
  "tipo": "notizia",
  "quando": "2026-08-22T21:50:00Z",
  "unaRiga": "Il fatto in una riga sola, non più di 120 caratteri",
  "titolo": "denotativo, senza aggettivi valutativi",
  "occhiello": "una riga: il fatto in sé",
  "temi": ["commercio", "geopolitica"],
  "area": "globale",
  "fatti": "cosa è successo, con i numeri e le date",
  "perche_conta": "il canale causale: cosa agisce su cosa, con che ritardo",
  "cosa_non_sappiamo": "obbligatorio — l'incertezza esplicita",
  "divergenze": "se le fonti non concordano, in cosa. Vuoto se concordano davvero",
  "numeri": [{"cosa": "…", "valore": "2,0%", "quando": "dic 2025", "fonte": "Eurostat", "serie": "hicp-ea"}],
  "fonti": [{"testata": "…", "titolo": "…", "url": "…", "tipo": "primaria|testata|analisi", "letto": true}],
  "sviluppo_di": null,
  "dossier": "dazi-usa-canada",
  "evento": "dazi-canada-2026-09",
  "previsione": {
    "afferma": "affermazione falsificabile",
    "scade": "2026-09-09",
    "come_si_verifica": "dove si va a guardare",
    "esito": "aperta"
  },
  "confidenza": "alta|media|bassa"
}
```

**`tipo`**: `notizia` (il caso normale) · `analisi` (il pezzo lungo, quando le istituzioni
tacciono) · `calendario` (cosa arriva) · `mancato` (cosa era atteso e non è successo). Il
validatore applica regole diverse per tipo: a un pezzo di calendario non si chiedono due
fonti indipendenti, a una notizia sì.

**`serie`** dev'essere un `id` di `macro.json`: è ciò che permette al validatore di
confrontare la cifra scritta con la fonte primaria e di respingere il pezzo se non torna.

### Il calcio in più: `certezza`

I pezzi di calcio dichiarano **`certezza`**: `fatto` · `ufficiale` · `trattativa` · `voce`.
Là si pubblicano anche le voci di mercato — è metà del gioco — ma il principio non cambia:
**non si finge mai una certezza che non si ha**. Il validatore respinge un pezzo `trattativa`
o `voce` il cui titolo afferma, o che non porta il segnale di incertezza in titolo e `unaRiga`.
Vedi `LINEA-CALCIO.md` §3.

I tipi del calcio sono altri: `partita` · `mercato` · `infortunio` · `decisione` · `economia`
· `analisi` · `calendario`. Le aree pure: `juventus` · `serie-a` · `champions` ·
`europa-league` · `nazionale` · `mondo`.

Un pezzo di calcio può portare **`partita`**: l'identificativo della partita di cui parla,
nella forma `serie-a-g2-juventus-parma`. Serve a farlo comparire dentro la scheda di quella
partita; senza, l'app ripiega sui nomi delle squadre nel titolo.

### La scheda di una partita

Toccando una partita in «In arrivo» si apre una scheda: ora e conto alla rovescia, dove si
vede, le due squadre a confronto in classifica, che cosa cambierebbe vincendo o perdendo, i
pezzi collegati, e il tasto per metterla in agenda. A partita finita la stessa scheda porta il
risultato.

Le partite in `dati/calcio/campo.json` possono quindi dire qualcosa in più, tutto facoltativo:

```json
{
  "quando": "2026-08-29T16:30:00Z", "casa": "Juventus", "ospite": "Parma",
  "competizione": "Serie A", "giornata": 2,
  "stadio": "Allianz Stadium, Torino",
  "dove_si_vede": [{ "canale": "DAZN", "tipo": "streaming", "esclusiva": true }],
  "dove_fonte": "https://…",
  "marcatori": [{ "minuto": 23, "chi": "…", "squadra": "…" }]
}
```

**`dove_si_vede` si riempie solo quando una fonte lo dice**, e allora `dove_fonte` è
obbligatorio — `tools/campo.mjs` respinge il canale senza chi lo dichiara. Dedurlo dal ciclo
dei diritti è indovinare: vedi `LINEA-CALCIO.md` §3. Se manca, l'app lo ammette e indica dove
guardare.

### Il risultato mentre si gioca

Wikipedia, che compila la classifica, **non serve per la diretta**: il 23 agosto 2026, due ore
dopo il fischio finale, non aveva ancora i risultati delle 18:30. ANSA invece riscrive il pezzo
mentre si gioca e mette il punteggio nel titolo.

`tools/diretta.mjs` legge solo quello e aggiunge alla partita un campo `diretta`:

```json
"diretta": { "risultato": "0-1", "quando": "2026-08-23T17:42:20Z", "fonte": "ANSA — Sport", "url": "…" }
```

È deterministico e diffidente per costruzione: accetta un punteggio **solo** se il titolo
contiene la coppia esatta `Casa-Ospite` di una partita già in calendario (uno schema più libero
ricava «il Napoli supera 0» contro «2 il Genoa» dai titoli di riepilogo), solo dopo il fischio
d'inizio, e **non tocca mai la classifica** — quella resta della fonte validata, coi punti che
devono tornare. Se il formato dei titoli cambia, non trova niente e non scrive niente: il
silenzio è il modo giusto di fallire.

Nell'app il punteggio compare in cima e nella scheda, sempre **dichiarato provvisorio**, con
l'ora e la fonte. Appena il ciclo porta il risultato vero in `ultima_giornata`, quello vince.

L'identificativo di una partita **non sta nei dati**: l'app lo ricava da competizione,
giornata e squadre, così resta lo stesso da un ciclo all'altro e un link continua a funzionare
domani.

`temi`: `macro` `politica-monetaria` `mercati` `economia` `commercio` `geopolitica` `guerre`
`difesa` `politica-ue` `politica-it` `regolamentazione` `energia` `tecnologia`.
`area`: `italia` `europa` `usa` `asia` `africa` `globale`.

---

## Struttura

```
testate/news.json     soglie, temi, tipi e liste di rumore delle notizie
testate/calcio.json   le stesse cose per il calcio, più le sue 17 fonti
tools/testata.mjs     carica la testata: percorsi e liste, condiviso da tutti gli strumenti
fonti.json            60 fonti verificate vive e recenti, con peso e tipo — e le morte, con la
                      ragione. Una fonte a bassa cadenza dichiari `giorni_attesi` (The Blizzard
                      è trimestrale), o il controllo di freschezza la darà per congelata
LINEA-EDITORIALE.md   i criteri: il cuore del progetto
tools/prompt-ciclo.md il procedimento che il redattore esegue a ogni giro
dati/macro.json       26 serie dalle fonti primarie, ognuna con dieci anni di storia
dati/indice.json      elenco dei pezzi: è ciò che il sito carica
dati/pezzi/           un file per pezzo
dati/calendario.json  cosa arriva, compilato leggendo le pagine istituzionali
dati/previsioni.json  il registro, ricostruito dai pezzi
dati/dossier/         lo stato delle storie aperte
dati/calcio/campo.json  classifica, risultati e prossime partite, lette da Wikipedia
dati/calcio/pezzi/    i pezzi di calcio
grezzo/               istantanee locali; finestra.json è la sola versionata
candidati.json        gli eventi in attesa di giudizio, più i segnali deboli
.state/coperti.json   che cosa è già stato raccontato
.state/ciclo.log      il registro dei cicli
```

## Gli strumenti

| Comando | Cosa fa |
|---|---|
| `node tools/raccogli.mjs --prova` | Quali fonti rispondono **e quali pubblicano ancora**. I feed muoiono in due modi: smettendo di rispondere (Reuters) e continuando a rispondere con roba vecchia (CSIS, ferma al 2016, che passava il controllo con la spunta verde). Esce con codice 1 se ne trova una rotta |
| `node tools/raccogli.mjs --compatta` | La finestra leggera di 48 ore (è quella che gira su GitHub) |
| `node tools/raggruppa.mjs --mostra` | Eventi con punteggio e segnali deboli: serve a giudicare la selezione **prima** del modello |
| `node tools/macro.mjs` | I numeri e la loro storia decennale |
| `node tools/valida.mjs` | Schema, lessico, fonti, numeri contro `macro.json`, previsioni, link |
| `node tools/previsioni.mjs --scadute` | Quali previsioni vanno verificate adesso |
| `node tools/calendario.mjs --mancati` | Cosa era atteso e non è stato raccontato |
| `node tools/campo.mjs` | Classifica e prossime partite: che i punti tornino, che non ci siano doppioni, e che un canale non compaia senza la fonte che lo dichiara |
| `node tools/diretta.mjs` | Il punteggio delle partite in corso, letto dal titolo di ANSA. Nessun modello, nessuna chiave. Gira da un'azione GitHub ogni dieci minuti |
| `node tools/schermo.mjs --apri` | Il sito in un iPhone virtuale, con i traboccamenti misurati |
| `node tools/icone.mjs` | Rigenera le icone |

Per provarlo in locale: `python3 -m http.server 8765`.

## Convenzioni

- **Nessuna dipendenza, nessun passo di build.** File statici che il browser esegue così come
  sono, come nel progetto Meteo. Se serve una libreria, quasi sempre non serve.

  **Il progetto non sta più sulla Scrivania**, e non è un dettaglio di gusto: macOS protegge
  `~/Desktop`, e il `bash` lanciato da `launchd` non ha quel permesso né può chiederlo a
  nessuno alle sette del mattino. Finché il giornale è vissuto lì, ogni ciclo automatico è
  morto con `exit 126` senza pubblicare mai niente. Se un giorno lo sposti di nuovo, tienilo
  fuori da Scrivania, Documenti e Download.
- `app.js` diviso in **sezioni numerate**, soglie e costanti in cima coi nomi in chiaro.
- I commenti spiegano **perché**, non cosa: il cosa si legge nel codice.
- **Ogni cosa che si apre ha un indirizzo**, nella forma
  `#/faccia/sezione/tipo/cosa?filtro=…` — per esempio
  `#/calcio/arrivo/partita/serie-a-g1-frosinone-juventus`. Da qui vengono il tasto «indietro»
  che chiude invece di uscire, i link condivisibili e le scorciatoie del manifesto. Chi
  aggiunge una sezione o una cosa che si apre la faccia comparire lì: la sezione 13b di
  `app.js` è l'unico posto da toccare.

## Quando qualcosa non va

Tre file, tre tipi di errore diversi:

- Un pezzo **non doveva essere scritto** → la riga da correggere sta nella linea editoriale
  della sua testata (`LINEA-EDITORIALE.md` o `LINEA-CALCIO.md`).
- Una **schifezza è passata il filtro meccanico** — un titolo da acchiappaclic, del
  fantacalcio, un altro sport → la lista `rumore` in `testate/<id>.json`.
- Il redattore ha sbagliato **il procedimento** — non ha verificato le previsioni, non ha
  cercato la seconda fonte → `tools/prompt-ciclo.md` o `tools/prompt-calcio.md`.

Nessuno dei tre è codice, ed è voluto: il giorno in cui il motore sarà un modello locale,
cambia chi legge quei file, non i file.
