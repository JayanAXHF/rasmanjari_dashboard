# Rasmanjari competition portal

## Local setup

1. Copy `.env.example` to `.env`, replace all three session secrets, and set an Argon2 hash for the administrator password.
2. Set `DATABASE_PATH`, `UPLOAD_DIR`, and `PROMPT_DIR` to private persistent locations, then run `pnpm db:migrate`.
3. Add a local test school with `pnpm db:seed DEMO01 "Demo School" "a-strong-password"`.
4. Run `pnpm dev`.

In production, set `DATABASE_PATH=/var/portal/data/app.db`, `UPLOAD_DIR=/var/portal/data/uploads`, and `PROMPT_DIR=/var/portal/data/prompt` so all private data lives outside the deployment directory.

## Add schools from a spreadsheet

Export a UTF-8 CSV with two columns, `name` and `username`, using [scripts/schools.example.csv](scripts/schools.example.csv) as a template:

```csv
name,username
Example High School,SCHOOL01
"Example School, North Campus",SCHOOL02
```

Run the upload script with the same PDF dependencies, `gum`, and SSH configuration used by the reset script below:

```sh
PYTHON_BIN="$PWD/.venv-school-cards/bin/python" ./deploy/upload-schools.sh /path/to/schools.csv
```

Omit the CSV path to open a file picker. The script shows the schools for confirmation, adds them to production, and generates a cryptographically random 20-character password for each. Usernames become uppercase school codes and must contain 2–32 characters (`A–Z`, `0–9`, `_`, `-`). Blank rows are ignored; quote names containing commas. Duplicate usernames in the CSV or existing database reject the entire import. Existing schools, passwords, sessions, submissions, and scores are preserved. All inserts and the audit entry commit in one transaction.

Each run saves an owner-only `credentials.csv` and printable `cards.pdf` under `private/school-cards/school-import-<timestamp>-<unique-suffix>/`. Credentials travel to the server over SSH stdin; the database stores Argon2 hashes. Cards are generated before adding schools. Cancellation or preparation failure removes the generated files. Once the upload starts, credentials are retained even on SSH failure, because the server may already have committed; check the school list before retrying. Keep the CSV and PDF private.

`SERVER_IP`, `SSH_USER`, `SSH_KEY`, `PYTHON_BIN`, `SCHOOL_CARDS_DIR`, and font overrides are shared with the reset script. To select a different existing remote database, set `SCHOOL_IMPORT_DATABASE_PATH` (default `/var/portal/data/app.db`). Local `DATABASE_PATH` is ignored, and a missing remote database is never created. The importer runs from `/opt/portal/current` using the release's installed dependencies; no application redeployment is required.

Verify with `node --test scripts/school-import.test.mjs` and `zsh -n deploy/upload-schools.sh`. Tests use synthetic credentials, temporary databases, and mocked SSH; they do not contact production.

## Reset schools and print login cards

`deploy/reset-schools.sh` replaces production school accounts and deletes their database submission records after confirmation. It also generates a local A4 PDF containing six monochrome cards per page, with each school's name, login ID (school code), password, and a QR containing copyable plain text credentials. Copying requires a QR scanner that supports text; scanning does not automatically copy to the clipboard.

Install the local PDF dependencies once:

```sh
python3 -m venv .venv-school-cards
.venv-school-cards/bin/python -m pip install -r scripts/requirements-school-cards.txt
PYTHON_BIN="$PWD/.venv-school-cards/bin/python" ./deploy/reset-schools.sh
```

The script also requires `zsh`, `gum`, and the configured SSH key. Existing `SERVER_IP`, `SSH_USER`, and `SSH_KEY` overrides still apply. The remote database defaults to `/var/portal/data/app.db`; use `RESET_DATABASE_PATH` for a different absolute path **on the server**. The reset script ignores the local development `DATABASE_PATH`. Before asking for credentials, it opens the existing remote database read-only and checks the portal tables. It never creates a missing database. PDFs default to `private/school-cards/school-cards-<timestamp>-<unique-suffix>.pdf`; override `SCHOOL_CARDS_DIR` to choose another local output directory. Print on A4 at **100% / actual size**, then cut along the guides.

