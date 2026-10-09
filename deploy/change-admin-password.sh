#!/usr/bin/env zsh
set -euo pipefail

: "${SERVER_IP:=161.118.168.235}"
: "${SSH_USER:=opc}"
: "${SSH_KEY:=/Users/jayansunil/Downloads/ssh-key-2026-08-25 (1).key}"

if [[ ! -r "$SSH_KEY" ]]; then
  print -u2 "SSH key is not readable: $SSH_KEY"
  exit 1
fi

read -r -s "ADMIN_PASSWORD?New admin password (at least 16 characters): "
print
if (( ${#ADMIN_PASSWORD} < 16 )); then
  print -u2 "Password must be at least 16 characters."
  exit 1
fi

read -r -s "ADMIN_PASSWORD_CONFIRM?Confirm new admin password: "
print
if [[ "$ADMIN_PASSWORD" != "$ADMIN_PASSWORD_CONFIRM" ]]; then
  print -u2 "Passwords do not match."
  exit 1
fi
unset ADMIN_PASSWORD_CONFIRM

REMOTE_NODE=$(cat <<'NODE'
import fs from "node:fs"
import argon2 from "argon2"

const password = await new Promise((resolve, reject) => {
  let value = ""
  process.stdin.setEncoding("utf8")
  process.stdin.on("data", (chunk) => { value += chunk })
  process.stdin.on("end", () => resolve(value))
  process.stdin.on("error", reject)
})

if (password.length < 16) throw new Error("Password must be at least 16 characters.")

const environmentPath = "/etc/portal.env"
const original = fs.readFileSync(environmentPath, "utf8")
const hash = await argon2.hash(password)
const updated = [
  ...original.split(/\r?\n/).filter((line) => !line.startsWith("ADMIN_PASSWORD_HASH=")),
  `ADMIN_PASSWORD_HASH=${hash}`,
].filter(Boolean).join("\n") + "\n"

const metadata = fs.statSync(environmentPath)
const temporaryPath = `${environmentPath}.${process.pid}.tmp`
fs.writeFileSync(temporaryPath, updated, { mode: metadata.mode })
fs.chownSync(temporaryPath, metadata.uid, metadata.gid)
fs.renameSync(temporaryPath, environmentPath)
console.log("Admin password updated.")
NODE
)

print -rn -- "$ADMIN_PASSWORD" | ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SSH_USER@$SERVER_IP" "cd /opt/portal/current && sudo /usr/bin/node --input-type=module -e ${(q)REMOTE_NODE}"
unset ADMIN_PASSWORD

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SSH_USER@$SERVER_IP" 'bash -s' <<'REMOTE'
set -euo pipefail
PM2_BIN="$(sudo npm prefix -g)/bin/pm2"
sudo -u app env HOME=/home/app PM2_HOME=/home/app/.pm2 /bin/sh -c "cd /home/app && \"$PM2_BIN\" restart portal"
sudo -u app env HOME=/home/app PM2_HOME=/home/app/.pm2 /bin/sh -c "cd /home/app && \"$PM2_BIN\" status portal"
curl -fsS http://127.0.0.1:3000/api/health
REMOTE
