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

# Gli argomenti si leggono per primi: il registro porta il nome della
# testata, e leggerlo dopo significa usarlo prima di averlo.
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

# Il registro porta il nome della testata; il lucchetto no. Le testate
# condividono lo stesso repository, e due cicli insieme si pestano i piedi
# sul git — al risveglio del Mac succedeva sempre, perché launchd recupera
# tutti i lanci persi in una volta. Chi arriva mentre un altro lavora non
# salta il giro: si mette in coda.
REGISTRO="$QUI/.state/ciclo-$TESTATA.log"
LUCCHETTO="$QUI/.state/in-corso"
SCADENZA_REDATTORE=1800     # mezz'ora: oltre, qualcosa si è bloccato

mkdir -p "$QUI/.state"

nota() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$REGISTRO"; }

# ---------- il lucchetto ----------
# `mkdir` è atomico: due cicli che lo tentano insieme, uno solo lo ottiene.
# Un ciclo intero — col secondo tentativo del redattore — può durare più di
# un'ora: un lucchetto è di un ciclo morto solo dopo due. Chi aspetta si
# arrende dopo 90 minuti: al giro dopo launchd ci riprova comunque.
ATTESA=0
while ! mkdir "$LUCCHETTO" 2>/dev/null; do
  ETA=$(( $(date +%s) - $(stat -f %m "$LUCCHETTO" 2>/dev/null || echo 0) ))
  if [ "$ETA" -ge 7200 ]; then
    nota "trovato un lucchetto vecchio di ${ETA}s: lo considero abbandonato"
    rm -rf "$LUCCHETTO"
    continue
  fi
  if [ "$ATTESA" -ge 5400 ]; then
    nota "salto: dopo 90 minuti di coda un altro ciclo sta ancora lavorando"
    exit 0
  fi
  [ "$ATTESA" -eq 0 ] && nota "un altro ciclo è in corso: mi metto in coda"
  sleep 30; ATTESA=$((ATTESA+30))
done
echo $$ > "$LUCCHETTO/pid"
trap 'rm -rf "$LUCCHETTO"' EXIT

