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

REGISTRO="$QUI/.state/ciclo.log"
LUCCHETTO="$QUI/.state/in-corso"
SCADENZA_REDATTORE=1800     # mezz'ora: oltre, qualcosa si è bloccato
SECCO=0
[ "${1:-}" = "--secco" ] && SECCO=1

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

nota "── ciclo avviato ──$([ $SECCO -eq 1 ] && echo ' (a secco)')"

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

passo "raccolta" "tail -1" node tools/raccogli.mjs || nota "la raccolta è fallita: il ciclo prosegue col grezzo precedente"
passo "numeri"   "head -1" node tools/macro.mjs    || nota "i numeri non si sono aggiornati: il ciclo prosegue con i precedenti"

if ! passo "raggruppamento" "tail -1" node tools/raggruppa.mjs; then
  nota "senza candidati non c'è niente da giudicare: mi fermo"
  exit 1
fi

# ---------- 4-7. il giudizio ----------
# Il prompt sta in un file perché si corregge senza toccare lo script.
PROMPT_FILE="$QUI/tools/prompt-ciclo.md"
if [ ! -f "$PROMPT_FILE" ]; then
  nota "manca tools/prompt-ciclo.md: senza il prompt non si fa il ciclo"
  exit 1
fi

USCITA="$QUI/.state/ultimo-redattore.txt"
nota "redattore: avviato"

# Il prompt entra da stdin, non come argomento: `--allowedTools` accetta
# più valori di seguito e si mangerebbe il prompt scambiandolo per il nome
# di un altro strumento. Costa un'ora scoprirlo, un minuto evitarlo.
#
# macOS non ha `timeout`, quindi la scadenza si fa a mano: il redattore
# gira sullo sfondo e un guardiano lo abbatte se supera il tempo.
claude -p \
  --model opus \
  --permission-mode acceptEdits \
  --allowedTools "Bash" "Read" "Write" "Edit" "Glob" "Grep" "WebFetch" "WebSearch" \
  < "$PROMPT_FILE" > "$USCITA" 2>&1 &
REDATTORE=$!

( sleep "$SCADENZA_REDATTORE"; kill -0 "$REDATTORE" 2>/dev/null && kill -9 "$REDATTORE" 2>/dev/null ) &
GUARDIANO=$!

wait "$REDATTORE"
ESITO=$?
kill "$GUARDIANO" 2>/dev/null

if [ $ESITO -ne 0 ]; then
  nota "redattore: uscito con codice $ESITO (scadenza o errore)"
  nota "redattore dice: $(tail -5 "$USCITA" | tr '\n' ' ')"
else
  nota "redattore: $(tail -4 "$USCITA" | tr '\n' ' ' | cut -c1-400)"
fi

# ---------- 8. validazione ----------
# Il redattore dovrebbe averla già fatta, ma si ricontrolla: è l'unico
# passo che sta fra un pezzo sbagliato e la pubblicazione.
if ! node tools/valida.mjs --senza-link > "$QUI/.state/ultima-validazione.txt" 2>&1; then
  nota "validazione: RESPINTA — niente push"
  nota "$(tail -8 "$QUI/.state/ultima-validazione.txt" | tr '\n' ' ')"
  exit 1
fi
nota "validazione: $(tail -1 "$QUI/.state/ultima-validazione.txt")"

node tools/previsioni.mjs > /dev/null 2>&1

# ---------- pubblicazione ----------
if [ -z "$(git status --porcelain)" ]; then
  nota "niente di nuovo da pubblicare"
  nota "── ciclo concluso ──"
  exit 0
fi

if [ $SECCO -eq 1 ]; then
  nota "a secco: ci sarebbe da pubblicare $(git status --porcelain | wc -l | tr -d ' ') file, non lo faccio"
  nota "── ciclo concluso ──"
  exit 0
fi

# Il redattore committa da sé; se non l'ha fatto, si rimedia qui.
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -q -m "Ciclo del $(date '+%d %B %Y, %H:%M')" 2>&1 | head -2 >> "$REGISTRO"
fi

if git push -q 2>&1 | head -3 >> "$REGISTRO"; then
  nota "pubblicato"
else
  nota "push fallito: resta da spingere al prossimo giro"
fi

nota "── ciclo concluso ──"
