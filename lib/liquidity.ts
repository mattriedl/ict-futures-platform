// ---------------------------------------------------------------------------
// Liquidity & slippage analysis.
//
// Two distinct capabilities:
//   1. LIVE order-book slippage (crypto only) — walks the current OKX/Kraken
//      book to estimate the average fill price, slippage % and fill confidence
//      for an intended position size. Reflects the book AT THIS MOMENT.
//   2. Volume-based liquidity ESTIMATE (backtests) — historical order-book
//      depth is not available, so we approximate participation from traded
//      candle volume. Clearly labeled as an approximation, not a guaranteed fill.
// ---------------------------------------------------------------------------

import type { OHLCVBar } from '@/lib/yahoo-finance';
import { fetchCryptoOrderBook, type OrderBookLevel } from '@/lib/crypto-feed';
import { isCryptoSymbol, getCryptoMeta } from '@/lib/crypto-instruments';

// ---------------------------------------------------------------------------
// 1. LIVE order-book slippage
// ---------------------------------------------------------------------------

export type FillConfidence = 'GOOD' | 'PARTIAL' | 'HIGH_SLIPPAGE' | 'INSUFFICIENT';

export interface LiveLiquidityResult {
  supported: boolean;               // false for non-crypto (no live book)
  symbol: string;
  exchange?: string;
  side: 'BUY' | 'SELL';
  intendedSize: number;             // coins
  intendedNotionalUsd: number;
  bestPrice: number;
  avgFillPrice: number;
  slippagePercent: number;          // avg fill vs best price, absolute %
  filledSize: number;
  fillRatio: number;                // 0..1
  fullyFillable: boolean;
  levelsWalked: number;
  zoneLiquidityUsd: number | null;  // book depth available inside [zoneLow,zoneHigh]
  confidence: FillConfidence;
  note: string;
  ts: number;
}

export interface LiveLiquidityOptions {
  zoneLow?: number;   // optional price zone to measure available depth within
  zoneHigh?: number;
}

function walkBook(levels: OrderBookLevel[], size: number) {
  let filled = 0;
  let cost = 0;
  let walked = 0;
  for (const lvl of levels) {
    if (filled >= size) break;
    const take = Math.min(lvl.size, size - filled);
    cost += take * lvl.price;
    filled += take;
    walked++;
  }
  return { filled, cost, walked };
}

function classify(fullyFillable: boolean, slippagePercent: number, fillRatio: number): FillConfidence {
  if (!fullyFillable) return fillRatio >= 0.85 ? 'PARTIAL' : 'INSUFFICIENT';
  if (slippagePercent <= 0.2) return 'GOOD';
  if (slippagePercent <= 0.75) return 'PARTIAL';
  return 'HIGH_SLIPPAGE';
}

const CONFIDENCE_NOTE: Record<FillConfidence, string> = {
  GOOD: 'Ample resting liquidity — the intended size fills with minimal slippage.',
  PARTIAL: 'Moderate slippage — the order walks several book levels to fill this size.',
  HIGH_SLIPPAGE: 'High slippage — filling this size moves price significantly. Consider reducing size.',
  INSUFFICIENT: 'The live book cannot fully absorb this size right now. Expect partial fills / large slippage.',
};

/**
 * Live order-book slippage for an intended size (in COINS) on a crypto symbol.
 * Non-crypto symbols return { supported: false }.
 */
