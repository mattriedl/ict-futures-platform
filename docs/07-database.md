# 07 — Database

The app uses **PostgreSQL** via **Prisma ORM** (Prisma 6). The schema is the single source of truth at `prisma/schema.prisma`; the datasource is `postgresql` using `env("DATABASE_URL")`. The Prisma client is instantiated once in `lib/prisma.ts` / `lib/db.ts`.

---

## 1. Connection

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?schema=public
```

For the Docker setup, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` feed the bundled Postgres container and the composed `DATABASE_URL` (see `deploy-portable/docker-compose.yml`).

---

## 2. Models (16)

**Auth / NextAuth**
- `User` — account, email, hashed password, role (Owner/Admin/User), status.
- `Account`, `Session`, `VerificationToken` — NextAuth adapter tables.

**Instruments & market data**
- `Instrument` — tradable symbols (futures, forex, crypto): symbol, name, type/class, point value, enabled flag.
- `PriceSnapshot` — captured price points used for analysis/history.

**ICT detection & setups**
- `DetectedPattern` — a single ICT pattern instance found by the engine (type, price levels, timestamp, symbol).
- `TradeSetup` — a composed setup (entry/stop/target + confluence score) derived from patterns.
- `PatternOutcome` — realized outcome of a pattern/setup (for stats & calibration).
- `SetupLog` — log of generated setups over time.

**Alerts**
- `Alert` — user alerts tied to symbols/criteria.

**User & app configuration**
- `UserSettings` — per-user preferences (refresh interval, theme, tracked symbols, alert thresholds & toggles, email alert settings, risk %, per-class leverage, autotrade enable + min score). Full field list in `docs/02-configuration.md`.
- `AppSettings` — single global row (`id="global"`): default starting balance, registrationOpen, backtestingEnabled, oneClickTradingEnabled, emailAlertsEnabled, siteName.

**Demo trading**
- `DemoAccount` — per-user paper account (startingBalance/currentBalance, default 100000).
- `DemoTrade` — individual paper trade: symbol, side, entry/exit price, position size, margin, `aiScore`, `source` (ONE_CLICK | MANUAL | AUTO), `status` (OPEN | WIN | LOSS | CLOSED_MANUAL), outcome, pnl, pnlPercent, rMultiple.

**Backtesting**
- `BacktestRun` — a backtest execution and its aggregate results.

---

## 3. Migrations

Prisma migrations live in `prisma/migrations/`.

```bash
# Apply all migrations to a database (production/new server)
npx prisma migrate deploy

# Create a new migration after editing schema.prisma (development)
npx prisma migrate dev --name describe_change

# Push schema without a migration history (quick sync / prototyping)
npx prisma db push

# Regenerate the Prisma client after schema changes
npx prisma generate
```

> **Backward compatibility:** add columns with defaults; avoid dropping/renaming columns on a live DB without a data plan. Verify existing rows are safe before applying.

---

## 4. Seeding

```bash
npm run seed    # tsx --require dotenv/config scripts/safe-seed.ts
```

`safe-seed.ts` is idempotent/non-destructive (safe to run on an existing DB). Related scripts in `scripts/`:
- `seed.ts` — base seed.
- `curate-crypto.ts` — curate crypto instrument list.
- `backfill-margin.ts` — backfill margin on existing trades.
- `reconcile-fx.ts` — reconcile FX instrument data.
- `verify-calcs.ts` — sanity-check PnL/margin calculations.
- `bootstrap.ts` — initial environment bootstrap.

---

## 5. Backup & restore

```bash
# Backup
pg_dump "$DATABASE_URL" > ict_backup_$(date +%F).sql

# Restore (into an empty/clean database)
psql "$DATABASE_URL" < ict_backup_YYYY-MM-DD.sql
```

For Docker, run these inside/against the Postgres container (or expose its port). Always back up before migrations or a server move (see `docs/05-migration.md`).

---

## 6. Inspecting data

```bash
npx prisma studio          # visual DB browser (dev)
psql "$DATABASE_URL"       # direct SQL
```
