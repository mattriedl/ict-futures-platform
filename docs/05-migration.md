# 05 — Migration & New-Server Setup

This guide covers moving the application to a new server or standing it up fresh. The app is intentionally **portable**: database, external APIs, LLM, email, and the scheduler are all configured through environment variables and in-repo deploy files. There are no hardcoded hostnames or secrets in application code.

> This supersedes the older `SERVER_DEPLOYMENT.md` at the repo root (kept for history). Where they differ, follow this document.

---

## 1. What you need on the target server

- **Node.js 20+** and a package manager (the project uses `yarn`/`npm`).
- **PostgreSQL 14+** (local, managed, or containerized).
- Outbound HTTPS to: your market-data sources (Yahoo Finance, Coinbase/Kraken/OKX), your LLM provider, and Gmail SMTP (if email alerts are on).
- A reverse proxy (nginx) for TLS in production (optional but recommended).
- Either **systemd** (bare-metal/VPS) or **Docker** (containerized) to run the app.

---

## 2. Pre-migration checklist (on the OLD server)

1. **Back up the database** (see `docs/07-database.md`):
   ```bash
   pg_dump "$DATABASE_URL" > ict_backup_$(date +%F).sql
   ```
2. **Copy your `.env`** (contains all secrets — transfer securely, never via git).
3. Note any **platform Scheduled Task** config (the Abacus "ICT Autotrader" task does not migrate automatically — you recreate it as cron/systemd; see `docs/04`).
4. Confirm the current git `main` is pushed and clean — `main` is the production source of truth.

---

## 3. Option A — Bare-metal / VPS with systemd

```bash
# 1. Get the code
git clone https://github.com/mattriedl/ict-futures-platform.git
cd ict-futures-platform                # the app is at the repo root

# 2. Install dependencies
npm ci         # .npmrc sets legacy-peer-deps

# 3. Configure environment
cp .env.example .env
#   edit .env: DATABASE_URL, NEXTAUTH_URL, NEXTAUTH_SECRET, LLM_*, AUTOTRADE_SECRET,
#   GMAIL_* (if using email), APP_PORT, and NEXT_DIST_DIR=.build  (see note in §6)

# 4. Create the database schema
npx prisma migrate deploy      # apply migrations to a fresh DB
#   (or: npx prisma db push  for a schema-only sync)
npm run seed                   # optional: seed instruments / default data

# 5. Build and start
yarn build                     # respects NEXT_DIST_DIR=.build
yarn start                     # or run under systemd (below)
```

### systemd service
Use the template in `deploy-portable/ict-futures.service.template` (env-driven). Install it:
```bash
sudo cp deploy-portable/ict-futures.service.template /etc/systemd/system/ict-futures.service
#   edit paths/user/EnvironmentFile inside the unit to match your server
sudo systemctl daemon-reload
sudo systemctl enable --now ict-futures
sudo systemctl status ict-futures
```

### Reverse proxy (nginx)
Use `deploy-portable/nginx.conf.template` as a starting point; point it at `APP_PORT` and add your TLS certs.

### Scheduler
Install the autotrade timer or a cron entry — see `docs/04-scheduler-autotrader.md` §4–§5.

---

## 4. Option B — Docker / docker-compose (most portable)

The `deploy-portable/` folder contains a complete, secret-free container setup:

| File | Purpose |
|---|---|
| `Dockerfile` | Builds the Next.js app image. |
| `docker-compose.yml` | App + PostgreSQL services, env-driven. |
| `docker-entrypoint.sh` | Runs migrations/seed then starts the app. |
| `nginx.conf.template` | Optional reverse proxy. |
| `ict-futures.service.template` | systemd unit if you run the container under systemd. |
| `.env.example` | All required variables with placeholders. |

```bash
cd ict-futures-platform/deploy-portable
cp .env.example .env    # fill in secrets
docker compose up -d --build
docker compose logs -f
```

The entrypoint applies Prisma migrations automatically. Restore a DB backup afterward if migrating existing data (see §5).

---

## 5. Restore data on the NEW server

```bash
# Create an empty DB first (or let compose create it), then:
psql "$DATABASE_URL" < ict_backup_YYYY-MM-DD.sql
```
If you used `prisma migrate deploy` on an empty DB and then restore a dump, restore into a clean database to avoid conflicts. For schema+data moves, prefer a full `pg_dump`/`psql` restore over re-seeding.

---

## 6. Critical gotchas

- **`NEXT_DIST_DIR` must be `.build`.** `next.config.js` reads `distDir = process.env.NEXT_DIST_DIR || '.next'`, but this deployment is built and served expecting `.build`. Set `NEXT_DIST_DIR=.build` in the environment for **both** `yarn build` and `yarn start`, or the server will not find the compiled output.
- **LLM key is provider-specific.** The Abacus VM-injected key only works on the Abacus VM. Supply your own `LLM_API_KEY` + correct `LLM_BASE_URL` on the new host (see `docs/03`).
- **`NEXTAUTH_URL` must match the new public URL** (scheme + host + port), or login/callbacks break.
- **`NEXTAUTH_SECRET`** should be a stable random string; changing it invalidates existing sessions.
- **Recreate the scheduler** — it does not migrate (see `docs/04`).
- **Firewall/SMTP** — Gmail SMTP (app password) must be reachable if email alerts are enabled.

---

## 7. Post-migration verification

```bash
curl -s http://localhost:3456/api/demo/autotrade | head   # app up + endpoint reachable
```
Then in the browser: log in, confirm charts load live prices, confirm detection runs, place a one-click demo trade, and confirm the scheduler fires on its next tick (check timer/cron logs). Verify AI explanations render (confirms LLM config).

---

## 8. Test site (staging)

`deploy/staging/setup-staging.sh` stands up a separate **test site** on the same server, with its own database, port and domain. Changes can be previewed there before they reach the live site.

```bash
# on the server, as root (the app repo is public-read via HTTPS):
curl -fsSL https://raw.githubusercontent.com/mattriedl/ict-futures-platform/main/deploy/staging/setup-staging.sh -o /root/setup-staging.sh
bash /root/setup-staging.sh ict-test.<your-domain> staging 3460
```

- Point a DNS record for the test hostname at the server first (Cloudflare proxied is fine).
- The test site tracks the **`staging`** branch: push or merge a feature branch into `staging` on GitHub, and within ~2 minutes the server pulls, builds and restarts. A failed build leaves the previous version running (`/var/log/ict-staging-sync.status`).
- Workflow: feature branch → merge into `staging` → check the test site → merge into `main`.
- It runs its own scheduled cycle (autotrader + alerts) every 30 minutes, has its own Postgres database (`ict_staging`), and sends `noindex` headers.
- After creating your account on the test site, set **Admin → Registration open** to off so strangers can't sign up.
- Useful commands: `journalctl -u ict-staging -f`, `systemctl list-timers 'ict-staging*'`, `ict-staging-sync --force`.
