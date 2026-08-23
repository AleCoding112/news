# Linea editoriale — Calcio

Questo file è il criterio della seconda testata. Vale per il calcio quello che
`LINEA-EDITORIALE.md` vale per le notizie: il codice raccoglie e ordina, ma **cosa merita di
essere scritto e come** è deciso qui.

Le due linee sono separate apposta. Le notizie mettono lo sport nella lista nera; il calcio di
sport vive. Non possono condividere un criterio, e non devono contaminarsi.

---

## 0. Il problema

Il giornalismo sportivo italiano è il più populista che ci sia, e non per caso: deve produrre
contenuto ogni ora anche nei giorni in cui non succede niente. Il risultato è un campione
reale, preso dai feed in un pomeriggio qualunque:

> *5 nomi su cui puntare al fantacalcio* · *Il pagellone della Serie B* · *Viviano sbotta: «Ma
> come caz… si fa a dare rigore contro Sommer?»* · *Inter-Juve, cambiano le quote scudetto:
> ecco chi vincerà per i bookie* · *Dove vedere Torino-Milan in tv* · *Calciomercato Juventus
> h24* · *le probabili formazioni*

Nessuna di queste è un fatto. Sono riempitivo, e riconoscerlo è metà del lavoro.

---

## 1. La prova delle tre domande, versione calcio

Le tre domande delle notizie qui non funzionano: il calcio non «tocca» nessuno nel senso in
cui lo fa una decisione della BCE. Le domande giuste sono altre.

1. **Cambia qualcosa?** La stagione di una squadra, una carriera, un bilancio, un regolamento.
   Un risultato cambia la classifica; una dichiarazione no.
2. **È accertato?** E se non lo è, **quanto** non lo è. Vedi §3: qui si può scrivere anche di
   ciò che non è certo, purché sia dichiarato.
3. **Quanto dura?** Un infortunio di sei mesi pesa più di una squalifica di una giornata; una
   cessione pesa più di un turnover. **La durata è il moltiplicatore che il giornalismo
   sportivo ignora sempre**, perché tutto viene raccontato con la stessa enfasi.

Un evento che non passa nessuna delle tre non si scrive, per quanto sia in cima a tutti i
siti.

### Il perimetro

**La Juventus per prima**, quando c'è qualcosa di suo. Poi Serie A, Champions, Europa League,
nazionale e grandi tornei. Il resto del mondo entra **solo se tocca una di queste cose**: una
giornata di Premier League non è nel giornale di un tifoso della Juventus, ma un'avversaria di
Champions che perde il suo attaccante sì.

---

## 2. La lista nera

Non si scrive di:

- **Fantacalcio**, in nessuna forma.
- **Pagelle, pagelloni, voti, top e flop.** Un numero da 4 a 8 accanto a un cognome non è
  informazione.
- **Moviola e polemiche arbitrali.** L'episodio dubbio è il combustibile principale del
  giornalismo sportivo italiano e non produce mai conoscenza. Fa eccezione la decisione
  formale: una squalifica, un ricorso accolto, una modifica al regolamento.
- **Dichiarazioni che non contengono un fatto.** «Dobbiamo lavorare», «i tifosi meritano»,
  «sono contento del gruppo». Una dichiarazione diventa notizia solo quando **è** l'atto: un
  allenatore che annuncia le proprie dimissioni, un presidente che conferma una cessione.
- **Probabili formazioni.** Le formazioni ufficiali sì, un'ora prima no.
- **Pronostici, quote, scommesse.**
- **«Dove vedere in tv»**, orari, dirette testuali, rassegne «h24».
- **Retroscena senza fonte**, «esclusive» autoproclamate, «la verità su».
- **Tifosi furiosi**, social, gossip, capelli, vacanze, fidanzate.
- **Amarcord e ricorrenze.**

### «Dove vedere in tv» sta nella lista nera, e la scheda partita dice il canale

Non è una contraddizione, ed è utile capire perché — o un giorno qualcuno toglierà l'una cosa
o l'altra credendo di sistemare un'incoerenza.

Quello che sta nella lista nera è **l'articolo**: il pezzo di servizio scritto per raccogliere
clic su una ricerca, che riempie quattromila battute per dire un nome di canale. Quello lì non
è giornalismo, e il filtro meccanico gli toglie otto punti (`rumore`, in `testate/calcio.json`).

Il canale nella **scheda di una partita** è l'opposto: un dato in un campo, dato una volta a
chi lo cerca, senza fingere che sia una notizia. La differenza fra le due cose è la stessa che
passa fra un orario in tabella e un articolo intitolato «a che ora parte il treno».

---

## 3. La certezza dichiarata

Nelle notizie le voci sono vietate. Qui no: il mercato si segue anche quando è ancora
trattativa, perché è metà del gioco. Ma **il principio non cambia — non si finge mai una
certezza che non si ha** — cambia solo come si applica.

Ogni pezzo dichiara un campo `certezza`:

| valore | significa |
|---|---|
| **`fatto`** | è successo ed è verificabile: un risultato, un gol, un infortunio in campo |
| **`ufficiale`** | comunicato da club, lega o federazione |
| **`trattativa`** | confermata da almeno una delle parti coinvolte |
| **`voce`** | riportata da qualcuno, nessuna conferma |

Le regole che ne discendono, e che il validatore fa rispettare:

- Un pezzo `trattativa` o `voce` **non può avere un titolo che afferma**. «La Juve prende
  Miretti» è vietato se nessuno l'ha confermato; «Il Besiktas tratta Miretti con la Juventus»
  va bene.
- Il titolo o l'`unaRiga` **devono contenere il segnale di incertezza**: chi scorre legge solo
  quelli, e da lì deve capire che non è ancora successo niente.
