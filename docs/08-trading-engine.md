# 08 — Trading Engine (ICT Detection, Scoring, PnL)

The analytical core lives in **`lib/ict-engine/`** (pattern detectors + orchestration) with supporting math in `lib/margin.ts`, `lib/demo-trades.ts`, `lib/backtest.ts`, `lib/live-quote.ts`, and `lib/market-data.ts`.

---

## 1. ICT pattern detectors (13)

Each detector is its own module in `lib/ict-engine/`:

| Detector | Concept |
|---|---|
| `order-blocks` | Institutional order blocks (last up/down candle before a strong move). |
| `fair-value-gaps` | Fair Value Gaps (FVG) / imbalances between candle wicks. |
| `liquidity-sweeps` | Stop runs / liquidity grabs beyond swing highs/lows. |
| `market-structure` | Market Structure Shift (MSS) / break of structure. |
| `ote` | Optimal Trade Entry (Fibonacci 0.62–0.79 retracement zone). |
| `breaker-blocks` | Breaker blocks (failed order block that flips). |
| `mitigation-blocks` | Mitigation blocks. |
| `equal-highs-lows` | Equal highs/lows (liquidity pools). |
| `displacement` | Displacement / energetic directional moves. |
| `opening-gaps` | Opening gaps. |
| `silver-bullet` | Silver Bullet time-window setup. |
| `power-of-three` | Accumulation–Manipulation–Distribution (AMD). |
| `previous-day-levels` | Previous day/period high-low reference levels. |

---

## 2. Orchestration (`lib/ict-engine/index.ts`)

| Function | Role |
|---|---|
| `analyzeICT()` | Runs all detectors over a candle series and returns the detected patterns. |
| `scoreConfluence()` | Combines detected patterns into a single **confluence score** (higher = more aligned confirmation). This score drives alerts (`alertMinScore`) and autotrade entry (`autoTradeMinScore`). |
| `generateTradeSetup()` | Produces a concrete setup from the confluence: entry, stop-loss (entry ∓ 1.5×ATR), take-profit (entry ± 3×ATR, extended to the nearest EQH/EQL or PDH/PDL). The entry anchors to the **most recent** zone (priority Silver Bullet → OTE → Order Block → FVG → Mitigation) that is on the correct side of price, within 3×ATR, and not broken by a later close; otherwise it uses the market price. |

To tune behavior, adjust detector thresholds inside the individual modules or the weighting inside `scoreConfluence()`. After changing scoring, re-run `scripts/verify-calcs.ts` and backtests, and (per project rules) test in a feature branch before merging to `main`.

---

## 3. Live price (timeframe-independent)

Live quotes come from `lib/live-quote.ts` / `lib/market-data.ts` and are always fetched in **real time**, independent of the chart's selected timeframe. Data sources:
- **Futures & FX:** Yahoo Finance (`query1.finance.yahoo.com`).
- **Crypto:** Coinbase (`api.exchange.coinbase.com`), Kraken (`api.kraken.com`), OKX (`www.okx.com`) — see `lib/crypto-feed.ts` / `lib/crypto-instruments.ts`.

> **Constraint honored:** the demo engine evaluates and resolves trades using these real feeds only — never synthetic/fabricated bars.

---

## 4. Position sizing, margin & leverage

Defined in `lib/margin.ts` and applied in `lib/demo-trades.ts`.

- **Notional** = `entryPrice × positionSize × pointValue`
- **Margin** = `notional ÷ leverage`
- **Default leverage** (per instrument class, overridable per user in `UserSettings`):
  - Crypto: **1×** (`leverageCrypto`)
  - Forex: **30×** (`leverageForex`)
  - Futures: **10×** (`leverageFutures`)
- **Risk sizing:** position size is derived from the user's `riskPercent` of account balance against the stop distance.
- **FX in USD:** an FX contract is one micro lot (1,000 base units), so a 1.00 move is worth 1,000 of the *quote* currency. At entry, `resolveTradePointValue()` (`lib/fx.ts`) converts that to USD with a live rate: quote USD → ×1; base USD (USDJPY) → ×1/price; crosses (EURGBP, GBPJPY) → via the quote currency's USD pair. The result is stored on the trade (`DemoTrade.pointValue`) and used for sizing, margin and P&L for the trade's lifetime. If no live rate is available the trade is refused. Trades opened before Nov 2026 have no stored value and use the instrument's configured one.

---

## 5. PnL & outcome math

In `lib/demo-trades.ts`:

- **PnL** = `(exitPrice − entryPrice) × direction × pointValue × positionSize`
  - `direction` = +1 for long, −1 for short.
- **pnlPercent** = PnL relative to margin committed.
- **rMultiple** = realized PnL ÷ initial risk (R), i.e. how many multiples of the risked amount were gained/lost.
- **Outcome resolution:** an OPEN trade becomes `WIN` or `LOSS` when live price reaches the take-profit or stop-loss; manual closes are `CLOSED_MANUAL`. Resolution runs inside the autotrade evaluation cycle (see `docs/04`).

Use `scripts/verify-calcs.ts` to validate these formulas against stored trades after any change.

---

## 6. Backtesting

`lib/backtest.ts` replays historical candles through `analyzeICT()` / `scoreConfluence()` / `generateTradeSetup()` on a rolling 400-bar window (like live analysis). It fills at the signal bar's **close** using the autotrader's freshness rules, scores Kill Zones at the bar's own time, and resolves TP/SL on later bars only. Max drawdown is measured on an account risking `riskPerTrade`% per trade. Results go to `BacktestRun`. It refuses to run without enough real history. Exposed via `/api/backtest` and the Backtest page. Gated by `AppSettings.backtestingEnabled`.

---

## 7. Where to change what

| To change… | Edit… |
|---|---|
| Detection sensitivity | the relevant `lib/ict-engine/<detector>.ts` |
| How confluence is scored/weighted | `scoreConfluence()` in `lib/ict-engine/index.ts` |
| Entry/stop/target logic | `generateTradeSetup()` in `lib/ict-engine/index.ts` |
| Margin/leverage model | `lib/margin.ts` + `UserSettings` leverage fields |
| PnL/outcome math | `lib/demo-trades.ts` |
| Data sources / feeds | `lib/market-data.ts`, `lib/live-quote.ts`, `lib/crypto-feed.ts` |
| Autotrade entry threshold | per-user `autoTradeMinScore` (default 75) |
