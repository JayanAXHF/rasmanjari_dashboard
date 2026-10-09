# Rasmanjari competition portal

## Local setup

1. Copy `.env.example` to `.env`, replace both session secrets, and set an Argon2 hash for the administrator password.
2. Set `DATABASE_PATH`, `UPLOAD_DIR`, and `PROMPT_DIR` to private persistent locations, then run `pnpm db:migrate`.
3. Add a local test school with `pnpm db:seed DEMO01 "Demo School" "a-strong-password"`.
4. Run `pnpm dev`.

In production, set `DATABASE_PATH=/var/portal/data/app.db`, `UPLOAD_DIR=/var/portal/data/uploads`, and `PROMPT_DIR=/var/portal/data/prompt` so all private data lives outside the deployment directory.

## Current implementation checkpoint

- SQLite schema and initial migration for schools, submissions, settings, and audit logs.
- Separate sealed school and admin sessions, Argon2 password verification, per-IP/credential login rate limiting, and protected routes.
- School login, dashboard, timed prompt route, final PNG upload with progress, magic-byte/decode/pixel validation, SHA-256, original and thumbnail storage, and an atomic one-submission database constraint.

The organiser still needs to provide the final guidelines copy and configure the submission window and prompt through the forthcoming admin settings page.
