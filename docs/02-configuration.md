# 02 — Configuration Reference

Everything you can change, and where. Three layers:

1. **Environment variables** (`.env`) — connections & deployment, set per server.
2. **Per-user settings** (`UserSettings`) — changed in the **Settings** page.
3. **Global app settings** (`AppSettings`) — changed in the **Admin** page.

---

## 1. Environment variables (`.env`)

`.env` lives in the project root, is **gitignored**, and is read at runtime.
Template: [`deploy-portable/.env.example`](../deploy-portable/.env.example).
Never commit a filled-in `.env`.

| Variable | Required | Purpose |
| :-- | :-- | :-- |
| `DATABASE_URL` | Yes | Full PostgreSQL connection string used by Prisma. e.g. `postgresql://user:pass@host:5432/ict_futures?schema=public` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Docker only | Configure the bundled Postgres container; Compose builds `DATABASE_URL` from them. Ignore if using managed Postgres. |
| `NEXTAUTH_URL` | Yes | Public base URL of the app (auth callbacks + absolute links). e.g. `https://trade.example.com` |
| `NEXTAUTH_SECRET` | Yes | Session signing secret. Generate with `openssl rand -base64 32`. Keep the same value to preserve sessions; rotate to force re-login. |
| `LLM_BASE_URL` | Optional | OpenAI-compatible base URL. App POSTs to `${LLM_BASE_URL}/chat/completions`. Blank = AI disabled (503, handled gracefully). |
| `LLM_API_KEY` | Optional | API key for the LLM endpoint. Falls back to `ABACUSAI_API_KEY` if unset. |
| `LLM_MODEL` | Optional | Model name the endpoint serves, e.g. `gpt-4o`, `claude-opus-4-5`. |
| `ABACUSAI_API_KEY` | Optional | Legacy/back-compat key; used as `LLM_API_KEY` fallback. Only valid on the Abacus VM. |
| `AUTOTRADE_SECRET` | Yes (for autotrader) | Shared secret that authorizes `POST /api/demo/autotrade`. The scheduler sends it as `x-autotrade-secret`. If unset, the endpoint returns 401. |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` / `EMAIL_FROM` | Optional | Gmail SMTP credentials for email alerts / password reset. Blank = email disabled. |
| `APP_PORT` | Optional | Host port to serve on. Default `3456`. |
| `RUN_SEED` | Docker only | `true` seeds instruments on container start. |
| `NEXT_DIST_DIR` | Yes | Next.js build dir. **Must stay `.build`** — `next.config.js` reads it and the systemd service expects it. |
| `SEED_TEST_USER_EMAIL` / `SEED_TEST_USER_PASSWORD` | Optional | If both set, `npm run seed` creates a test login. Leave unset in production. |
| `NEXT_PUBLIC_APPLLM_LIB_URL` | Abacus only | Injects a client script tag on the Abacus platform. Leave blank when self-hosting. |

> **Migration note:** the only values that are host-specific are `DATABASE_URL`,
> `NEXTAUTH_URL`, and the LLM key. Everything else is portable. The Abacus LLM
> key only works from the Abacus VM — on your own server point `LLM_*` at your own
> provider. See [docs/03](./03-ai-llm.md) and [docs/05](./05-migration.md).

---

## 2. Per-user settings — `UserSettings` (Settings page)

Stored one row per user; edited via the Settings UI (`/api/settings`).

| Field | Default | Meaning |
| :-- | :-- | :-- |
| `refreshInterval` | `60` | Dashboard/chart auto-refresh seconds. |
| `theme` | `dark` | UI theme. |
| `trackedSymbols` | `ES=F,NQ=F,CL=F,GC=F` | Up to 20 symbols shown on the dashboard and scanned for alerts (pick any instrument in Settings). |
| `alertMinScore` | `50` | Minimum setup score to raise an alert (ICT score scale; see docs/08 §2a). |
| `alertOnOB` / `alertOnFVG` / `alertOnLiqSweep` / `alertOnMSS` / `alertOnOTE` | `true` | Per-pattern alert toggles. |
| `notificationsOn` | `true` | "Generate setup alerts": master switch for alert generation in the scheduled cycle. |
| `emailAlertsEnabled` | `false` | Also email each new alert (needs Gmail env vars and the admin's global email switch). |
| `alertEmail` | — | Override recipient for email alerts. |
| `riskPercent` | `1` | % of balance risked per demo trade (drives position sizing). |
| `maxDailyLossPercent` | `4` | Daily loss limit (% of day-start balance). |
| `maxOverallDrawdownPercent` | `6` | Overall drawdown limit (% of peak balance). |
| `enforceDrawdown` | `false` | When true, a breached limit hard-blocks new trades (manual and auto). |
| `leverageCrypto` | `1` | Leverage for crypto margin (1 = full notional). |
| `leverageForex` | `30` | Leverage for FX margin. |
| `leverageFutures` | `10` | Leverage for futures margin. |
| `autoTradeEnabled` | `false` | **Master switch for the autotrader for this user.** |
| `autoTradeMinScore` | `70` | Minimum weighted setup score to auto-place a trade (ICT score scale). |

> **Operational note:** the owner account currently runs `autoTradeEnabled=true`,
> `autoTradeMinScore=65`, `riskPercent=1`, and leverage crypto 5 / forex 100 /
> futures 50 (changed from defaults during testing). Change these in Settings; they
> take effect on the next autotrader cycle. See [docs/04](./04-scheduler-autotrader.md).

---

## 3. Global settings — `AppSettings` (Admin page)

Single global row (`id="global"`), edited via `/api/admin/settings`.

| Field | Default | Meaning |
| :-- | :-- | :-- |
| `siteName` | `ICT Futures` | Display name. |
| `defaultStartingBalance` | `100000` | Starting balance for new demo accounts. |
| `registrationOpen` | `true` | Allow new signups. |
| `backtestingEnabled` | `true` | Enable the Backtest feature. |
| `oneClickTradingEnabled` | `true` | Enable one-click trading. |
| `emailAlertsEnabled` | `true` | Global email-alerts master switch. |

---

## 4. Instruments

Tradable instruments live in the `Instrument` model (symbol, name, exchange,
`tickSize`, `pointValue`, `active`). Seeded by `npm run seed` (futures) plus a
curated crypto set (`scripts/curate-crypto.ts`, `lib/crypto-instruments.ts`) —
64 total (14 futures + 22 crypto + 28 forex, defined in `lib/instruments.ts`). Manage them in **Admin → Instruments** or
by editing the seed scripts. `pointValue` is critical for correct P&L (e.g. ES=F
= $50/point, MES=F = $5/point); see [docs/08](./08-trading-engine.md).

## 5. Code-level settings

| Setting | File |
| :-- | :-- |
| Build output dir | `next.config.js` (`distDir` from `NEXT_DIST_DIR`) |
| Leverage defaults | `lib/margin.ts` (`DEFAULT_LEVERAGE`) |
| Data-source hosts & fallbacks | `lib/market-data.ts`, `lib/crypto-feed.ts`, `lib/live-quote.ts`, `lib/yahoo-finance.ts` |
| Pattern detection thresholds | `lib/ict-engine/*.ts` |
| Scoring / weighting | `lib/setup-stats.ts`, `lib/ict-engine/index.ts` |
| Autotrader gates (freshness, R:R, dedupe) | `lib/autotrade.ts` |
