# Deployment change log

## 2026-10-14 — Public HTTPS for the server IP

- Caddy 2.11.7 obtained a publicly trusted Let's Encrypt certificate for `161.118.168.235` through HTTP-01 using the `shortlived` profile; Caddy handles renewal without Certbot. Initial certificate expiry: 2026-10-21 01:40:06 UTC.
- Enabled HTTPS in the runtime and permanent firewalld configuration. Public HTTPS is reachable; no Oracle network-rule changes were required.
- Installed the configuration recorded in `deploy/Caddyfile.ip-https`: HTTP redirects to HTTPS with 308; upstream stays at `127.0.0.1:3000`, with compression and the existing 60 MB body limit retained.
- Set `SESSION_COOKIE_SECURE=true`, reloaded the existing PM2 ecosystem configuration, and saved the process list. No application release or database migration was performed.
- Verified trusted public TLS, IP SAN, health 200, path/query-preserving HTTP redirect, login camera policy, invalid login 401, and logout 303 with Secure/HttpOnly cookie expiry. Caddy is active, enabled at boot, and has writable persistent certificate storage.
- Rollback backups: `/etc/caddy/Caddyfile.before-ip-https-20261014T103829Z` and `/etc/portal.env.before-ip-https-20261014T103941Z`. Deployment checks now default to HTTPS.

## 2026-10-10 — Logout redirect correction

- Live logout cleared the session cookie but redirected to `http://localhost:3000/...`. Changed the response to use a relative `Location` with status 303 and `Cache-Control: no-store`.
- Activated release `20261010-154312-logout`, including the requested JetBrains Mono headings and IBM Plex Sans body text. Previous release `20261010-154028` retained.
- Commands: repeated the rsync/release installation/native-rebuild/symlink-switch/PM2 restart-and-save commands recorded under the IST deployment below, with `REL=20261010-154312-logout`. No migrations or configuration changes were required.
- Production build, lint (existing warnings only), native-module checks, and health passed.
- Verified both admin and school logout through the public Caddy proxy using temporary sessions: protected page 200 before logout; logout 303 to the correct relative login path; selected cookie expired at `/`; login page 200; protected page without cookie redirects to login (307). No real user sessions or credentials were used.

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

## 2026-10-10 15:37:03 IST — release 20261010-153449
- Verified locally: pnpm install --frozen-lockfile, pnpm run lint, pnpm exec next build --webpack.
- Server changes: uploaded standalone/static/public/migrations; rebuilt Linux native dependencies; migrated database; switched /opt/portal/current; restarted and saved PM2.
- Verification: native modules, migration, local health, PM2 status, and public health endpoint (http://161.118.168.235).

## 2026-10-10 15:41:42 IST — release 20261010-154028
- Verified locally: pnpm install --frozen-lockfile, pnpm run lint, pnpm exec next build --webpack.
- Server changes: uploaded standalone/static/public/migrations; rebuilt Linux native dependencies; migrated database; switched /opt/portal/current; restarted and saved PM2.
- Verification: native modules, migration, local health, PM2 status, and public health endpoint (http://161.118.168.235).

## 2026-10-10 15:51:21 IST — release 20261010-154939
- Verified locally: pnpm install --frozen-lockfile, pnpm run lint, pnpm exec next build --webpack.
- Server changes: uploaded standalone/static/public/migrations; rebuilt Linux native dependencies; migrated database; switched /opt/portal/current; restarted and saved PM2.
- Verification: native modules, migration, local health, PM2 status, and public health endpoint (http://161.118.168.235).

## 2026-10-10 16:21:11 IST — release 20261010-161855
- Verified locally: pnpm install --frozen-lockfile, pnpm run lint, pnpm exec next build --webpack.
- Server changes: uploaded standalone/static/public/migrations; rebuilt Linux native dependencies; migrated database; switched /opt/portal/current; restarted and saved PM2.
- Verification: native modules, migration, local health, PM2 status, and public health endpoint (http://161.118.168.235).

## 2026-10-10 18:10:08 IST — release 20261010-180403
- Verified locally: pnpm install --frozen-lockfile, pnpm run lint, pnpm exec next build --webpack.
- Server changes: uploaded standalone/static/public/migrations; rebuilt Linux native dependencies; migrated database; switched /opt/portal/current; restarted and saved PM2.
- Verification: native modules, migration, local health, PM2 status, and public health endpoint (http://161.118.168.235).

## 2026-10-14 15:59:56 IST — release 20261014-155748
- Verified locally: pnpm install --frozen-lockfile, pnpm run lint, pnpm exec next build --webpack.
- Server changes: uploaded standalone/static/public/migrations; rebuilt Linux native dependencies; migrated database; switched /opt/portal/current; restarted and saved PM2.
- Verification: native modules, migration, local health, PM2 status, and public health endpoint (http://161.118.168.235).

