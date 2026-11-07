// ---------------------------------------------------------------------------
// Margin / notional helpers for the demo trading account.
//
// Model (Option 1 — realistic per-asset-class leverage):
//   notional        = entryPrice * positionSize * pointValue
//   requiredMargin  = notional / leverage
// Leverage is chosen per asset class (crypto / forex / futures) from the
// user's UserSettings, falling back to sensible defaults.
//
// Margin is a *reservation*: it is NOT deducted from currentBalance on open.
// Available balance is always derived as currentBalance - sum(open margins),
// preserving the invariant currentBalance = startingBalance + sum(realized pnl).
// ---------------------------------------------------------------------------

import { getPointValue } from '@/lib/instruments';
import { deriveAssetClass } from '@/lib/setup-stats';

// Per-asset-class leverage defaults (used when settings are missing).
export const DEFAULT_LEVERAGE = {
  crypto: 1,
  forex: 30,
  futures: 10,
} as const;

// Minimal shape of the leverage-bearing settings we read.
export interface LeverageSettings {
  leverageCrypto?: number | null;
  leverageForex?: number | null;
  leverageFutures?: number | null;
}

/** Full dollar notional of a position. */
export function computeNotional(
  symbol: string,
  entryPrice: number,
  positionSize: number,
  dbPointValue?: number | null,
): number {
  const pointValue = getPointValue(symbol, dbPointValue);
  return entryPrice * positionSize * pointValue;
}

/**
 * Pick the configured leverage for a symbol's asset class, falling back to the
 * defaults (crypto 1, forex 30, futures 10) when settings are missing/invalid.
 */
export function getLeverageForSymbol(symbol: string, settings?: LeverageSettings | null): number {
  const assetClass = deriveAssetClass(symbol);
  const pick = (v: number | null | undefined, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;

  switch (assetClass) {
    case 'crypto':
      return pick(settings?.leverageCrypto, DEFAULT_LEVERAGE.crypto);
    case 'forex':
      return pick(settings?.leverageForex, DEFAULT_LEVERAGE.forex);
    case 'futures':
    default:
      return pick(settings?.leverageFutures, DEFAULT_LEVERAGE.futures);
  }
}

/** Dollar margin required to open a position at the given leverage. */
export function computeRequiredMargin(
  symbol: string,
  entryPrice: number,
  positionSize: number,
  leverage: number,
  dbPointValue?: number | null,
): number {
  const notional = computeNotional(symbol, entryPrice, positionSize, dbPointValue);
  return notional / Math.max(leverage, 0.0001);
}
