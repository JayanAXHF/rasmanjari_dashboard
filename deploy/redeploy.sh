#!/usr/bin/env zsh
set -euo pipefail

# Redeploys a new standalone build without changing the VM's existing secrets.
REPO_DIR="${0:A:h:h}"
cd "$REPO_DIR"

: "${SERVER_IP:=161.118.168.235}"
: "${SSH_USER:=opc}"
: "${SSH_KEY:=/Users/jayansunil/Downloads/ssh-key-2026-08-25 (1).key}"
: "${LOCAL_DATABASE_PATH:=$REPO_DIR/data/app.db}"
: "${LOCAL_UPLOAD_DIR:=$REPO_DIR/data/uploads}"
: "${LOCAL_PROMPT_DIR:=$REPO_DIR/data/prompt}"
: "${PUBLIC_BASE_URL:=http://$SERVER_IP}"

typeset -a SSH
SSH=(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SSH_USER@$SERVER_IP")

die() { gum log --level error "$*"; exit 1; }

run_local() {
  local title="$1"
  shift
  gum spin --spinner dot --show-output --title "$title" -- "$@" || die "$title failed; deployment was not activated."
}

run_remote() {
  local title="$1"
  gum log --level info "$title"
  "${SSH[@]}" 'bash -s' || die "$title failed; deployment was not activated."
}

if ! command -v gum >/dev/null 2>&1; then
  print -u2 'gum is required. Install it with: brew install gum'
  exit 1
fi

command -v pnpm >/dev/null 2>&1 || die 'pnpm is required locally.'
command -v rsync >/dev/null 2>&1 || die 'rsync is required locally.'
[[ -r "$SSH_KEY" ]] || die "SSH key is not readable: $SSH_KEY"
[[ -f package.json && -f pnpm-lock.yaml ]] || die 'Run this script from the project checkout.'
[[ -f "$LOCAL_DATABASE_PATH" ]] || die "Local DATABASE_PATH does not exist: $LOCAL_DATABASE_PATH"

export DATABASE_PATH="$LOCAL_DATABASE_PATH"
export UPLOAD_DIR="$LOCAL_UPLOAD_DIR"
export PROMPT_DIR="$LOCAL_PROMPT_DIR"

gum style --border rounded --padding '1 2' --margin '1 0' --foreground 212 \
  'Rasmanjari portal redeploy' \
  "Target: $SSH_USER@$SERVER_IP" \
  'Build: webpack standalone; VM data and secrets remain in place'

gum confirm --default=false 'Build, migrate, switch, and restart the production release?' || {
  gum log --level warn 'Cancelled.'
  exit 0
}

run_local 'Installing locked local dependencies' pnpm install --frozen-lockfile
run_local 'Linting' pnpm run lint
run_local 'Building standalone release with webpack' pnpm exec next build --webpack
[[ -f .next/standalone/server.js ]] || die 'Standalone server.js was not produced.'

gum log --level info 'Checking the existing server deployment'
"${SSH[@]}" 'sudo test -r /etc/portal.env && sudo test -x "$(sudo npm prefix -g)/bin/pm2" && test -d /opt/portal/releases' \
  || die 'The VM is missing its existing portal setup; use the initial deployment process.'

HAS_BACKUP=0
if "${SSH[@]}" 'test -x /opt/portal/backup.sh'; then
  HAS_BACKUP=1
else
  gum log --level warn 'No /opt/portal/backup.sh found; continuing without an automated pre-deploy backup.'
fi

if (( HAS_BACKUP )) && gum confirm --default=true 'Create a backup before applying migrations?'; then
  run_remote 'Creating pre-deploy backup' <<'REMOTE'
set -euo pipefail
test -x /opt/portal/backup.sh
sudo -u app /opt/portal/backup.sh
REMOTE
fi

REL="$(date +%Y%m%d-%H%M%S)"
gum style --foreground 212 "Preparing release $REL"

RSYNC_SSH="ssh -i '$SSH_KEY' -o StrictHostKeyChecking=accept-new"
run_local 'Uploading standalone release' rsync -az --delete --exclude='.env' -e "$RSYNC_SSH" .next/standalone/ "$SSH_USER@$SERVER_IP:/tmp/portal-$REL/"
run_local 'Uploading static assets' rsync -az -e "$RSYNC_SSH" .next/static/ "$SSH_USER@$SERVER_IP:/tmp/portal-$REL/.next/static/"
run_local 'Uploading public assets' rsync -az -e "$RSYNC_SSH" public/ "$SSH_USER@$SERVER_IP:/tmp/portal-$REL/public/"
run_local 'Uploading migrations and deployment metadata' rsync -az -e "$RSYNC_SSH" drizzle scripts package.json pnpm-lock.yaml "$SSH_USER@$SERVER_IP:/tmp/portal-$REL/"

run_remote 'Installing native dependencies, migrating, switching release, and restarting PM2' <<REMOTE
set -euo pipefail
REL='$REL'
RELEASE="/opt/portal/releases/\$REL"
test -d "/tmp/portal-\$REL"
test ! -e "\$RELEASE"
sudo mv "/tmp/portal-\$REL" "\$RELEASE"
sudo chown -R app:app "\$RELEASE"

sudo npm install -g pnpm@10.4.1
PNPM_BIN="\$(sudo npm prefix -g)/bin/pnpm"
test -x "\$PNPM_BIN"
cd "\$RELEASE"
sudo -u app env HOME=/home/app "\$PNPM_BIN" install --prod --frozen-lockfile --force
sudo -u app env HOME=/home/app "\$PNPM_BIN" rebuild sharp argon2 better-sqlite3
sudo -u app node -e "require('sharp'); require('argon2'); require('better-sqlite3'); console.log('native ok')"

sudo -u app env DATABASE_PATH=/var/portal/data/app.db UPLOAD_DIR=/var/portal/data/uploads PROMPT_DIR=/var/portal/data/prompt node scripts/migrate.mjs
printf '%s\n' "\$(readlink -f /opt/portal/current 2>/dev/null || true)" > "/tmp/portal-previous-\$REL"
sudo ln -sfn "\$RELEASE" /opt/portal/current

PM2_BIN="\$(sudo npm prefix -g)/bin/pm2"
sudo -u app env HOME=/home/app PM2_HOME=/home/app/.pm2 /bin/sh -c "cd /home/app && \"\$PM2_BIN\" restart /opt/portal/ecosystem.config.cjs --update-env"
sudo -u app env HOME=/home/app PM2_HOME=/home/app/.pm2 /bin/sh -c "cd /home/app && \"\$PM2_BIN\" save"
for attempt in {1..30}; do
  if curl -fsS http://127.0.0.1:3000/api/health; then
    exit 0
  fi
  sleep 1
done
echo 'Portal did not become healthy within 30 seconds.' >&2
exit 1
REMOTE

gum log --level info 'Verifying PM2 and reverse proxy'
"${SSH[@]}" 'bash -s' <<'REMOTE' || die 'Post-deploy verification failed. The new release remains active; use the rollback instructions before retrying.'
set -euo pipefail
PM2_BIN="$(sudo npm prefix -g)/bin/pm2"
sudo -u app env HOME=/home/app PM2_HOME=/home/app/.pm2 /bin/sh -c "cd /home/app && \"$PM2_BIN\" status portal"
curl -fsS http://127.0.0.1:3000/api/health
if sudo systemctl is-active --quiet caddy; then
  sudo systemctl is-active caddy
else
  echo 'warning: caddy is not active; internal health passed but public traffic is unavailable' >&2
fi
REMOTE

PUBLIC_BASE_URL="$(gum input --value "$PUBLIC_BASE_URL" --placeholder 'https://portal.example.org or http://server-ip' --header 'Public URL to verify')"
if [[ -n "$PUBLIC_BASE_URL" ]]; then
  run_local 'Verifying public health endpoint' curl --fail --silent --show-error --location --max-time 20 "$PUBLIC_BASE_URL/api/health"
fi

if gum confirm --default=true 'Keep only the newest three releases?'; then
  run_remote 'Pruning releases older than the newest three' <<'REMOTE'
set -euo pipefail
mapfile -t old_releases < <(find /opt/portal/releases -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r | tail -n +4)
for release in "${old_releases[@]}"; do
  sudo rm -rf -- "/opt/portal/releases/$release"
done
REMOTE
fi

mkdir -p deploy
{
  print -- "## $(date '+%Y-%m-%d %H:%M:%S %Z') — release $REL"
  print -- '- Verified locally: pnpm install --frozen-lockfile, pnpm run lint, pnpm exec next build --webpack.'
  print -- '- Server changes: uploaded standalone/static/public/migrations; rebuilt Linux native dependencies; migrated database; switched /opt/portal/current; restarted and saved PM2.'
  print -- "- Verification: native modules, migration, local health, PM2 status, and public health endpoint ($PUBLIC_BASE_URL)."
  print
} >> deploy/CHANGELOG.md

gum style --border double --padding '1 2' --foreground 10 "Release $REL is live." "Health: $PUBLIC_BASE_URL/api/health"