PDF generation and credential validation finish before the remote reset starts. Duplicate IDs, missing dependencies, unsupported font characters, or text that cannot fit legibly abort before any database change. PDFs use owner-only permissions and contain plaintext passwords; keep them private. The default output directory is ignored by Git. Temporary PDFs are removed on cancellation or remote failure. If SSH fails, check the server before retrying because its transaction may already have committed. If the reset succeeds but PDF publication fails, the script reports a recovery path and asks you not to repeat the reset.

The embedded default fonts support Latin and some additional characters. For other characters, set `SCHOOL_CARDS_FONT`, `SCHOOL_CARDS_BOLD_FONT`, and `SCHOOL_CARDS_MONO_FONT` to readable TrueType fonts with the required glyphs. Names and passwords are never silently truncated or replaced. Overly long names, unsupported control characters, and QR payloads too dense for printing are rejected.

For generator-only use, pipe base64 TSV records (school code, name, password) to `.venv-school-cards/bin/python scripts/generate-school-cards.py --output /path/to/new.pdf`. Pass credentials through stdin, not command-line arguments. Existing PDFs are never overwritten.

Generator and reset-flow tests use synthetic credentials and mocked SSH. Install Poppler (`brew install poppler` on macOS) for PDF rasterization, then run:

```sh
.venv-school-cards/bin/python -m pip install -r scripts/requirements-school-cards-test.txt
.venv-school-cards/bin/python scripts/school-cards.test.py
zsh -n deploy/reset-schools.sh
```

The tests decode QR codes from rendered PDF pages, check pagination and credential text, and verify cancellation, generation failure, remote failure, and PDF recovery after publication failure. The bundled monospace font is Bitstream Vera from the GNOME distribution; its license is in `scripts/fonts/LICENSE-bitstream-vera.txt`. Regular and bold Vera fonts are supplied by ReportLab.

## Production HTTPS without a domain

The portal is available at `https://161.118.168.235`; HTTP redirects to HTTPS with status 308. Caddy 2.11.7 manages a publicly trusted Let's Encrypt certificate for the IP address using the `shortlived` ACME profile. No Certbot installation, cron job, or manually installed client certificate is required. Caddy is enabled at boot and automatically renews the certificate using its persistent storage under `/var/lib/caddy/.local/share/caddy`. Keep public TCP ports 80 (HTTP-01 validation) and 443 (HTTPS) reachable, and do not remove this storage when redeploying.

The installed configuration is recorded in `deploy/Caddyfile.ip-https`. `/etc/portal.env` now sets `SESSION_COOKIE_SECURE=true`; the portal was reloaded through its PM2 ecosystem configuration and the process list saved. `deploy/redeploy.sh` defaults its public verification URL to HTTPS. The initial certificate expires on 2026-10-21 at 01:40:06 UTC; subsequent expiry dates will change after automatic renewal.

Verification on 2026-10-14 confirmed public TLS trust and the certificate's IP SAN, HTTPS health 200, HTTP-to-HTTPS redirect 308 preserving the path/query, `/login` camera permissions, invalid login 401, and logout 303 with a Secure/HttpOnly cookie expiry. Original server files are backed up at `/etc/caddy/Caddyfile.before-ip-https-20261014T103829Z` and `/etc/portal.env.before-ip-https-20261014T103941Z`. Restoring both files and reloading Caddy and the portal returns the original HTTP configuration; update the deployment verification URL accordingly if rolling back.

## School QR sign-in

On `/login`, select **Scan school QR code**, then **Start camera** or **Choose image**. Laptop webcams and phone cameras are supported; phones prefer the rear camera and a selector appears when multiple cameras are available. A valid school card signs in automatically. Cancel to return to manual sign-in. Existing cards from `scripts/generate-school-cards.py` work without reprinting.