- Una `voce` **dice chi l'ha riportata**. «Secondo Sky» è informazione; «si apprende» non lo è.
- Una `voce` **non apre mai il flusso**: se il pezzo più importante della giornata è una voce,
  la giornata non aveva un pezzo importante.

### Vale anche per i dati, non solo per i pezzi

La regola non riguarda soltanto quello che si scrive negli articoli. Toccando una partita
l'app apre una scheda che dice, fra le altre cose, **su che canale la si vede**: e quel dato
si riempie solo quando una fonte lo dichiara per quella partita.

Dedurlo dal ciclo dei diritti — *è Serie A, quindi DAZN* — sarebbe indovinare con l'aria di
sapere, che è esattamente ciò che questa testata non fa. Una scheda che ammette «non risulta
ancora dove viene trasmessa» e indica dove guardare vale più di una che indovina bene nove
volte su dieci: perché alla decima nessuno saprebbe più distinguere.

Lo stesso per l'aritmetica della classifica nella stessa scheda. «Se vince sale quarta» è un
conto sui punti di adesso, e va etichettato come conto — non come pronostico, e non tacendo
che lo scontro diretto non è calcolato.

### Le fonti

- Per un **risultato** basta una fonte: è un fatto che chiunque riporta allo stesso modo.
- Per un **trasferimento** ne servono due indipendenti, o il comunicato del club.
- Per l'**economia del calcio** valgono le regole delle notizie: **i numeri vengono dal
  documento** — bilancio, comunicato, sentenza — non dall'articolo che li riassume.
- I siti dedicati a una sola squadra (Tuttojuve, Juventus News 24, Bianconera) arrivano spesso
  primi sui fatti della Juventus, e altrettanto spesso pubblicano voci come se fossero fatti.
  **Si usano per la segnalazione, non per la conferma.**

---

## 4. Come si scrive

**Il lettore sa di calcio.** Non si spiega cos'è un falso nueve, una costruzione dal basso,
una clausola rescissoria o una plusvalenza. Spiegare ciò che il lettore già sa è una forma di
condiscendenza.

- **Corto.** Un risultato sta in 150 parole, un infortunio in 80. Solo l'analisi e l'economia
  meritano lunghezza.
- **Nessun aggettivo che non sia nel fatto.** «Vittoria pesante» va bene se accanto c'è cosa
  pesa; «clamoroso», «pazzesco», «terremoto», «bomba» non si usano mai.
- **Il titolo dice cosa è successo**, non cosa devi provare.
- **Niente prima persona plurale.** Non si scrive «abbiamo vinto»: questo è un giornale, non
  una curva. Il tifo sta nel leggerlo, non nello scriverlo.
- **I numeri sono numeri.** Minuti, gol, milioni, giornate di squalifica, mesi di stop.

### `perche_conta`, nel calcio

È la parte che manca sempre. Non «è importante per la corsa scudetto», ma: **questo fatto
agisce su cosa**. Un infortunio a un titolare cambia un modulo; una cessione libera un monte
ingaggi che vincola il mercato di gennaio; una sentenza UEFA sposta un criterio che vale per
tutti i club. Se non sai indicare il canale, non hai un «perché conta»: hai un commento.

---

## 5. I dati

Classifica, risultati e calendario stanno in `dati/calcio/campo.json`, che l'agente scrive
leggendo Wikipedia — la pagina della Serie A viene aggiornata entro pochi minuti dalla fine
delle partite.

**I numeri di classifica citati in un pezzo vengono da lì**, non dall'articolo. E come per i
dati macro: se `campo.json` è più vecchio di due giorni, va rinfrescato prima di citarlo.

---

## 6. Quanto pubblicare

**Nessuna quota**, come per le notizie. In un giorno di campionato ci sono più fatti; in un
mercoledì di agosto senza partite può non esserci niente, e allora non si scrive niente.

Da due a sei pezzi in una giornata con partite. Zero è un esito legittimo.

**Il giorno dopo una giornata di campionato** il pezzo che apre è quello sui risultati: cosa è
cambiato in classifica e perché, non la cronaca di ogni partita.

---

## 7. La rilettura critica

Passata **separata**, sui testi finiti. Su ogni pezzo:

1. C'è un **aggettivo che esprime un giudizio** non contenuto nel fatto? → toglilo.
2. Il pezzo è `trattativa` o `voce` e **il titolo lo dice**? → se no, riscrivilo.
3. Se è una `voce`, **ho detto chi l'ha riportata**?
4. C'è una **dichiarazione** usata al posto di un fatto?
5. Il `perche_conta` indica un **canale** — modulo, ingaggi, regolamento, classifica — o è un
   commento da bar?
6. I numeri di classifica vengono da **`campo.json`** o da un articolo?
7. Sto scrivendo **da tifoso**? Prima persona plurale, «purtroppo», «meritavamo»? → toglilo.
8. Il pezzo **sopravvive al taglio del 30%**? Nel calcio quasi sempre sì.
9. Questo pezzo passerebbe **le tre domande** se lo rileggessi a freddo, senza sapere quanti
   siti ne parlano?

**Scartare un pezzo già scritto è normale.** Nel calcio lo è ancora di più: la maggior parte di
ciò che viene pubblicato ogni giorno non doveva essere scritto.

---

## 8. Come si corregge questo file

Quando un pezzo pubblicato risulta inutile, la domanda non è «come scrivo meglio» ma **quale
riga di questo file l'ha lasciato passare**. Se il difetto è meccanico — una formula da
acchiappaclic che è passata — la riga da correggere sta invece in `testate/calcio.json`, nella
lista `rumore`. Il file cresce per casi reali, mai per ipotesi.
