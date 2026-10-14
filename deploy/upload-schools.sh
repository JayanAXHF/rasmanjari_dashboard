#!/usr/bin/env zsh
set -euo pipefail

# Add schools from a CSV using the reset script's SSH and login-card workflow.
REPO_DIR="${0:A:h:h}"
CSV_PATH="${1:-}"
[[ -z "$CSV_PATH" ]] || CSV_PATH="${CSV_PATH:A}"
cd "$REPO_DIR"
: "${SERVER_IP:=161.118.168.235}"
: "${SSH_USER:=opc}"
: "${SSH_KEY:=/Users/jayansunil/Downloads/ssh-key-2026-08-25 (1).key}"
: "${SCHOOL_IMPORT_DATABASE_PATH:=/var/portal/data/app.db}"
: "${PYTHON_BIN:=python3}"
: "${SCHOOL_CARDS_DIR:=$REPO_DIR/private/school-cards}"

if [[ "${1:-}" == '--help' || "${1:-}" == '-h' ]]; then
  print 'Usage: deploy/upload-schools.sh [schools.csv]'
  print 'CSV headers: name,username. Without a path, opens a file picker.'
  print 'Adds new schools, generates random passwords, and saves credentials.csv and cards.pdf.'
  exit 0
fi
(( $# <= 1 )) || { print -u2 'Usage: deploy/upload-schools.sh [schools.csv]'; exit 1; }
command -v gum >/dev/null 2>&1 || { print -u2 'gum is required. Install it with: brew install gum'; exit 1; }
die() { gum log --level error "$*"; exit 1; }

umask 077
BUNDLE_DIR=''
KEEP_BUNDLE=0
cleanup() {
  if [[ -n "$BUNDLE_DIR" ]]; then
    rm -f -- "$BUNDLE_DIR/records.tsv"
    (( KEEP_BUNDLE )) || rm -rf -- "$BUNDLE_DIR"
  fi
  return 0
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' HUP TERM

[[ -n "$CSV_PATH" ]] || CSV_PATH="$(gum file --file)"
[[ -f "$CSV_PATH" && -r "$CSV_PATH" ]] || die "CSV file is not readable: $CSV_PATH"
[[ -r "$SSH_KEY" ]] || die "SSH key is not readable: $SSH_KEY"
command -v "$PYTHON_BIN" >/dev/null 2>&1 || die "Python is not available: $PYTHON_BIN"
"$PYTHON_BIN" scripts/generate-school-cards.py --check || die 'PDF dependencies are missing. See README.md for setup.'

typeset -a SSH FONT_OPTIONS
SSH=(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SSH_USER@$SERVER_IP")
FONT_OPTIONS=()
[[ -z "${SCHOOL_CARDS_FONT:-}" ]] || FONT_OPTIONS+=(--font "$SCHOOL_CARDS_FONT")
[[ -z "${SCHOOL_CARDS_BOLD_FONT:-}" ]] || FONT_OPTIONS+=(--bold-font "$SCHOOL_CARDS_BOLD_FONT")
[[ -z "${SCHOOL_CARDS_MONO_FONT:-}" ]] || FONT_OPTIONS+=(--mono-font "$SCHOOL_CARDS_MONO_FONT")

# Run local source in the deployed release so the existing native modules resolve.
# No passwords appear in the command; credentials travel only through stdin.
REMOTE_NODE="$(<scripts/add-schools.mjs)"
REMOTE_COMMAND="cd /opt/portal/current && sudo -u app env SCHOOL_IMPORT_DATABASE_PATH=${(q)SCHOOL_IMPORT_DATABASE_PATH} /usr/bin/node --input-type=module -e ${(q)REMOTE_NODE}"
"${SSH[@]}" "cd /opt/portal/current && sudo -u app env SCHOOL_IMPORT_CHECK=1 SCHOOL_IMPORT_DATABASE_PATH=${(q)SCHOOL_IMPORT_DATABASE_PATH} /usr/bin/node --input-type=module -e ${(q)REMOTE_NODE}" \
  || die 'Remote database check failed. No schools were added. Check SCHOOL_IMPORT_DATABASE_PATH.'

mkdir -p -- "$SCHOOL_CARDS_DIR"
BUNDLE_DIR="$(mktemp -d "$SCHOOL_CARDS_DIR/school-import-$(date +%Y%m%d-%H%M%S)-XXXXXXXX")"
"$PYTHON_BIN" scripts/prepare-school-import.py "$CSV_PATH" --credentials "$BUNDLE_DIR/credentials.csv" > "$BUNDLE_DIR/records.tsv" \
  || die 'CSV validation failed. No schools were added.'
"$PYTHON_BIN" scripts/generate-school-cards.py --output "$BUNDLE_DIR/cards.pdf" "${FONT_OPTIONS[@]}" < "$BUNDLE_DIR/records.tsv" \
  || die 'Card generation failed. No schools were added.'

gum style --border rounded --padding '1 2' --foreground 212 \
  'Add portal schools' "Target: $SSH_USER@$SERVER_IP" "Database: $SCHOOL_IMPORT_DATABASE_PATH"
"$PYTHON_BIN" -c 'import csv, sys
with open(sys.argv[1], encoding="utf-8", newline="") as stream:
    rows = list(csv.DictReader(stream))
print(f"Ready to add {len(rows)} school(s):")
for row in rows:
    print("  {}: {}".format(row["username"], row["name"]))' "$BUNDLE_DIR/credentials.csv"
gum confirm --default=false 'Add these schools with randomly generated passwords?' || {
  gum log --level warn 'Cancelled. No schools were added.'
  exit 0
}

# Retain the generated credentials once SSH starts: a lost connection may follow
# a successful commit, and deleting them would strand the new accounts.
KEEP_BUNDLE=1
gum log --level info "Credential recovery directory: $BUNDLE_DIR"
if ! "${SSH[@]}" "$REMOTE_COMMAND" < "$BUNDLE_DIR/records.tsv"; then
  die "Import could not be confirmed. Credentials retained at $BUNDLE_DIR. Check the server before retrying; SSH may fail after commit. Existing usernames are rejected on retry."
fi
gum style --border double --padding '1 2' --foreground 10 \
  'Schools added successfully.' \
  "Credentials CSV: $BUNDLE_DIR/credentials.csv" \
  "Printable cards: $BUNDLE_DIR/cards.pdf" \
  'Keep these files private. Print cards on A4 at 100% / actual size.'
