// ---------------------------------------------------------------------------
// USD conversion for FX point values.
//
// An FX "contract" here is one micro lot (1,000 units of the base currency), so
// a 1.00 move in the pair is worth 1,000 units of the QUOTE currency. That is
// only dollars when the quote currency is USD (EURUSD, GBPUSD, ...). For
// USDJPY it is 1,000 yen, for EURGBP 1,000 pounds, and so on. Booking those as
// dollars inflated P&L, notional and margin (about 150x on yen pairs).
//
// resolveTradePointValue() returns the USD value of a 1.00 move per contract,
// using real live rates only. The value is stored on each DemoTrade
// (DemoTrade.pointValue) so the trade's P&L stays consistent for its lifetime.
// ---------------------------------------------------------------------------

import { getPointValue, isForexSymbol } from '@/lib/instruments';
import { fetchLiveQuote } from '@/lib/live-quote';

/** Split a Yahoo FX symbol like "EURGBP=X" into ["EUR", "GBP"]. */
export function parseFxPair(symbol: string): { base: string; quote: string } | null {
  const m = /^([A-Z]{3})([A-Z]{3})=X$/.exec(symbol ?? '');
  return m ? { base: m[1], quote: m[2] } : null;
}

/**
 * How many USD one unit of `quote` currency is worth, from live data.
 * `pairPrice` is the pair's own price, used directly when the base is USD.
 * Returns null if no real rate is available.
 */
export async function quoteToUsdRate(symbol: string, pairPrice: number): Promise<number | null> {
  const pair = parseFxPair(symbol);
  if (!pair) return null;
  if (pair.quote === 'USD') return 1;
  if (pair.base === 'USD') return pairPrice > 0 ? 1 / pairPrice : null;

  // Cross pair: convert the quote currency through its USD pair.
  const direct = `${pair.quote}USD=X`; // e.g. GBPUSD=X, AUDUSD=X, NZDUSD=X
  const inverse = `USD${pair.quote}=X`; // e.g. USDJPY=X, USDCHF=X, USDCAD=X
  if (isForexSymbol(direct)) {
    const q = await fetchLiveQuote(direct);
    return q.price != null && !q.stale && q.price > 0 ? q.price : null;
  }
  if (isForexSymbol(inverse)) {
    const q = await fetchLiveQuote(inverse);
    return q.price != null && !q.stale && q.price > 0 ? 1 / q.price : null;
  }
  return null;
}

/**
 * USD value of a 1.00 price move for ONE contract of `symbol` at `price`.
 * Non-FX instruments return their configured point value unchanged.
 * FX returns null when the needed live rate is unavailable (callers should
 * refuse the trade rather than guess).
 */
export async function resolveTradePointValue(
  symbol: string,
  price: number,
  dbPointValue?: number | null,
): Promise<number | null> {
  const base = getPointValue(symbol, dbPointValue);
  if (!isForexSymbol(symbol)) return base;
  const rate = await quoteToUsdRate(symbol, price);
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return null;
  return Math.round(base * rate * 1e6) / 1e6;
}