export async function computeLiveLiquidity(
  symbol: string,
  side: 'BUY' | 'SELL',
  size: number,
  opts: LiveLiquidityOptions = {},
): Promise<LiveLiquidityResult> {
  const base: LiveLiquidityResult = {
    supported: false, symbol, side, intendedSize: size, intendedNotionalUsd: 0,
    bestPrice: 0, avgFillPrice: 0, slippagePercent: 0, filledSize: 0, fillRatio: 0,
    fullyFillable: false, levelsWalked: 0, zoneLiquidityUsd: null,
    confidence: 'INSUFFICIENT', note: '', ts: Date.now(),
  };

  if (!isCryptoSymbol(symbol)) {
    return { ...base, note: 'Live order-book depth is only available for crypto spot instruments.' };
  }
  if (!(size > 0)) {
    return { ...base, supported: true, note: 'Enter a position size to estimate slippage.' };
  }

  let book;
  try {
    book = await fetchCryptoOrderBook(symbol);
  } catch (err) {
    return { ...base, supported: true, note: `Could not fetch live order book: ${(err as Error)?.message ?? 'error'}.` };
  }
  if (!book) return { ...base, supported: true, note: 'Order book unavailable.' };

  const levels = side === 'BUY' ? book.asks : book.bids;
  if (levels.length === 0) return { ...base, supported: true, exchange: book.exchange, note: 'Empty order book side.' };

  const bestPrice = levels[0].price;
  const { filled, cost, walked } = walkBook(levels, size);
  const fullyFillable = filled >= size - 1e-12;
  const avgFillPrice = filled > 0 ? cost / filled : bestPrice;
  const slippagePercent = bestPrice > 0 ? Math.abs((avgFillPrice - bestPrice) / bestPrice) * 100 : 0;
  const fillRatio = size > 0 ? Math.min(1, filled / size) : 0;

  // Optional: total resting liquidity (USD) inside the requested price zone.
  let zoneLiquidityUsd: number | null = null;
  if (opts.zoneLow != null && opts.zoneHigh != null) {
    const lo = Math.min(opts.zoneLow, opts.zoneHigh);
    const hi = Math.max(opts.zoneLow, opts.zoneHigh);
    let usd = 0;
    for (const side2 of [book.asks, book.bids]) {
      for (const lvl of side2) {
        if (lvl.price >= lo && lvl.price <= hi) usd += lvl.price * lvl.size;
      }
    }
    zoneLiquidityUsd = round2(usd);
  }

  const confidence = classify(fullyFillable, slippagePercent, fillRatio);

  return {
    supported: true,
    symbol,
    exchange: book.exchange,
    side,
    intendedSize: size,
    intendedNotionalUsd: round2(size * avgFillPrice),
    bestPrice,
    avgFillPrice: round6(avgFillPrice),
    slippagePercent: round4(slippagePercent),
    filledSize: round6(filled),
    fillRatio: round4(fillRatio),
    fullyFillable,
    levelsWalked: walked,
    zoneLiquidityUsd,
    confidence,
    note: CONFIDENCE_NOTE[confidence],
    ts: book.ts,
  };
}

// ---------------------------------------------------------------------------
// 2. Volume-based liquidity ESTIMATE (for backtests)
// ---------------------------------------------------------------------------

export type LiquidityRating = 'AMPLE' | 'MODERATE' | 'THIN';

export interface LiquidityEstimate {
  approximate: true;                  // ALWAYS true — never a guaranteed fill
  intendedNotionalUsd: number;
  avgBarNotionalUsd: number;          // mean traded value per candle (volume x price)
  participationPercent: number;       // intended size as % of one candle's traded value
  rating: LiquidityRating;
  note: string;
}

function ratingFor(participationPercent: number): LiquidityRating {
  if (participationPercent <= 1) return 'AMPLE';
  if (participationPercent <= 5) return 'MODERATE';
  return 'THIN';
}

/**
 * Approximate liquidity from traded candle volume. Historical order-book depth
 * is NOT available, so we compare the intended notional against the average
 * traded value per candle. Returns null when volume data is missing.
 */
export function estimateVolumeLiquidity(
  bars: Pick<OHLCVBar, 'close' | 'volume'>[],
  price: number,
  intendedNotionalUsd: number,
  lookback = 20,
): LiquidityEstimate | null {
  if (!bars || bars.length === 0 || !(price > 0)) return null;
  const recent = bars.slice(-lookback).filter((b) => (b?.volume ?? 0) > 0);
  if (recent.length === 0) return null;

  const avgBarVolume = recent.reduce((s, b) => s + (b.volume ?? 0), 0) / recent.length;
  const avgBarNotionalUsd = avgBarVolume * price;
  if (!(avgBarNotionalUsd > 0)) return null;

  const participationPercent = (intendedNotionalUsd / avgBarNotionalUsd) * 100;
  const rating = ratingFor(participationPercent);

  return {
    approximate: true,
    intendedNotionalUsd: round2(intendedNotionalUsd),
    avgBarNotionalUsd: round2(avgBarNotionalUsd),
    participationPercent: round2(participationPercent),
    rating,
    note:
      'Approximation from traded candle volume — historical order-book depth is not available, ' +
      'so this is an estimate of fill difficulty, not a guaranteed fill.',
  };
}

// ---------------------------------------------------------------------------

function round2(n: number) { return Math.round(n * 100) / 100; }
function round4(n: number) { return Math.round(n * 1e4) / 1e4; }
function round6(n: number) { return Math.round(n * 1e6) / 1e6; }

export { isCryptoSymbol, getCryptoMeta };
