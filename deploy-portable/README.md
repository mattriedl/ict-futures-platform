# ICT Futures Platform — Portable Deployment Bundle

Self-contained artifacts to run this app on **any** server (a fresh VPS, a
laptop, or any Docker host) — independent of the Abacus.AI VM it currently runs
on. Two supported paths:

- **A. Docker Compose** (app + PostgreSQL 16, one command) — recommended.
- **B. Manual / bare-metal** (systemd + nginx) — for an existing VPS.

Everything the app needs is configured through environment variables — see
[`.env.example`](./.env.example) for the full, documented list.

> All commands below are run from the **project root** (the repository root), i.e.
> the directory that contains `package.json`.

---

## A. Docker Compose quickstart

Requirements: Docker Engine + the Compose plugin.

```bash
# 1. Create your env file and edit it (set NEXTAUTH_SECRET, DB password, etc.)
cp deploy-portable/.env.example .env
nano .env

# 2. Build and start (app + Postgres)
docker compose -f deploy-portable/docker-compose.yml up -d --build

# 3. Watch startup (migrations + optional seed run automatically)
docker compose -f deploy-portable/docker-compose.yml logs -f app
```

The app is then available on `http://localhost:${APP_PORT}` (default **3456**).

What happens on first boot:
- The `db` service starts PostgreSQL 16 with a persistent named volume.
- The `app` entrypoint runs `prisma migrate deploy` (creates all tables), then —
  if `RUN_SEED=true` — seeds the **37 instruments** (15 futures + 22 crypto),
  then launches `next start`.

Useful commands:
```bash
# Stop
docker compose -f deploy-portable/docker-compose.yml down
# Stop AND wipe the database volume (destructive)
docker compose -f deploy-portable/docker-compose.yml down -v
# Re-seed manually
docker compose -f deploy-portable/docker-compose.yml exec app \
  npx tsx --require dotenv/config scripts/safe-seed.ts
```

To use an **external managed Postgres** instead of the bundled one: set
`DATABASE_URL` in `.env` to your managed connection string. (The bundled `db`
service can be left running or removed from the compose file.)

---

## B. Manual / bare-metal (systemd + nginx)

Requirements: Node.js 22, PostgreSQL 14+, nginx.

```bash
# 1. Dependencies
npm ci --legacy-peer-deps      # or: npm install --legacy-peer-deps

# 2. Environment
cp deploy-portable/.env.example .env
nano .env                      # set DATABASE_URL to your Postgres, etc.

# 3. Database: generate client, create schema, (optional) seed
npx prisma generate
npx prisma migrate deploy
npx tsx --require dotenv/config scripts/safe-seed.ts   # optional: 37 instruments

# 4. Build (produces the .build/ dir — NOT .next)
npm run build

# 5. Run under systemd
#    Edit the placeholders in the template first:
#      __RUN_USER__   -> the OS user that owns the files (e.g. ubuntu)
#      __PROJECT_DIR__-> absolute path to this project root
#      __APP_PORT__   -> port to listen on (e.g. 3456)
sudo cp deploy-portable/ict-futures.service.template /etc/systemd/system/ict-futures.service
sudo nano /etc/systemd/system/ict-futures.service     # replace placeholders
sudo systemctl daemon-reload
sudo systemctl enable --now ict-futures
journalctl -u ict-futures -f

# 6. Reverse proxy (nginx)
#    Edit __SERVER_NAME__ and __APP_PORT__ in the template first.
sudo cp deploy-portable/nginx.conf.template /etc/nginx/sites-available/ict-futures.conf
sudo nano /etc/nginx/sites-available/ict-futures.conf
sudo ln -s /etc/nginx/sites-available/ict-futures.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 7. HTTPS (optional but recommended)
sudo certbot --nginx -d your-domain.com
```

> **Important:** this app's Next.js dist directory is `.build`, not the default
> `.next`. It is set via `NEXT_DIST_DIR=.build`, which is present in the
> `.env.example`, the systemd template, and the Docker image. Keep it — the
> build and `next start` both rely on it.

---

## Migrating from the Abacus.AI VM to your own server

The current live database is a hosted PostgreSQL instance. To move your existing
data (users, trades, journals, etc.) to the new server:

```bash
# 1. Dump the current database (get the source DATABASE_URL from the running .env)
pg_dump "postgresql://USER:PASS@OLD_HOST:5432/OLD_DB" \
  --no-owner --no-privileges -Fc -f ict_backup.dump

# 2. Restore into the new database
#    Docker Compose target (bundled db service, mapped port 5432):
pg_restore --no-owner --no-privileges -d \
  "postgresql://ict:PASSWORD@localhost:5432/ict_futures" ict_backup.dump
#    (Bare-metal: point at your own Postgres connection string.)
```

If you only want a fresh, empty install (no old data), skip the dump/restore —
`prisma migrate deploy` + the seed give you a clean, fully-working database.

### Environment variables to change when moving servers
| Variable | Why it changes |
|----------|----------------|
| `DATABASE_URL` | Points at the new database. |
| `NEXTAUTH_URL` | Must be the new public URL (e.g. `https://your-domain.com`). |
| `NEXTAUTH_SECRET` | Keep the SAME value to preserve existing sessions; or rotate to force re-login. |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | Set to your chosen AI provider (e.g. OpenAI). Blank disables AI explanations. |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` / `EMAIL_FROM` | Your own SMTP credentials for email. |
| `NEXT_PUBLIC_APPLLM_LIB_URL` | Leave **blank** off the Abacus platform. |

---

## Files in this bundle
| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage production image (honors `NEXT_DIST_DIR=.build`). |
| `docker-entrypoint.sh` | Runs `migrate deploy`, optional seed, then `next start`. |
| `docker-compose.yml` | App + PostgreSQL 16 stack. |
| `.env.example` | Every environment variable, documented, with safe placeholders. |
| `ict-futures.service.template` | systemd unit for bare-metal installs. |
| `nginx.conf.template` | nginx reverse-proxy vhost for bare-metal installs. |
| `README.md` | This file. |
