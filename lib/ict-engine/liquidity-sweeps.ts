import { OHLCVBar, ICTPattern } from './types';

export function detectLiquiditySweeps(bars: OHLCVBar[]): ICTPattern[] {
  const patterns: ICTPattern[] = [];
  if ((bars?.length ?? 0) < 20) return patterns;

  // Find swing highs and lows (looking back 10 bars)
  const swingHighs: { index: number; price: number }[] = [];
  const swingLows: { index: number; price: number }[] = [];

  for (let i = 5; i < bars.length - 5; i++) {
    const bar = bars[i];
    if (!bar) continue;
    let isSwingHigh = true;
    let isSwingLow = true;

    for (let j = i - 5; j <= i + 5; j++) {
      if (j === i) continue;
      const cmp = bars[j];
      if (!cmp) continue;
      if ((cmp?.high ?? 0) >= (bar?.high ?? 0)) isSwingHigh = false;
      if ((cmp?.low ?? 0) <= (bar?.low ?? 0)) isSwingLow = false;
    }

    if (isSwingHigh) swingHighs.push({ index: i, price: bar?.high ?? 0 });
    if (isSwingLow) swingLows.push({ index: i, price: bar?.low ?? 0 });
  }

  // Check recent bars for sweeps of previous swing points
  const recentBars = bars.slice(-10);
  const startIdx = bars.length - 10;

  for (const sh of swingHighs) {
    for (let ri = 0; ri < recentBars.length; ri++) {
      const bar = recentBars[ri];
      if (!bar) continue;
      if ((bar?.high ?? 0) > sh.price && (bar?.close ?? 0) < sh.price) {
        patterns.push({
          type: 'LIQUIDITY_SWEEP',
          direction: 'BEARISH',
          priceLevel: sh.price,
          confidence: 75,
          description: `Buy-side liquidity sweep. Price swept above swing high at ${sh.price.toFixed(2)} then closed back below, trapping buyers.`,
          startIndex: sh.index,
          endIndex: startIdx + ri,
        });
        break;
      }
    }
  }

  for (const sl of swingLows) {
    for (let ri = 0; ri < recentBars.length; ri++) {
      const bar = recentBars[ri];
      if (!bar) continue;
      if ((bar?.low ?? 0) < sl.price && (bar?.close ?? 0) > sl.price) {
        patterns.push({
          type: 'LIQUIDITY_SWEEP',
          direction: 'BULLISH',
          priceLevel: sl.price,
          confidence: 75,
          description: `Sell-side liquidity sweep. Price swept below swing low at ${sl.price.toFixed(2)} then closed back above, trapping sellers.`,
          startIndex: sl.index,
          endIndex: startIdx + ri,
        });
        break;
      }
    }
  }

  return patterns;
}
