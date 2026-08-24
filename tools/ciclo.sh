#!/bin/bash
# ============================================================
#  News — un ciclo editoriale completo
#
#  Raccoglie, aggiorna i numeri, raggruppa, poi chiama il
#  redattore per la parte di giudizio, valida e pubblica.
#
#  Lo lancia launchd ogni tre ore. Nessuno lo guarda mentre
#  gira: quindi tutto quello che succede finisce nel registro,
#  e ogni passo che può bloccarsi ha una scadenza.
#
#  Uso:  bash tools/ciclo.sh [--secco]
#        --secco  fa tutto tranne il push
# ============================================================

set -uo pipefail

QUI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$QUI" || exit 1

# launchd non eredita il PATH della shell: qui va scritto per esteso,
# altrimenti `node` semplicemente non esiste.
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# Gli argomenti si leggono per primi: registro e lucchetto portano il
# nome della testata, e leggerli dopo significa usarli prima di averli.
SECCO=0
TESTATA=news
SEGUE=0
for a in "$@"; do
  case "$a" in
    --secco)   SECCO=1 ;;
    --testata) SEGUE=1 ;;
    *)         if [ "$SEGUE" = "1" ]; then TESTATA="$a"; SEGUE=0; fi ;;
  esac
done

# Un registro e un lucchetto per testata: i due cicli devono poter
# girare senza escludersi a vicenda.
REGISTRO="$QUI/.state/ciclo-$TESTATA.log"
LUCCHETTO="$QUI/.state/in-corso-$TESTATA"
SCADENZA_REDATTORE=1800     # mezz'ora: oltre, qualcosa si è bloccato

mkdir -p "$QUI/.state"

nota() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$REGISTRO"; }

# ---------- il lucchetto ----------
# Due cicli che si accavallano scriverebbero lo stesso pezzo due volte.
# Un lucchetto vecchio di più di un'ora è di un ciclo morto, non di uno vivo.
if [ -f "$LUCCHETTO" ]; then
  ETA=$(( $(date +%s) - $(stat -f %m "$LUCCHETTO" 2>/dev/null || echo 0) ))
  if [ "$ETA" -lt 3600 ]; then
    nota "salto: un altro ciclo è in corso da ${ETA}s"
    exit 0
  fi
  nota "trovato un lucchetto vecchio di ${ETA}s: lo considero abbandonato"
fi
echo $$ > "$LUCCHETTO"
trap 'rm -f "$LUCCHETTO"' EXIT

# Dove finisce quello che il ciclo scrive lo sa la testata, non questo file.
DATI="$QUI/$(node -e "import('./tools/testata.mjs').then(async m=>{const T=await m.caricaTestata(process.argv[1]);console.log(require('path').relative(m.BASE,T.percorsi.dati))})" "$TESTATA")"

# ---------- il referto pubblico ----------
# Il registro in .state/ non lo legge mai nessuno, ed è pure ignorato da
# git: se un ciclo fallisce, il giornale continua a mostrare l'edizione
# di prima senza dire perché. Questo file invece viene pubblicato, e
# l'app lo scrive in fondo alla pagina. Un giornale che si vanta di
# dichiarare le proprie incertezze deve dichiarare anche i propri guasti.
REDATTORE_KO=0

stato_ciclo() {
  local nota="${2//\"/}"
  printf '{\n "quando": "%s",\n "testata": "%s",\n "esito": "%s",\n "nota": "%s"\n}\n' \
    "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$TESTATA" "$1" "${nota//$'\n'/ }" > "$DATI/stato-ciclo.json"
}

# Un guasto va pubblicato anche — soprattutto — quando non c'è nient'altro
# da pubblicare. Si committa il solo referto, mai il lavoro a metà.
pubblica_stato() {
  [ $SECCO -eq 1 ] && return 0
  git add "$DATI/stato-ciclo.json" 2>/dev/null || return 0
  git diff --cached --quiet && return 0
  git commit -q -m "Referto del ciclo «$TESTATA»" 2>/dev/null
  git pull --rebase -q 2>>"$REGISTRO" && git push -q 2>>"$REGISTRO"
}

nota "── ciclo «$TESTATA» avviato ──$([ $SECCO -eq 1 ] && echo ' (a secco)')"

# ---------- 1-3. i passi che non richiedono giudizio ----------
# Alcuni strumenti mettono il riepilogo in cima e il dettaglio sotto, altri
# il contrario: quale riga vale la pena registrare lo dice chi chiama.
passo() {
  local nome="$1" dove="$2"; shift 2
  local esito
  esito=$("$@" 2>&1)
  if [ $? -ne 0 ]; then
    nota "$nome: FALLITO — $(echo "$esito" | tail -3 | tr '\n' ' ')"
    return 1
  fi
  nota "$nome: $(echo "$esito" | $dove)"
  return 0
}

passo "raccolta" "tail -1" node tools/raccogli.mjs --testata "$TESTATA" || nota "la raccolta è fallita: il ciclo prosegue col grezzo precedente"
[ "$TESTATA" = "news" ] && { passo "numeri" "head -1" node tools/macro.mjs || nota "i numeri non si sono aggiornati: il ciclo prosegue con i precedenti"; }

if ! passo "raggruppamento" "tail -1" node tools/raggruppa.mjs --testata "$TESTATA"; then
  nota "senza candidati non c'è niente da giudicare: mi fermo"
  exit 1
fi