# ---------- il riallineamento ----------
# `git pull --rebase` può fermarsi su un conflitto, e un rebase lasciato a
# metà blocca ogni ciclo successivo: da qui non se ne esce mai con uno
# aperto. I conflitti su dati, grezzo e .state riguardano file che il ciclo
# rigenera comunque: vince la versione locale, che è appena stata validata.
# Sul codice invece non decide uno script: rebase abbandonato e nota nel
# registro.
riallinea() {
  if [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; then
    nota "riallineamento: chiudo un rebase lasciato a metà da un ciclo morto"
    git rebase --abort 2>>"$REGISTRO" || git rebase --quit 2>>"$REGISTRO"
  fi
  # --autostash: con modifiche non committate nell'albero — i resti di un
  # redattore morto a metà, o un lavoro in corso di chi sviluppa — il pull
  # si rifiuterebbe di partire. Meglio metterle da parte e rimetterle dopo.
  git pull --rebase --autostash -q 2>>"$REGISTRO" && return 0
  local GIRO=0 CONFLITTI FUORI F
  while [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; do
    GIRO=$((GIRO+1)); [ "$GIRO" -gt 10 ] && break
    CONFLITTI=$(git diff --name-only --diff-filter=U)
    FUORI=$(echo "$CONFLITTI" | grep -vE '^(dati/|grezzo/|\.state/|candidati)' | grep -v '^$' || true)
    if [ -n "$FUORI" ]; then
      nota "riallineamento: conflitto sul codice ($(echo "$FUORI" | tr '\n' ' ')) — non decide uno script"
      break
    fi
    if [ -n "$CONFLITTI" ]; then
      while IFS= read -r F; do
        git checkout --theirs -- "$F" 2>/dev/null || true
        git add -- "$F" 2>>"$REGISTRO" || true
      done <<< "$CONFLITTI"
    fi
    GIT_EDITOR=true git rebase --continue >>"$REGISTRO" 2>&1 \
      || GIT_EDITOR=true git rebase --skip >>"$REGISTRO" 2>&1 \
      || break
  done
  if [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; then
    git rebase --abort 2>>"$REGISTRO" || git rebase --quit 2>>"$REGISTRO"
    nota "riallineamento fallito: resto sulla versione locale, si riprova al prossimo giro"
    return 1
  fi
  return 0
}

# Meglio partire allineati: il remoto ha i commit dell'azione GitHub, e
# lavorare su una base vecchia significa un conflitto in più alla fine.
riallinea || nota "riallineamento iniziale fallito: proseguo con la copia locale"

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
  riallinea && git push -q 2>>"$REGISTRO"
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

# Niente poteri extra dalla riga di comando: i permessi del redattore sono
# solo quelli scritti in .claude/settings.json (scrittura su dati e .state,
# comandi elencati uno a uno). Il redattore legge testo di sconosciuti:
# le chiavi di tutta la casa non le deve avere. Il push non ce l'ha più
# nemmeno lui: pubblicare tocca a questo script, dopo il riallineamento.
#
# macOS non ha `timeout`, quindi la scadenza si fa a mano: il redattore
# gira sullo sfondo e un guardiano lo abbatte se supera il tempo.
#
# Due tentativi: metà dei cicli persi erano reti cadute e sessioni OAuth
# scadute, guasti che passano da soli. Al secondo fallimento ci si arrende.
TENTATIVO=0
while :; do
  TENTATIVO=$((TENTATIVO+1))
  nota "redattore: avviato (tentativo $TENTATIVO)"
  claude -p \
    --model opus \
    < "$PROMPT_USATO" > "$USCITA" 2>&1 &
  REDATTORE=$!

  ( sleep "$SCADENZA_REDATTORE"; kill -0 "$REDATTORE" 2>/dev/null && kill -9 "$REDATTORE" 2>/dev/null ) &
  GUARDIANO=$!

  wait "$REDATTORE"
  ESITO=$?
  kill "$GUARDIANO" 2>/dev/null

  [ $ESITO -eq 0 ] && break
  nota "redattore: uscito con codice $ESITO (scadenza o errore)"
  nota "redattore dice: $(tail -5 "$USCITA" | tr '\n' ' ')"
  if [ $TENTATIVO -ge 2 ]; then
    REDATTORE_KO=1
    break
  fi
  nota "redattore: riprovo fra un minuto"
  sleep 60
done

if [ $ESITO -eq 0 ]; then
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
# Solo i dati e la memoria: il codice non lo pubblica mai un ciclo
# automatico. Se risulta toccato, lo si scrive nel registro e resta lì.
if [ -n "$(git status --porcelain)" ]; then
  TOCCATO_CODICE=$(git status --porcelain | grep -E '(app\.js|index\.html|styles\.css|sw\.js|manifest|tools/)' || true)
  [ -n "$TOCCATO_CODICE" ] && nota "ATTENZIONE: risultano modifiche al codice, che non pubblico: $(echo "$TOCCATO_CODICE" | tr '\n' ' ')"
  git add dati .state grezzo 2>>"$REGISTRO"
  git diff --cached --quiet || git commit -q -m "Ciclo «$TESTATA» del $(date '+%d %B %Y, %H:%M')" 2>&1 | head -2 >> "$REGISTRO"
fi

# L'azione su GitHub scrive anche lei i numeri e la finestra: senza
# riallineare prima, il push viene respinto e — peggio — la versione
# remota può sovrascrivere quella locale al giro dopo.
if ! riallinea; then
  nota "non pubblico questo giro: i commit restano in locale e partiranno al prossimo"
  exit 1
fi

if git push -q 2>>"$REGISTRO"; then
  nota "pubblicato"
else
  nota "push fallito: resta da spingere al prossimo giro"
fi

nota "── ciclo «$TESTATA» concluso ──"
