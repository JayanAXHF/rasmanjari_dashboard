#!/usr/bin/env zsh
set -euo pipefail

# Replaces all production school accounts. Deleting schools also cascades to
# their submissions; uploaded files are intentionally left untouched.
REPO_DIR="${0:A:h:h}"
cd "$REPO_DIR"

: "${SERVER_IP:=161.118.168.235}"
: "${SSH_USER:=opc}"
: "${SSH_KEY:=/Users/jayansunil/Downloads/ssh-key-2026-08-25 (1).key}"
# DATABASE_PATH is also used by local development and must not select a remote DB.
: "${RESET_DATABASE_PATH:=/var/portal/data/app.db}"
: "${PYTHON_BIN:=python3}"
: "${SCHOOL_CARDS_DIR:=$REPO_DIR/private/school-cards}"

# Temporary PDFs and the published cards contain plaintext credentials.
umask 077
CARDS_TEMP_DIR=''
cleanup() {
  [[ -z "$CARDS_TEMP_DIR" ]] || rm -rf -- "$CARDS_TEMP_DIR"
  unset SCHOOL_RECORDS SCHOOL_PASSWORD SCHOOL_PASSWORD_CONFIRM
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' HUP TERM

typeset -a SSH
SSH=(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SSH_USER@$SERVER_IP")
typeset -a SCHOOL_RECORDS

die() { gum log --level error "$*"; exit 1; }

if ! command -v gum >/dev/null 2>&1; then
  print -u2 'gum is required. Install it with: brew install gum'
  exit 1
fi

[[ -r "$SSH_KEY" ]] || die "SSH key is not readable: $SSH_KEY"
command -v "$PYTHON_BIN" >/dev/null 2>&1 || die "Python is not available: $PYTHON_BIN"
"$PYTHON_BIN" scripts/generate-school-cards.py --check || die 'PDF dependency check failed. No database changes were made.'
mkdir -p -- "$SCHOOL_CARDS_DIR" || die 'Cannot create the school cards output directory.'
[[ -w "$SCHOOL_CARDS_DIR" ]] || die 'School cards output directory is not writable.'
typeset -a FONT_OPTIONS
FONT_OPTIONS=()
[[ -z "${SCHOOL_CARDS_FONT:-}" ]] || FONT_OPTIONS+=(--font "$SCHOOL_CARDS_FONT")
[[ -z "${SCHOOL_CARDS_BOLD_FONT:-}" ]] || FONT_OPTIONS+=(--bold-font "$SCHOOL_CARDS_BOLD_FONT")
[[ -z "${SCHOOL_CARDS_MONO_FONT:-}" ]] || FONT_OPTIONS+=(--mono-font "$SCHOOL_CARDS_MONO_FONT")

REMOTE_CHECK_NODE=$(cat <<'NODE'
import path from "node:path"
import Database from "better-sqlite3"

const databasePath = process.env.DATABASE_PATH
if (!databasePath || !path.isAbsolute(databasePath)) {
  throw new Error("RESET_DATABASE_PATH must be an absolute path on the server.")
}
let sqlite
try {
  sqlite = new Database(databasePath, { readonly: true, fileMustExist: true })
  for (const table of ["schools", "audit_logs"]) {
    if (!sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) {
      throw new Error(`Missing portal table: ${table}`)
    }
  }
  console.log(`School reset preflight: database verified at ${databasePath}`)
} catch (error) {
  console.error(`Cannot use production database at ${databasePath}: ${error.message}`)
  process.exitCode = 1
} finally {
  sqlite?.close()
}
NODE
)
"${SSH[@]}" "cd /opt/portal/current && sudo -u app env DATABASE_PATH=${(q)RESET_DATABASE_PATH} /usr/bin/node --input-type=module -e ${(q)REMOTE_CHECK_NODE}" \
  || die 'Production database check failed. No accounts were changed. Check RESET_DATABASE_PATH; it must refer to an existing database on the server.'

gum style --border rounded --padding '1 2' --margin '1 0' --foreground 212 \
  'Reset portal schools' \
  "Target: $SSH_USER@$SERVER_IP" \
  "Database on server: $RESET_DATABASE_PATH" \
  'This deletes every school and its database submission record.'

while true; do
  SCHOOL_CODE="$(gum input --header 'School code' --placeholder 'e.g. SCHOOL01')"
  SCHOOL_CODE="${SCHOOL_CODE:u}"
  [[ "$SCHOOL_CODE" =~ '^[A-Z0-9_-]{2,32}$' ]] || {
    gum log --level error 'School code must be 2–32 characters: A–Z, 0–9, _ or -.'
    continue
  }

  SCHOOL_NAME="$(gum input --header 'School name' --placeholder 'e.g. Rasmanjari High School')"
  [[ -n "${SCHOOL_NAME//[[:space:]]/}" ]] || {
    gum log --level error 'School name is required.'
    continue
  }

  SCHOOL_PASSWORD="$(gum input --password --header "Password for $SCHOOL_CODE" --placeholder 'At least 12 characters')"
  if (( ${#SCHOOL_PASSWORD} < 12 || ${#SCHOOL_PASSWORD} > 256 )); then
    gum log --level error 'Passwords must contain 12–256 characters.'
    continue
  fi

  SCHOOL_PASSWORD_CONFIRM="$(gum input --password --header "Confirm password for $SCHOOL_CODE")"
  if [[ "$SCHOOL_PASSWORD" != "$SCHOOL_PASSWORD_CONFIRM" ]]; then
    unset SCHOOL_PASSWORD SCHOOL_PASSWORD_CONFIRM
    gum log --level error 'Passwords do not match.'
    continue
  fi
  unset SCHOOL_PASSWORD_CONFIRM

  # Base64 keeps tabs and newlines out of the record protocol. The payload is
  # sent only through SSH standard input and is never put in a command line.
  SCHOOL_RECORDS+=("$(print -rn -- "$SCHOOL_CODE" | base64 | tr -d '\n')"$'\t'"$(print -rn -- "$SCHOOL_NAME" | base64 | tr -d '\n')"$'\t'"$(print -rn -- "$SCHOOL_PASSWORD" | base64 | tr -d '\n')")
  unset SCHOOL_PASSWORD

  gum confirm --default=true 'Add another school?' || break
done

(( ${#SCHOOL_RECORDS} > 0 )) || die 'Add at least one school.'

gum style --border rounded --padding '1 2' --margin '1 0' --foreground 214 \
  "Ready to replace all schools with ${#SCHOOL_RECORDS} account(s):" \
  "${(j:\n:)${SCHOOL_RECORDS%%$'\t'*}}"

gum confirm --default=false 'Delete every existing school and replace it with these accounts?' || {
  gum log --level warn 'Cancelled. No database changes were made.'
  exit 0
}

CARDS_TEMP_DIR="$(mktemp -d "$SCHOOL_CARDS_DIR/.school-cards.XXXXXXXX")" || die 'Cannot prepare the PDF output directory.'
CARDS_TEMP_PDF="$CARDS_TEMP_DIR/cards.pdf"
CARDS_FINAL_PDF="$SCHOOL_CARDS_DIR/school-cards-$(date +%Y%m%d-%H%M%S)-${CARDS_TEMP_DIR##*.}.pdf"
print -rl -- "${SCHOOL_RECORDS[@]}" | "$PYTHON_BIN" scripts/generate-school-cards.py \
  --output "$CARDS_TEMP_PDF" "${FONT_OPTIONS[@]}" || die 'PDF generation failed. No database changes were made.'

REMOTE_NODE=$(cat <<'NODE'
import crypto from "node:crypto"
import path from "node:path"
import argon2 from "argon2"
import Database from "better-sqlite3"

const databasePath = process.env.DATABASE_PATH
if (!databasePath || !path.isAbsolute(databasePath)) throw new Error("RESET_DATABASE_PATH must be an absolute path on the server.")

let input = ""
process.stdin.setEncoding("utf8")
for await (const chunk of process.stdin) input += chunk

const decode = (value) => Buffer.from(value, "base64").toString("utf8")
const records = input.trimEnd().split("\n").filter(Boolean).map((line) => {
  const [encodedCode, encodedName, encodedPassword, ...extra] = line.split("\t")
  if (!encodedCode || !encodedName || !encodedPassword || extra.length) throw new Error("Invalid school input.")
  const schoolCode = decode(encodedCode)
  const name = decode(encodedName)
  const password = decode(encodedPassword)
  if (!/^[A-Z0-9_-]{2,32}$/.test(schoolCode) || !name.trim() || password.length < 12) throw new Error(`Invalid credentials for ${schoolCode || "a school"}.`)
  return { schoolCode, name, password }
})

if (!records.length) throw new Error("At least one school is required.")
if (new Set(records.map(({ schoolCode }) => schoolCode)).size !== records.length) throw new Error("School codes must be unique.")

const prepared = await Promise.all(records.map(async ({ schoolCode, name, password }) => ({
  id: crypto.randomUUID(),
  schoolCode,
  name,
  passwordHash: await argon2.hash(password),
  createdAt: Date.now(),
})))

const sqlite = new Database(databasePath, { fileMustExist: true })
sqlite.pragma("foreign_keys = ON")
try {
  sqlite.transaction(() => {
    sqlite.prepare("DELETE FROM schools").run()
    const insertSchool = sqlite.prepare("INSERT INTO schools (id, school_code, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
    for (const school of prepared) insertSchool.run(school.id, school.schoolCode, school.name, school.passwordHash, school.createdAt)
    sqlite.prepare("INSERT INTO audit_logs (id, actor, action, target, at) VALUES (?, ?, ?, ?, ?)")
      .run(crypto.randomUUID(), "deployment", "schools_reset", `${prepared.length} schools`, Date.now())
  })()
} finally {
  sqlite.close()
}

console.log(`Replaced schools with: ${prepared.map(({ schoolCode }) => schoolCode).join(", ")}`)
NODE
)

if ! print -rl -- "${SCHOOL_RECORDS[@]}" | "${SSH[@]}" "cd /opt/portal/current && sudo -u app env DATABASE_PATH=${(q)RESET_DATABASE_PATH} /usr/bin/node --input-type=module -e ${(q)REMOTE_NODE}"; then
  die 'Remote reset could not be confirmed. Temporary cards were removed. Check the server before retrying: a lost connection can happen after the database commits.'
fi
unset SCHOOL_RECORDS

# Rename within the same filesystem only after the remote transaction succeeds.
# Keep the already generated PDF if publication fails; repeating the reset is unnecessary.
if ! mv -n -- "$CARDS_TEMP_PDF" "$CARDS_FINAL_PDF" || [[ -e "$CARDS_TEMP_PDF" ]]; then
  RECOVERY_PDF="$CARDS_TEMP_PDF"
  CARDS_TEMP_DIR=''
  die "Schools reset successfully, but PDF publication failed. Recover the PDF at $RECOVERY_PDF. Do not repeat the reset."
fi

gum style --border double --padding '1 2' --foreground 10 'Schools reset successfully.' \
  'Existing school sessions and database submission records have been removed.' \
  "Printable cards: $CARDS_FINAL_PDF" \
  'Print on A4 at 100% / actual size. Keep the PDF and printed cards private.'
