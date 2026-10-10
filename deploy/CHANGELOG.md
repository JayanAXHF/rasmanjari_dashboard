# Deployment change log

## 2026-10-10 — Competition schedule uses IST

- Parse admin `datetime-local` inputs with explicit `+05:30`, validate dates, and keep database timestamps as UTC instants.
- Display admin input values, saved schedules, school schedules, and school submission timestamps in IST regardless of server timezone.
- Share prompt visibility checks between the school dashboard and `/api/prompt`.
- Existing schedule values are not automatically shifted; the administrator must re-enter the intended IST competition window.
- Verification: date parsing/display and prompt opening-boundary tests pass under UTC and America/New_York; production build passes; lint has seven existing warnings and no errors.
- Activated release `20261010-152709-ist`; retained previous release `20261009-202030`. Native modules and application health passed. Live public admin settings and school dashboard return 200 and display IST; `/api/prompt` correctly remains 404 until the existing saved opening time (20:45 IST).
- Remote deployment commands (release identifier recorded after verification):

```bash
rsync -az --exclude='.env*' -e "$RSYNC_SSH" .next/standalone/ "opc@161.118.168.235:/tmp/portal-$REL/"
rsync -az -e "$RSYNC_SSH" .next/static/ "opc@161.118.168.235:/tmp/portal-$REL/.next/static/"
rsync -az -e "$RSYNC_SSH" public/ "opc@161.118.168.235:/tmp/portal-$REL/public/"
rsync -az -e "$RSYNC_SSH" drizzle scripts package.json pnpm-lock.yaml "opc@161.118.168.235:/tmp/portal-$REL/"
R="/opt/portal/releases/$REL"
sudo mv "/tmp/portal-$REL" "$R"
sudo chown -R app:app "$R"
cd "$R"
P="$(sudo npm prefix -g)/bin/pnpm"
sudo -u app env HOME=/home/app "$P" install --prod --frozen-lockfile --force
sudo -u app env HOME=/home/app "$P" rebuild sharp argon2 better-sqlite3
sudo ln -sfn "$R" /opt/portal/current
M="$(sudo npm prefix -g)/bin/pm2"
sudo -u app env HOME=/home/app PM2_HOME=/home/app/.pm2 /bin/sh -c "cd /home/app && \"$M\" restart /opt/portal/ecosystem.config.cjs --update-env && \"$M\" save"
```

## 2026-10-09 — Restore admin-login runtime configuration

- Removed the mistakenly deployed `/opt/portal/releases/20261009-192634/.env` file. It was an application build artifact that could override or capture local credentials; production configuration belongs only in `/etc/portal.env`.
- Recreated the `portal` PM2 process from `/opt/portal/ecosystem.config.cjs` and saved the PM2 process list, clearing stale environment variables from the previous process.
- Verified `GET http://127.0.0.1:3000/api/health` returns `{"ok":true}` and the admin login endpoint returns HTTP `401` for a deliberately invalid password (instead of HTTP `500`).
- Updated `deploy/redeploy.sh` to exclude `.env` from standalone uploads so future releases cannot repeat this condition.

## 2026-10-09 — Permit temporary HTTP-only session cookies

- Added the explicit `SESSION_COOKIE_SECURE` configuration switch. It defaults to secure cookies in production; the VM will use `false` only while it is accessed over plain HTTP by IP address.
- This setting must be changed back to `true` before serving the portal over HTTPS.
- Deployed release `20261009-195454`: installed Linux dependencies, rebuilt `sharp`, `argon2`, and `better-sqlite3`, ran migrations, switched `/opt/portal/current`, and recreated/saved the PM2 process.
- Verified local and public health responses are `{"ok":true}`, PM2 is online, and a deliberately invalid admin password returns HTTP `401`.

