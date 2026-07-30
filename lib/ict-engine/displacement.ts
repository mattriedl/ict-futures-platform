import { OHLCVBar, ICTPattern } from './types';

/**
 * Displacement
 * A strong, decisive candle that represents institutional order flow entering the market.
 * Criteria: body > 2.5x the 10-bar average body AND closes at 85%+ of its range in the direction of move.
 * Displacements often leave behind Fair Value Gaps and signal the start of a new impulse leg.
 */
export function detectDisplacement(bars: OHLCVBar[]): ICTPattern[] {
  const patterns: ICTPattern[] = [];
  if ((bars?.length ?? 0) < 15) return patterns;

  for (let i = 10; i < bars.length; i++) {
    const bar = bars[i];
    if (!bar) continue;

    const body  = Math.abs((bar?.close ?? 0) - (bar?.open ?? 0));
    const range = (bar?.high ?? 0) - (bar?.low ?? 0);
    if (range <= 0 || body <= 0) continue;

    // Calculate average body over last 10 bars
    const avgBody = bars.slice(i - 10, i).reduce((sum, b) => {
      return sum + Math.abs((b?.close ?? 0) - (b?.open ?? 0));
    }, 0) / 10;

    if (avgBody <= 0) continue;

    const isBullish  = (bar?.close ?? 0) > (bar?.open ?? 0);
    const closeRatio = isBullish
      ? ((bar?.close ?? 0) - (bar?.low  ?? 0)) / range  // how close to high
      : ((bar?.high ?? 0) - (bar?.close ?? 0)) / range; // how close to low

    // Must be: body > 2.5x average AND closes at 85%+ of range in direction
    if (body > avgBody * 2.5 && closeRatio >= 0.85) {
      const direction = isBullish ? 'BULLISH' : 'BEARISH';
      const bodyRatio = (body / avgBody).toFixed(1);

      // Only add if not too similar to a recent displacement (avoid duplicates)
      const recentSame = patterns.slice(-3).some(p =>
        p.type === 'DISPLACEMENT' && Math.abs(p.priceLevel - (bar?.close ?? 0)) / (bar?.close ?? 1) < 0.005
      );
      if (recentSame) continue;

      patterns.push({
        type:        'DISPLACEMENT',
        direction,
        priceLevel:  bar?.close ?? 0,
        upperBound:  bar?.high  ?? 0,
        lowerBound:  bar?.low   ?? 0,
        confidence:  Math.min(92, 70 + Math.floor((body / avgBody - 2.5) * 10)),
        description: `${direction} Displacement detected. Candle body is ${bodyRatio}x the average — clear sign of institutional order flow. ${direction === 'BULLISH' ? 'Smart money absorbing sell-side liquidity' : 'Smart money distributing into buy-side liquidity'}. Price: ${(bar?.close ?? 0).toFixed(2)}`,
        startIndex:  i,
        endIndex:    i,
      });
    }
  }

  // Return only the most recent 5 displacements to avoid chart noise
  return patterns.slice(-5);
}
