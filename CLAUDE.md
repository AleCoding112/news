# News — come si esegue un ciclo

Sito di notizie a criterio esplicito. La **linea editoriale sta in `LINEA-EDITORIALE.md`**
e va letta per intera prima di scegliere e prima di scrivere: questo file dice *come* si
esegue il ciclo, quello dice *cosa* merita di essere scritto.

Il progetto è in italiano: codice, commenti, campi dei dati, interfaccia.

---

## Il ciclo

```bash
node tools/raccogli.mjs      # 1. i feed → grezzo/
node tools/macro.mjs         # 2. i numeri veri → dati/macro.json
node tools/raggruppa.mjs     # 3. gli eventi con punteggio → candidati.json
#    4-7: il giudizio, qui sotto
node tools/valida.mjs        # 8. respinge e ricostruisce dati/indice.json
```

I passi 1-3 e 8 sono deterministici e non richiedono giudizio. I passi 4-7 sì.

### 4. Selezione

Leggi `candidati.json` e applica **§1 (la prova delle tre domande)** e **§2 (la lista nera)**.

- Il `punti` di ogni candidato è un'euristica meccanica, **non un verdetto**. Un candidato a
  punteggio alto può non passare le tre domande; uno a punteggio basso può essere il pezzo
  migliore della giornata. Il punteggio ordina, non decide.
- **Guarda `imparentati`.** Il raggruppamento è prudente: preferisce lasciare separati due
  gruppi piuttosto che unirli a torto. Quattro candidati imparentati sono spesso **una sola
  storia** vista da quattro angolazioni, e vanno trattati come un pezzo solo.
- **`gia_coperto` non significa "scarta".** Significa: se c'è uno sviluppo reale, il pezzo è
  una **catena** (§5) e racconta solo cosa è cambiato. Se non è cambiato nulla, si lascia stare.
- **Zero pezzi è un esito legittimo** (§6). Non c'è una quota da riempire.

### 5. Approfondimento

Per i soli candidati scelti:

- **WebFetch sugli articoli**, dando la precedenza al documento primario sull'articolo che
  lo commenta (§3). Se una fonte è `paywall: true`, di quel pezzo hai solo il titolo: va
  segnata `letto: false` e non può reggere un fatto da sola.
- **Apri `dati/macro.json`** per i numeri. I numeri vengono da lì, non dagli articoli. Se un
  articolo dà una cifra diversa, vince `macro.json` e la discrepanza va in `divergenze`.
- Controlla il campo `obsoleto`: un dato vecchio si cita **con la sua data**, o non si cita.

### 6. Scrittura

Un file per pezzo in `dati/pezzi/AAAA-MM-GG-NNN-slug.json`, dove `NNN` è progressivo
nella giornata. Struttura e stile: **§4**.

```json
{
  "id": "2026-08-22-001-dazi-canada",
  "quando": "2026-08-22T18:40:00Z",
  "titolo": "denotativo, senza aggettivi valutativi",
  "occhiello": "una riga: il fatto in sé",
  "temi": ["commercio", "geopolitica"],
  "area": "globale",
  "fatti": "cosa è successo, con i numeri e le date",
  "perche_conta": "il canale causale: cosa agisce su cosa, con che ritardo",
  "cosa_non_sappiamo": "obbligatorio — l'incertezza esplicita",
  "divergenze": "se le fonti non concordano, in cosa. Stringa vuota se concordano davvero",
  "numeri": [{"cosa": "…", "valore": "2,0%", "quando": "dic 2025", "fonte": "Eurostat", "serie": "hicp-ea"}],
  "fonti": [{"testata": "…", "titolo": "…", "url": "…", "tipo": "primaria|testata|analisi", "letto": true}],
  "sviluppo_di": null,
  "confidenza": "alta|media|bassa"
}
```

Il campo `serie` di un numero deve corrispondere a un `id` di `macro.json`: è ciò che
permette al validatore di confrontare la cifra scritta con la fonte primaria.

`temi` ammessi: `macro` `politica-monetaria` `mercati` `economia` `commercio` `geopolitica`
`guerre` `difesa` `politica-ue` `politica-it` `regolamentazione` `energia` `tecnologia`.
`area`: `italia` `europa` `usa` `asia` `africa` `globale`.

### 7. Rilettura critica

**Passata separata**, a testi finiti, con la checklist di **§7**. Va fatta cercando gli
errori, non confermando il lavoro. Scartare un pezzo già scritto è un esito normale.

### 8. Chiusura

```bash
node tools/valida.mjs
```

Respinge i pezzi che violano le regole verificabili e ricostruisce `dati/indice.json` solo
se passano tutti. **Un pezzo respinto si corregge o si elimina: non si aggira il validatore.**

Poi aggiorna `.state/coperti.json` con le storie trattate (impronta, id, titolo, quando),
così il ciclo successivo le riconosce, e infine `git commit` e `git push`: GitHub Pages
pubblica da `main`.

---

## Struttura

```
fonti.json            registro delle fonti verificate, con peso e tipo
LINEA-EDITORIALE.md   i criteri — il vero cuore del progetto
dati/macro.json       i numeri dalle fonti statistiche primarie
dati/indice.json      elenco dei pezzi: è ciò che il sito carica
dati/pezzi/           un file per pezzo
grezzo/               istantanee della raccolta, rotazione a 7 giorni
candidati.json        gli eventi in attesa di giudizio (rigenerato ogni ciclo)
.state/coperti.json   che cosa è già stato raccontato
tools/                gli strumenti del ciclo
```

## Convenzioni

- **Nessuna dipendenza, nessun passo di build.** File statici che il browser esegue così
  come sono, come in `../Meteo`. Se serve una libreria, quasi sempre non serve.
- `app.js` diviso in **sezioni numerate**, soglie e costanti in cima con i nomi in chiaro.
- I commenti spiegano **perché**, non cosa: il cosa si legge nel codice.
- `node tools/raccogli.mjs --prova` per vedere quali feed sono ancora vivi. **I feed muoiono
  in silenzio**: Reuters lo ha fatto. Va controllato ogni tanto.
- `node tools/raggruppa.mjs --mostra` per giudicare la selezione *prima* che intervenga il
  modello. È lì che si tarano le soglie.

## Quando qualcosa non va

Se un pezzo pubblicato risulta inutile, la domanda non è «come scrivo meglio» ma **«quale
riga di `LINEA-EDITORIALE.md` l'ha lasciato passare»**. Si corregge quella riga (§8).
