# 06 — API Reference

> ⚠️ **Known gap (Nov 2026):** there is no `middleware.ts`; each route checks auth itself. Routes marked **none ⚠️** currently perform no session check, so they are reachable without logging in — notably `/api/ai/explain`, which can spend LLM credits. Fix before going public.

All endpoints live under `app/api/` (Next.js App Router route handlers). Unless noted, requests/responses are JSON. Most user-facing routes require an authenticated NextAuth session (cookie); admin routes additionally require the Owner/Admin role (`lib/authz.ts`); the autotrade route uses a shared secret instead of a session.

> Base URL in local/prod examples: `http://localhost:3456` (adjust to your deployment).

---

## Authentication & accounts

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | public | Credentials login (email + password, bcrypt-verified). |
| `*` | `/api/auth/[...nextauth]` | public | NextAuth handler (session, callbacks, signout). |
| `POST` | `/api/signup` | public* | Create a new user. Honors `AppSettings.registrationOpen`. |

\* Signup is gated by the global `registrationOpen` flag (admin-controlled).

---

## Market data & analysis

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/futures/[symbol]/data` | **none ⚠️** | OHLC/candle series for a symbol (chart data). |
| `GET` | `/api/futures/[symbol]/quote` | **none ⚠️** | Real-time/live quote for a symbol (timeframe-independent live price). |
| `GET/POST` | `/api/futures/[symbol]/analyze` | session | Runs the ICT engine on the symbol; returns detected patterns + confluence score + trade setup. |
| `GET` | `/api/liquidity` | **none ⚠️** | Liquidity analysis data (liquidity pools / resting liquidity features). |
| `GET` | `/api/insights/setups` | **none ⚠️** | Aggregated setup insights / statistics. |

---

## AI / LLM

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/ai/explain` | **none ⚠️** | Natural-language explanation of a detected setup. |
| `POST` | `/api/ai/score` | **none ⚠️** | AI confluence commentary for a score. |
| `GET` | `/api/ai/history` | **none ⚠️** | Past AI responses for the user/setup. |

See `docs/03-ai-llm.md` for provider configuration.

---

## Demo trading

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/demo/account` | session | Current demo account (balance, equity). |
| `GET` | `/api/demo/stats` | session | Demo performance stats (win rate, PnL, etc.). |
| `GET` | `/api/demo/drawdown` | session | Drawdown metrics for the demo account. |
| `GET/POST` | `/api/demo/trades` | session | List demo trades / open a new demo trade. |
| `GET/PATCH/DELETE` | `/api/demo/trades/[id]` | session | Read / modify / close a specific demo trade. |
| `POST` | `/api/demo/autotrade` | **secret** | Run one autotrade cycle (activate → evaluate → auto-enter). Auth via `x-autotrade-secret` header or `?secret=`. |
| `GET` | `/api/demo/autotrade` | public/secret | Autotrader status/health. |

See `docs/04-scheduler-autotrader.md` for the autotrade cycle and scheduling.

---

## Backtesting

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET/POST` | `/api/backtest` | session | List backtest runs / start a new backtest. |
| `GET` | `/api/backtest/[id]` | session | Fetch a specific backtest run and its results. |

Gated by `AppSettings.backtestingEnabled`.

---

## Alerts & settings

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET/POST` | `/api/alerts` | session | List / create alerts. |
| `GET/PUT` | `/api/settings` | session | Read / update the current user's `UserSettings`. |

---

## Admin (Owner/Admin role required)

| Method | Path | Description |
|---|---|---|
| `GET/POST` | `/api/admin/instruments` | Manage tradable instruments. |
| `GET/PUT` | `/api/admin/settings` | Read/update global `AppSettings`. |
| `GET` | `/api/admin/stats` | Platform-wide statistics. |
| `GET/POST` | `/api/admin/users` | List / create users. |
| `GET/PATCH/DELETE` | `/api/admin/users/[id]` | Manage a specific user (role, status, reset). |

---

## Conventions

- **Auth failures** return `401` (no session) or `403` (insufficient role).
- **Autotrade** returns `401`/`403` if the secret is missing/invalid.
- **Validation errors** return `400` with a JSON `error` message.
- All handlers are server-side; secrets (DB URL, LLM key, autotrade secret, SMTP password) are never exposed to the client.
