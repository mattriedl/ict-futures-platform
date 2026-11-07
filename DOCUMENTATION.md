# ICT Futures Trading Platform — Complete Documentation

> Master index. This document and the files under [`docs/`](./docs) describe every
> feature, function, setting, connection, and operational procedure for the
> application, including how to move it to a new server and how the automated
> scheduler and AI connections work.

**App type:** Next.js 14 (App Router, TypeScript) + Prisma + PostgreSQL
**Repository:** https://github.com/mattriedl/ict-futures-platform
**Branch model:** `main` is the stable, production-ready source of truth. Test on feature branches, merge into `main` to go live.

---

## Documentation map

| Doc | Covers |
| :-- | :-- |
| [docs/01-features.md](./docs/01-features.md) | Every page, feature, and what each one does |
| [docs/02-configuration.md](./docs/02-configuration.md) | All environment variables, user settings, admin settings — what to change and where |
| [docs/03-ai-llm.md](./docs/03-ai-llm.md) | AI / LLM connection, how to point it at any provider, troubleshooting |
| [docs/04-scheduler-autotrader.md](./docs/04-scheduler-autotrader.md) | The autotrader, cron / systemd timer / platform task, scheduling redundancy |
| [docs/05-migration.md](./docs/05-migration.md) | Moving to a new server (bare-metal, VPS, Docker) step by step |
| [docs/06-api-reference.md](./docs/06-api-reference.md) | Every API endpoint, method, auth, and payload |
| [docs/07-database.md](./docs/07-database.md) | Prisma schema, all models, migrations, seeding, backup/restore |
| [docs/08-trading-engine.md](./docs/08-trading-engine.md) | ICT pattern engine, scoring, margin/leverage model, PnL math, backtesting |

Legacy: [SERVER_DEPLOYMENT.md](./SERVER_DEPLOYMENT.md) is the original deployment guide (PM2/systemd/Docker/Nginx). [docs/05-migration.md](./docs/05-migration.md) supersedes and expands it.

---

## 1. What the application is

An ICT (Inner Circle Trader) methodology trading platform for futures, FX, and
crypto. It:

- Pulls live/historical market data and detects 13 categories of ICT patterns.
- Scores each setup (raw + empirically-weighted) and produces entry/stop/target levels.
- Lets a user paper-trade from those setups (one-click, manual, or fully automated).
- Keeps a trade journal with statistics, equity curve, and drawdown.
- Backtests setups over a historical window.
- Provides an admin backend for users, instruments, and global settings.
- Optionally sends email alerts and AI-written trade explanations.

## 2. Technology stack

| Layer | Technology |
| :-- | :-- |
| Framework | Next.js 14 (App Router) + React 18 + TypeScript |
| Styling | Tailwind CSS + Radix UI primitives |
| Auth | NextAuth (credentials provider) + Prisma adapter |
| ORM / DB | Prisma 6 + PostgreSQL |
| Charts | Chart.js / Plotly |
| AI | Any OpenAI-compatible `/chat/completions` endpoint |
| Email | Nodemailer (Gmail SMTP) |
| Market data | Yahoo Finance (futures/FX), Coinbase/Kraken/OKX (crypto) |

## 3. High-level architecture

```
Browser ──> Next.js (app/(app)/* pages)
               │
               ├─> app/api/*  (route handlers)
               │       │
               │       ├─> lib/ict-engine/*   pattern detection
               │       ├─> lib/market-data, crypto-feed, live-quote, yahoo-finance   data
               │       ├─> lib/autotrade, demo-trades, margin, setup-stats   trading logic
               │       ├─> lib/backtest   backtesting
               │       ├─> lib/llm + app/api/ai/explain   AI explanations
               │       └─> lib/email   alerts
               │
               └─> Prisma ──> PostgreSQL

Scheduler (platform task + local systemd timer)
   └─> POST /api/demo/autotrade  (x-autotrade-secret)  ──> runs one autotrader cycle
```

## 4. Repository layout

```
nextjs_space/
├── app/
│   ├── (app)/            authenticated pages: dashboard, chart, backtest,
│   │                     journal, insights, alerts, settings, admin
│   ├── (auth)/login      login page
│   └── api/              all REST route handlers (see docs/06)
├── components/           UI + trade components (one-click-trade, liquidity-badge, ...)
├── lib/                  business logic (engine, data, trading, auth, llm, email)
│   └── ict-engine/       one file per ICT pattern + index.ts orchestrator
├── prisma/
│   ├── schema.prisma     data model (see docs/07)
│   └── migrations/       SQL migrations
├── scripts/              seed, bootstrap, curate-crypto, reconcile-fx, verify-calcs
├── deploy/               local systemd units for the autotrader backstop timer
├── deploy-portable/      Docker / Nginx / systemd templates + .env.example
├── public/
├── DOCUMENTATION.md      (this file)
└── docs/                 detailed documentation set
```

## 5. Quick start (local / new machine)

```bash
git clone https://github.com/mattriedl/ict-futures-platform.git
cd ict-futures-platform              # then into nextjs_space if nested
cp deploy-portable/.env.example .env # fill in real values (see docs/02)
npm install
npx prisma migrate deploy            # create schema
npm run seed                         # seed instruments
npm run build                        # NEXT_DIST_DIR=.build
npm start                            # serves on APP_PORT (default 3456)
```

Full production/migration instructions: [docs/05-migration.md](./docs/05-migration.md).

## 6. The three things people most often change

1. **AI provider / key** → `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` in `.env`. See [docs/03](./docs/03-ai-llm.md).
2. **Autotrader behaviour** (on/off, min score, risk %, leverage) → per-user in **Settings → Automated Trading**, stored in `UserSettings`. See [docs/02](./docs/02-configuration.md) and [docs/04](./docs/04-scheduler-autotrader.md).
3. **Where/when the scheduler runs** → platform Scheduled Task + local systemd timer (`deploy/ict-autotrade-local.timer`). See [docs/04](./docs/04-scheduler-autotrader.md).

## 7. Security / secrets rule

Secrets live **only** in each server's local `.env`, which is gitignored. Nothing
in the repo contains a real credential — `deploy-portable/.env.example` lists the
variable names only. When migrating, recreate `.env` on the new host; do not copy
keys into tracked files. See [docs/02](./docs/02-configuration.md) and [docs/05](./docs/05-migration.md).
