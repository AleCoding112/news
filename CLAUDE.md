# News — come si esegue un ciclo

Sito a criterio esplicito con **due testate**: le notizie e il calcio. Stessa macchina, criteri
opposti — le notizie mettono lo sport nella lista nera, il calcio di sport vive — e per questo
ogni testata porta il proprio criterio in un file suo:

| | testata `news` | testata `calcio` |
|---|---|---|
| criteri | `LINEA-EDITORIALE.md` | `LINEA-CALCIO.md` |
| procedimento | `tools/prompt-ciclo.md` | `tools/prompt-calcio.md` |
| configurazione | `testate/news.json` | `testate/calcio.json` |
| fonti | `fonti.json` (63) | dentro `testate/calcio.json` (17) |
| dati | `dati/` | `dati/calcio/` |

**Gli strumenti accettano `--testata <id>`, e senza indicazioni fanno le notizie.**

La linea editoriale va letta per intera prima di scegliere e prima di scrivere: questo file
dice *come* si esegue il ciclo, quella dice *cosa* merita di essere scritto.

Il progetto è in italiano: codice, commenti, campi dei dati, interfaccia.

**Il giornale esce da solo.** `launchd` lancia `tools/ciclo.sh` sei volte al giorno, fra le 7
e le 22. Il ciclo fa i passi deterministici, poi passa il giudizio a `claude -p` che legge
`tools/prompt-ciclo.md`. Quello che segue serve a capire il sistema o a lanciarlo a mano.

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
`.state/ultimo-redattore.txt`.

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

`temi`: `macro` `politica-monetaria` `mercati` `economia` `commercio` `geopolitica` `guerre`
`difesa` `politica-ue` `politica-it` `regolamentazione` `energia` `tecnologia`.
`area`: `italia` `europa` `usa` `asia` `africa` `globale`.

---

## Struttura

```
testate/news.json     soglie, temi, tipi e liste di rumore delle notizie
testate/calcio.json   le stesse cose per il calcio, più le sue 17 fonti
tools/testata.mjs     carica la testata: percorsi e liste, condiviso da tutti gli strumenti
fonti.json            63 fonti verificate, con peso e tipo — e le morte, con la ragione
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
| `node tools/raccogli.mjs --prova` | Quali fonti rispondono ancora. **I feed muoiono in silenzio**: Reuters l'ha fatto |
| `node tools/raccogli.mjs --compatta` | La finestra leggera di 48 ore (è quella che gira su GitHub) |
| `node tools/raggruppa.mjs --mostra` | Eventi con punteggio e segnali deboli: serve a giudicare la selezione **prima** del modello |
| `node tools/macro.mjs` | I numeri e la loro storia decennale |
| `node tools/valida.mjs` | Schema, lessico, fonti, numeri contro `macro.json`, previsioni, link |
| `node tools/previsioni.mjs --scadute` | Quali previsioni vanno verificate adesso |
| `node tools/calendario.mjs --mancati` | Cosa era atteso e non è stato raccontato |
| `node tools/campo.mjs` | Classifica e prossima partita, col controllo che i punti tornino |
| `node tools/schermo.mjs --apri` | Il sito in un iPhone virtuale, con i traboccamenti misurati |
| `node tools/icone.mjs` | Rigenera le icone |

Per provarlo in locale: `python3 -m http.server 8765`.

## Convenzioni

- **Nessuna dipendenza, nessun passo di build.** File statici che il browser esegue così come
  sono, come in `../Meteo`. Se serve una libreria, quasi sempre non serve.
- `app.js` diviso in **sezioni numerate**, soglie e costanti in cima coi nomi in chiaro.
- I commenti spiegano **perché**, non cosa: il cosa si legge nel codice.

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
