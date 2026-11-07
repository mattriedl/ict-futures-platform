# 01 — Features & Functions

Every user-facing page and the functions behind it. Authenticated pages live
under `app/(app)/`; the login page is under `app/(auth)/login`.

---

## Authentication & roles

- **Login / signup:** `app/(auth)/login`, backed by `app/api/auth/*` and `app/api/signup`.
- **Auth engine:** NextAuth credentials provider (`lib/auth.ts`) with the Prisma adapter; passwords hashed with bcrypt. Sessions are JWT-based.
- **Roles / authorization:** `lib/authz.ts`. The first/owner account is `mattriedl@hotmail.com` (Owner). Roles gate access to the admin area and admin APIs.
- **Registration toggle:** `AppSettings.registrationOpen` (admin) controls whether new signups are allowed.

---

## Dashboard — `app/(app)/dashboard`

Landing view after login. Shows tracked instruments, their current bias/score,
and quick access to analysis. Pulls from `/api/futures/[symbol]/analyze` and
`/api/futures/[symbol]/quote`. Tracked symbols come from `UserSettings.trackedSymbols`.

## Chart Analysis — `app/(app)/chart/[symbol]`

The core analysis screen for one instrument.

- **Data:** `/api/futures/[symbol]/data?timeframe=` returns OHLCV bars; `/api/futures/[symbol]/quote` returns the live, timeframe-independent price shown in the header.
- **Pattern detection & setup:** `/api/futures/[symbol]/analyze?timeframe=` runs the full ICT engine (`lib/ict-engine`), returns detected patterns, a confluence score, overall bias, and a generated trade setup (entry/stop/target, R:R, AI score, weighted score).
- **Analyze (AI explanation) button:** calls `POST /api/ai/explain`, which streams a written ICT analysis from the configured LLM. If the LLM is not configured or unreachable the button shows "Failed to generate AI analysis" (see [docs/03](./03-ai-llm.md) for the fix). This is the only feature that depends on the AI connection.
- **Overlays:** detected patterns can be toggled on/off on the chart.
- **One-click trade:** `components/trade/one-click-trade.tsx` opens a demo trade directly from the current setup via `POST /api/demo/trades`.

## Backtest — `app/(app)/backtest`

Runs the ICT setup logic over a historical window (default ~60 days) for a chosen
instrument/timeframe and reports win rate, expectancy, R-multiples and P&L.

- API: `POST /api/backtest` (run), `GET /api/backtest/[id]` (fetch a saved run).
- Logic: `lib/backtest.ts`. Results persist in the `BacktestRun` model.
- Enabled/disabled globally by `AppSettings.backtestingEnabled`.
- Details & math: [docs/08](./08-trading-engine.md).

## Journal — `app/(app)/journal`

Complete record of demo trades (open and closed) with statistics.

- **Stats:** win rate, expectancy, profit factor, net P&L, open/closed counts — `/api/demo/stats`.
- **Account:** balance and starting balance — `/api/demo/account`.
- **Equity curve / drawdown:** `/api/demo/drawdown`.
- **Trades list:** `/api/demo/trades` (list/create), `/api/demo/trades/[id]` (close/update/delete).
- A loading guard prevents the balance briefly flashing `$0` before data loads.

## Demo trading (how trades are created & resolved)

Three ways a demo trade is opened, all creating a `DemoTrade` with status `OPEN`
and reserving margin:

1. **One-click** — from a setup card on the chart (`source=ONE_CLICK`).
2. **Manual** — entered by hand with a chosen size or auto-size (`source=MANUAL`).
3. **Automated** — placed by the autotrader on schedule (`source=AUTO`). See [docs/04](./04-scheduler-autotrader.md).

- **Starting balance:** default `$100,000` (`DemoAccount.startingBalance`, configurable; the owner account was reset to `$1,000` for live testing).
- **Sizing:** 1%-risk rule by default (`UserSettings.riskPercent`). Size = riskAmount / per-unit-risk.
- **Margin:** reserved as notional / leverage (per asset class). Released on close. Full math in [docs/08](./08-trading-engine.md).
- **Resolution:** `evaluateOpenTrades()` in `lib/demo-trades.ts` closes trades when live price hits stop or target. **Trades are never resolved against synthetic/fabricated bars** — only real market data.
- **Balance integrity:** `reconcileDemoBalance()` self-heals balance drift; invariant is `currentBalance = startingBalance + sum(realized pnl)`.

## Insights — `app/(app)/insights`

Aggregates logged setups and their outcomes to surface which confluences/asset
classes perform best. Backed by `/api/insights/setups` and the `SetupLog` model;
the empirical hit-rates feed the weighted score (`lib/setup-stats.ts`).

## Liquidity — `lib/liquidity.ts`, `/api/liquidity`, `components/trade/liquidity-badge.tsx`

Computes order-book / liquidity context for supported symbols (crypto via
Coinbase/Kraken/OKX depth endpoints) and surfaces it as a badge on setups.

## Alerts — `app/(app)/alerts`

Lists triggered alerts and manages alert preferences. API: `/api/alerts`.
Alert thresholds and per-pattern toggles live in `UserSettings` (see [docs/02](./02-configuration.md)).
Email delivery uses `lib/email.ts` (Gmail SMTP) and requires `GMAIL_APP_PASSWORD`.

## Settings — `app/(app)/settings`

Per-user configuration (stored in `UserSettings`): refresh interval, theme,
tracked symbols, alert thresholds and per-pattern toggles, email alerts,
risk %, per-asset-class leverage, and the **Automated Trading** section
(auto-trade on/off + minimum score). API: `/api/settings`. Full field list: [docs/02](./02-configuration.md).

## Admin — `app/(app)/admin`

Owner/admin-only backend.

- **Users:** list, edit roles, manage — `/api/admin/users`, `/api/admin/users/[id]`.
- **Instruments:** manage the tradable instrument list — `/api/admin/instruments`.
- **Global settings:** `AppSettings` — `/api/admin/settings` (site name, default starting balance, registration open, feature toggles).
- **Stats:** platform-wide stats — `/api/admin/stats`.

## AI endpoints

- `POST /api/ai/explain` — streamed natural-language ICT analysis (chart "Analyze" button).
- `POST /api/ai/score` — AI scoring helper.
- `GET /api/ai/history` — AI interaction history.

All depend on the LLM connection ([docs/03](./03-ai-llm.md)).
