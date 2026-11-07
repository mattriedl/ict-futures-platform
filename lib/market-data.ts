// ---------------------------------------------------------------------------
// Market-data dispatcher.
//
// Single entry point for OHLCV data that routes each symbol to the right feed:
//   - crypto spot symbols (OKX / KRAKEN)  -> lib/crypto-feed.ts (REAL data only)
//   - everything else (CME futures, etc.) -> lib/yahoo-finance.ts
//
// Keeps the change surgical: existing call sites just swap
// fetchYahooFinanceData -> fetchMarketData and fetchHistoricalData ->
// fetchMarketHistorical. The ICT engine is market-agnostic and untouched.
// ---------------------------------------------------------------------------

import {
  fetchYahooFinanceData,
  fetchYahooFinanceDataWithMeta,
  fetchHistoricalData,
  getCurrentPrice as _getCurrentPrice,
  type OHLCVBar,
  type HistoricalResult,
  type MarketDataResult,
} from '@/lib/yahoo-finance';
import { isCryptoSymbol } from '@/lib/crypto-instruments';
import { fetchCryptoData, fetchCryptoHistorical } from '@/lib/crypto-feed';

export type { OHLCVBar, HistoricalResult, MarketDataResult };
export const getCurrentPrice = _getCurrentPrice;

/** Recent candles for any supported symbol (futures or crypto). */
export async function fetchMarketData(symbol: string, timeframe: string = '15m'): Promise<OHLCVBar[]> {
  if (isCryptoSymbol(symbol)) {
    return fetchCryptoData(symbol, timeframe);
  }
  return fetchYahooFinanceData(symbol, timeframe);
}

/**
 * Like fetchMarketData but also reports whether the bars are synthetic and the
 * data source. Crypto is REAL-only (fetchCryptoData never fabricates bars) so
 * synthetic is always false for crypto; futures/FX go through Yahoo which may
 * fall back to synthetic — that flag is surfaced here so callers requiring real
 * data (the demo-trade resolver) can refuse to act on it.
 */
export async function fetchMarketDataWithMeta(
  symbol: string,
  timeframe: string = '15m',
): Promise<MarketDataResult> {
  if (isCryptoSymbol(symbol)) {
    const bars = await fetchCryptoData(symbol, timeframe);
    return { bars, synthetic: false, source: 'crypto' };
  }
  return fetchYahooFinanceDataWithMeta(symbol, timeframe);
}

/** Historical candles for backtests. Crypto never returns synthetic bars. */
export async function fetchMarketHistorical(
  symbol: string,
  timeframe: string = '15m',
  days: number = 60,
): Promise<HistoricalResult> {
  if (isCryptoSymbol(symbol)) {
    const { bars, synthetic, clampedDays } = await fetchCryptoHistorical(symbol, timeframe, days);
    return { bars, synthetic, clampedDays };
  }
  return fetchHistoricalData(symbol, timeframe, days);
}