# ---------- 4-7. il giudizio ----------
# Il prompt sta in un file perché si corregge senza toccare lo script.
PROMPT_FILE="$QUI/$(node -e "import('./tools/testata.mjs').then(async m=>{const T=await m.caricaTestata(process.argv[1]);console.log(require('path').relative(m.BASE,T.percorsi.prompt))})" "$TESTATA")"
if [ ! -f "$PROMPT_FILE" ]; then
  nota "manca tools/prompt-ciclo.md: senza il prompt non si fa il ciclo"
  exit 1
fi

# `--secco` deve raggiungere anche il redattore, non solo lo script: il
# prompt gli dice di pubblicare da sé, e la prima prova a secco è finita
# online proprio per questo. L'istruzione si aggiunge in coda al prompt.
PROMPT_USATO="$QUI/.state/prompt-usato-$TESTATA.md"
cp "$PROMPT_FILE" "$PROMPT_USATO"
if [ $SECCO -eq 1 ]; then
  {
    echo
    echo "---"
    echo
    echo "## PROVA A SECCO"
    echo
    echo "Questo giro è una prova. Fai tutto il resto come sempre, ma **non eseguire**"
    echo "\`git commit\` né \`git push\`: lascia le modifiche nella copia di lavoro."
    echo "Dillo esplicitamente nel referto finale."
  } >> "$PROMPT_USATO"
fi

USCITA="$QUI/.state/ultimo-redattore-$TESTATA.txt"
nota "redattore: avviato"

# Niente poteri extra dalla riga di comando: i permessi del redattore sono
# solo quelli scritti in .claude/settings.json (scrittura su dati e .state,
# comandi elencati uno a uno). Il redattore legge testo di sconosciuti:
# le chiavi di tutta la casa non le deve avere.
#
# macOS non ha `timeout`, quindi la scadenza si fa a mano: il redattore
# gira sullo sfondo e un guardiano lo abbatte se supera il tempo.
claude -p \
  --model opus \
  < "$PROMPT_USATO" > "$USCITA" 2>&1 &
REDATTORE=$!

( sleep "$SCADENZA_REDATTORE"; kill -0 "$REDATTORE" 2>/dev/null && kill -9 "$REDATTORE" 2>/dev/null ) &
GUARDIANO=$!

wait "$REDATTORE"
ESITO=$?
kill "$GUARDIANO" 2>/dev/null

if [ $ESITO -ne 0 ]; then
  REDATTORE_KO=1
  nota "redattore: uscito con codice $ESITO (scadenza o errore)"
  nota "redattore dice: $(tail -5 "$USCITA" | tr '\n' ' ')"
else
  RIGA="$(tr '\n' ' ' < "$USCITA" | tail -c 500)"
  nota "redattore: ${RIGA:-(nessun referto: guarda .state/ultimo-redattore.txt)}"
fi

# ---------- 8. validazione ----------
# Il redattore dovrebbe averla già fatta, ma si ricontrolla: è l'unico
# passo che sta fra un pezzo sbagliato e la pubblicazione.
if ! node tools/valida.mjs --testata "$TESTATA" --senza-link > "$QUI/.state/ultima-validazione-$TESTATA.txt" 2>&1; then
  nota "validazione: RESPINTA — niente push"
  nota "$(tail -8 "$QUI/.state/ultima-validazione-$TESTATA.txt" | tr '\n' ' ')"
  stato_ciclo "validazione-respinta" "Un pezzo non ha passato i controlli, e non si pubblica niente finché non è a posto."
  pubblica_stato
  exit 1
fi
nota "validazione: $(tail -1 "$QUI/.state/ultima-validazione-$TESTATA.txt")"

[ "$TESTATA" = "news" ] && node tools/previsioni.mjs > /dev/null 2>&1

# ---------- pubblicazione ----------
if [ -z "$(git status --porcelain)" ]; then
  nota "niente di nuovo da pubblicare"
  if [ $REDATTORE_KO -eq 1 ]; then
    stato_ciclo "redattore-fallito" "Si è interrotto prima di finire, e questo giro non ha prodotto niente."
  else
    # Zero pezzi e un esito legittimo, non un guasto (LINEA-EDITORIALE.md).
    stato_ciclo "niente-di-nuovo" "Nessun fatto meritava un pezzo, in questo giro."
  fi
  pubblica_stato
  nota "── ciclo «$TESTATA» concluso ──"
  exit 0
fi

if [ $SECCO -eq 1 ]; then
  nota "a secco: ci sarebbe da pubblicare $(git status --porcelain | wc -l | tr -d ' ') file, non lo faccio"
  nota "── ciclo «$TESTATA» concluso ──"
  exit 0
fi

if [ $REDATTORE_KO -eq 1 ]; then
  stato_ciclo "redattore-fallito" "Si è interrotto prima di finire: è uscito solo ciò che era già pronto."
else
  stato_ciclo "pubblicato" ""
fi

# Il redattore committa da sé; se non l'ha fatto, si rimedia qui.
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -q -m "Ciclo «$TESTATA» del $(date '+%d %B %Y, %H:%M')" 2>&1 | head -2 >> "$REGISTRO"
fi

# L'azione su GitHub scrive anche lei i numeri e la finestra: senza
# riallineare prima, il push viene respinto e — peggio — la versione
# remota può sovrascrivere quella locale al giro dopo.
if ! git pull --rebase -q 2>>"$REGISTRO"; then
  nota "riallineamento fallito: c'è un conflitto da risolvere a mano, non pubblico"
  exit 1
fi

if git push -q 2>>"$REGISTRO"; then
  nota "pubblicato"
else
  nota "push fallito: resta da spingere al prossimo giro"
fi

nota "── ciclo «$TESTATA» concluso ──"
