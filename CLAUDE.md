# CLAUDE.md — ICT Futures Platform

Working notes for Claude (and any developer) on this repo. Project was built on
Abacus.ai and handed over to Claude in Nov 2026. Full docs: `DOCUMENTATION.md`
and `docs/01–08`. UI conventions: `STYLE_GUIDE.md`.

## Stack & layout
- Next.js 14 App Router + TypeScript, Prisma 6 + PostgreSQL, NextAuth (credentials, JWT), Tailwind + Radix/shadcn.
- The app is at the **repository root** (old docs/scripts may say `nextjs_space/` or `/home/ubuntu/...` — those are Abacus VM paths).
- `app/(app)/*` authenticated pages (each `page.tsx` + `_components/*-client.tsx`), `app/api/*` route handlers, `lib/` business logic, `lib/ict-engine/` one file per ICT detector + `index.ts` (analyze → score → setup).

## Branch & deploy rules
- `main` = stable source of truth. Work on feature branches; owner reviews and merges.
- No live deployment exists yet (as of Nov 2026). Nothing auto-deploys on push.
- Never commit secrets. `.env` is gitignored; `.env.example` / `deploy-portable/.env.example` hold names only.

## Commands
```bash
npm ci                         # .npmrc sets legacy-peer-deps (eslint peer conflict)
npx prisma generate
npx tsc --noEmit -p .          # must pass — next.config has ignoreBuildErrors:false
npx prisma migrate deploy      # apply migrations
npm run seed                   # = prisma db seed -> scripts/safe-seed.ts -> seed.ts
NEXT_DIST_DIR=.build npm run build && NEXT_DIST_DIR=.build npm start
```

## Database rules
- Schema change = edit `prisma/schema.prisma` **and** add a migration (`npx prisma migrate dev --name ...`). Never rely on `db push` alone — that is how the migrations fell out of sync on Abacus.
- Additive changes with defaults only on live data; no drops/renames without a data plan.
- Verify zero drift: `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <empty db>`.
- `scripts/seed.ts` must never contain `delete`/`deleteMany` (enforced by `safe-seed.ts`).

## Trading-engine invariants (do not break)
- Trades resolve **only against real market data** (Yahoo / Coinbase / Kraken / OKX). Never synthetic bars.
- Live price is timeframe-independent (`lib/live-quote.ts`).
- Margin is a reservation, not a deduction: `available = currentBalance − Σ open margin`; `currentBalance = startingBalance + Σ realized pnl` (`reconcileDemoBalance` self-heals).
- `pointValue` drives P&L (ES=F $50/pt, MES=F $5/pt). Instrument list source of truth: `lib/instruments.ts`.
- Autotrader opens **at market** only while the setup is fresh (LONG: entry < live < tp; SHORT mirrored) with ≥1:1 remaining R:R. Do not reintroduce passive PENDING limit orders — they caused a 100% stop-out rate.
- After changing scoring/sizing/PnL: run `scripts/verify-calcs.ts` and a backtest.
- The LLM is optional; trading, detection and scoring must keep working with no LLM configured.

## Known issues / backlog (as of handover)
- Several API routes have no session check (`futures/[symbol]/data|quote`, `ai/*`, `liquidity`, `insights/setups`); `/api/ai/explain` can spend LLM credits unauthenticated. No `middleware.ts`.
- Abacus leftovers: `.abacus.donotdelete`, error-reporter injection in `next.config.js` (standalone builds only), `ABACUSAI_API_KEY` fallback, `NEXT_PUBLIC_APPLLM_LIB_URL`, `scripts/gitpush.py`.
- `deploy/ict-autotrade-local.*` hardcode `/home/ubuntu/...` and pipe to `/home/ubuntu/process_autotrade.py`, which is not in the repo.
- The Abacus "ICT Autotrader" scheduled task does not migrate; recreate as cron/systemd (`docs/04`).