Camera access requires HTTPS (localhost also works for development). Testing from a phone against an HTTP LAN address will not enable the camera. Allow camera access in browser settings if permission was denied; close other camera apps if the device is busy. PNG, JPEG, and WebP photos/screenshots up to 10 MB provide a fallback without camera permission. Include one card per image; for PDFs, take a screenshot of the desired card. Images and camera frames are decoded locally; only credentials are sent to the existing school login endpoint. Failed sign-in attempts require an explicit retry and use the same rate limits as manual sign-in.

Redeploy the application after adding this feature so `/login` receives the camera permission header. Verify `Permissions-Policy: camera=(self), geolocation=(), microphone=()` on `/login`; other pages retain `camera=()`. No database migration or new environment variables are needed. Do not configure the reverse proxy to add another restrictive camera policy.

Parser and Chromium integration checks use synthetic credentials and temporary databases:

```sh
node --test scripts/school-qr.test.mjs
pnpm exec playwright install chromium
# Build with DATABASE_PATH pointing to a migrated local/test database first.
pnpm exec next build --webpack
PYTHON_BIN="$PWD/.venv-school-cards/bin/python" node --test scripts/school-qr.integration.test.mjs
```

The integration checks require the school-card Python dependencies and Poppler's `pdftoppm`. They render an actual generated card, check image login and session creation, manual login, headers, permission denial, retries, video decoding, and cancellation during camera startup. Browser automation uses a synthetic video stream; verify physical webcams in desktop Chrome, Edge, Firefox, and Safari, and rear cameras in Android Chrome and iOS Safari over HTTPS before release.

## Current implementation checkpoint

- SQLite schema and initial migration for schools, submissions, settings, and audit logs.
- Separate sealed school and admin sessions, Argon2 password verification, per-IP/credential login rate limiting, and protected routes.
- School login, dashboard, timed prompt route, final PNG upload with progress, magic-byte/decode/pixel validation, SHA-256, original and thumbnail storage, and an atomic one-submission database constraint.

## Judging

Run `pnpm db:migrate` with `DATABASE_PATH` exported to apply the additive judging migration. Back up an existing database first. Set `JUDGE_SESSION_PASSWORD` to an independent random secret of at least 32 characters in your local environment and in `/etc/portal.env` on the production server, then restart the application. Existing school and admin routes work before judge access is configured.

In **Admin → Competition settings → Judge access**, set the shared judge password (8–256 characters). Give judges the `/judge/login` URL. Changing the password invalidates all existing judge sessions without deleting marks.

Judges see all submitted images and usernames (`schoolCode`), including flagged entries. Names, original filenames, and embedded image metadata are excluded from judge responses. Text drawn into the artwork remains visible. Each criterion accepts 0–5 with up to two decimal places, autosaves after 500 ms or on blur, and can be cleared or revised. All judges share one scorecard per submission; the latest saved edit to a criterion wins. Judges should coordinate when working on the same team. Wait for **Saved** before leaving the page; failed saves keep the input and offer **Retry**.

**Admin → Judging leaderboard** shows completed scorecards ranked by total out of 20, with shared ranks for ties. Partial scorecards and schools without submissions remain unranked. Both the leaderboard and submission review table refresh marks every three seconds while visible. Submission resets and school deletion also remove their marks.

Verification commands:

```sh
node --test scripts/scoring.test.mjs scripts/competition-time.test.mjs
pnpm lint
pnpm typecheck
pnpm exec next build --webpack
node --test scripts/judging.integration.test.mjs
```

The integration test requires a completed production build and uses a temporary database, synthetic accounts, and a local server. It does not migrate or modify the configured application database. Browser checks use an isolated Chrome profile when Google Chrome is installed on macOS; on other systems, set `JUDGING_BROWSER` to a Chrome executable to enable them. Otherwise the browser scenario is reported as skipped. Production deployment remains a separate step; configure the judge session secret before enabling judge access.
