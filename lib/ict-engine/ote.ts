import { OHLCVBar, ICTPattern } from './types';

export function detectOTE(bars: OHLCVBar[]): ICTPattern[] {
  const patterns: ICTPattern[] = [];
  if ((bars?.length ?? 0) < 20) return patterns;

  // Find the most recent significant swing
  let swingHigh = -Infinity;
  let swingLow = Infinity;
  let shIdx = 0;
  let slIdx = 0;

  const lookback = Math.min(bars.length, 50);
  for (let i = bars.length - lookback; i < bars.length; i++) {
    const bar = bars[i];
    if (!bar) continue;
    if ((bar?.high ?? 0) > swingHigh) { swingHigh = bar?.high ?? 0; shIdx = i; }
    if ((bar?.low ?? 0) < swingLow) { swingLow = bar?.low ?? 0; slIdx = i; }
  }

  const range = swingHigh - swingLow;
  if (range <= 0) return patterns;

  const fib618 = swingHigh - range * 0.618;
  const fib705 = swingHigh - range * 0.705;
  const fib786 = swingHigh - range * 0.786;
  const fib50 = swingHigh - range * 0.5;

  const lastBar = bars[bars.length - 1];
  const lastPrice = lastBar?.close ?? 0;

  // Bullish OTE: price is in the 62-79% retracement of an upswing
  if (shIdx > slIdx) {
    // Upswing - looking for retracement (discount)
    if (lastPrice >= fib786 && lastPrice <= fib618) {
      patterns.push({
        type: 'OTE',
        direction: 'BULLISH',
        priceLevel: fib705,
        upperBound: fib618,
        lowerBound: fib786,
        confidence: 80,
        description: `Bullish Optimal Trade Entry. Price is in the 62-79% retracement zone (${fib786.toFixed(2)} - ${fib618.toFixed(2)}) of the recent upswing. Sweet spot at ${fib705.toFixed(2)} (70.5%).`,
        startIndex: slIdx,
        endIndex: shIdx,
      });
    }
  }

  // Bearish OTE: price is in the 62-79% retracement of a downswing
  if (slIdx > shIdx) {
    const bearFib618 = swingLow + range * 0.618;
    const bearFib705 = swingLow + range * 0.705;
    const bearFib786 = swingLow + range * 0.786;

    if (lastPrice >= bearFib618 && lastPrice <= bearFib786) {
      patterns.push({
        type: 'OTE',
        direction: 'BEARISH',
        priceLevel: bearFib705,
        upperBound: bearFib786,
        lowerBound: bearFib618,
        confidence: 80,
        description: `Bearish Optimal Trade Entry. Price is in the 62-79% retracement zone (${bearFib618.toFixed(2)} - ${bearFib786.toFixed(2)}) of the recent downswing. Sweet spot at ${bearFib705.toFixed(2)} (70.5%).`,
        startIndex: shIdx,
        endIndex: slIdx,
      });
    }
  }

  // Also add premium/discount info
  if (lastPrice > fib50) {
    patterns.push({
      type: 'PREMIUM_DISCOUNT',
      direction: 'BEARISH',
      priceLevel: fib50,
      confidence: 60,
      description: `Price is in PREMIUM zone (above 50% equilibrium at ${fib50.toFixed(2)}). Favor sell setups in premium.`,
      startIndex: slIdx,
      endIndex: shIdx,
    });
  } else {
    patterns.push({
      type: 'PREMIUM_DISCOUNT',
      direction: 'BULLISH',
      priceLevel: fib50,
      confidence: 60,
      description: `Price is in DISCOUNT zone (below 50% equilibrium at ${fib50.toFixed(2)}). Favor buy setups in discount.`,
      startIndex: slIdx,
      endIndex: shIdx,
    });
  }

  return patterns;
}
