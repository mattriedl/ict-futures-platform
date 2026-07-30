import { OHLCVBar, ICTPattern } from './types';

export function detectFairValueGaps(bars: OHLCVBar[]): ICTPattern[] {
  const patterns: ICTPattern[] = [];
  if ((bars?.length ?? 0) < 3) return patterns;

  for (let i = 1; i < bars.length - 1; i++) {
    const prev = bars[i - 1];
    const curr = bars[i];
    const next = bars[i + 1];
    if (!prev || !curr || !next) continue;

    // Bullish FVG: gap between candle 1 high and candle 3 low
    const bullGapLow = prev?.high ?? 0;
    const bullGapHigh = next?.low ?? 0;
    if (bullGapHigh > bullGapLow && (curr?.close ?? 0) > (curr?.open ?? 0)) {
      const gapSize = bullGapHigh - bullGapLow;
      const avgRange = ((curr?.high ?? 0) - (curr?.low ?? 0)) || 1;
      patterns.push({
        type: 'FVG',
        direction: 'BULLISH',
        priceLevel: (bullGapLow + bullGapHigh) / 2,
        upperBound: bullGapHigh,
        lowerBound: bullGapLow,
        confidence: Math.min(85, 40 + (gapSize / avgRange) * 30),
        description: `Bullish Fair Value Gap. Imbalance zone: ${bullGapLow.toFixed(2)} - ${bullGapHigh.toFixed(2)}. Price may return to fill this gap.`,
        startIndex: i - 1,
        endIndex: i + 1,
      });
    }

    // Bearish FVG
    const bearGapHigh = prev?.low ?? 0;
    const bearGapLow = next?.high ?? 0;
    if (bearGapHigh > bearGapLow && (curr?.close ?? 0) < (curr?.open ?? 0)) {
      const gapSize = bearGapHigh - bearGapLow;
      const avgRange = ((curr?.high ?? 0) - (curr?.low ?? 0)) || 1;
      patterns.push({
        type: 'FVG',
        direction: 'BEARISH',
        priceLevel: (bearGapLow + bearGapHigh) / 2,
        upperBound: bearGapHigh,
        lowerBound: bearGapLow,
        confidence: Math.min(85, 40 + (gapSize / avgRange) * 30),
        description: `Bearish Fair Value Gap. Imbalance zone: ${bearGapLow.toFixed(2)} - ${bearGapHigh.toFixed(2)}. Price may return to fill this gap.`,
        startIndex: i - 1,
        endIndex: i + 1,
      });
    }
  }

  return patterns;
}
