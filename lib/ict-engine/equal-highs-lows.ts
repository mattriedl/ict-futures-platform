import { OHLCVBar, ICTPattern } from './types';

/**
 * Equal Highs (EQH) / Equal Lows (EQL)
 * These represent liquidity pools where stop-losses cluster.
 * ICT views them as targets for price to sweep before reversing.
 */
export function detectEqualHighsLows(bars: OHLCVBar[]): ICTPattern[] {
  const patterns: ICTPattern[] = [];
  if ((bars?.length ?? 0) < 10) return patterns;

  const TOLERANCE = 0.0015; // 0.15% tolerance for "equal"

  // Find swing highs and lows
  const swingHighs: { index: number; price: number }[] = [];
  const swingLows:  { index: number; price: number }[] = [];

  for (let i = 3; i < bars.length - 3; i++) {
    const b = bars[i];
    if (!b) continue;

    let isHigh = true;
    let isLow  = true;
    for (let j = i - 3; j <= i + 3; j++) {
      if (j === i) continue;
      const c = bars[j];
      if (!c) continue;
      if ((c?.high ?? 0) >= (b?.high ?? 0)) isHigh = false;
      if ((c?.low  ?? 0) <= (b?.low  ?? 0)) isLow  = false;
    }

    if (isHigh) swingHighs.push({ index: i, price: b.high ?? 0 });
    if (isLow)  swingLows.push({  index: i, price: b.low  ?? 0 });
  }

  // Group equal highs
  const usedHighIdx = new Set<number>();
  for (let i = 0; i < swingHighs.length; i++) {
    if (usedHighIdx.has(i)) continue;
    const group = [swingHighs[i]];
    for (let j = i + 1; j < swingHighs.length; j++) {
      const diff = Math.abs(swingHighs[j].price - swingHighs[i].price) / (swingHighs[i].price || 1);
      if (diff <= TOLERANCE) {
        group.push(swingHighs[j]);
        usedHighIdx.add(j);
      }
    }
    if (group.length >= 2) {
      const avgPrice = group.reduce((s, g) => s + g.price, 0) / group.length;
      const lastIdx  = Math.max(...group.map(g => g.index));
      patterns.push({
        type:        'EQ_HIGHS_LOWS',
        direction:   'BEARISH', // EQH = buy-side liquidity = bearish target (smart money sweeps up then sells)
        priceLevel:  avgPrice,
        upperBound:  avgPrice * (1 + TOLERANCE),
        lowerBound:  avgPrice * (1 - TOLERANCE),
        confidence:  65 + Math.min(25, group.length * 8),
        description: `Equal Highs (EQH) at ${avgPrice.toFixed(2)} — ${group.length} equal swing highs. Buy-side liquidity resting above. ICT: expect price to sweep this level and reverse bearish.`,
        startIndex:  group[0].index,
        endIndex:    lastIdx,
      });
    }
  }

  // Group equal lows
  const usedLowIdx = new Set<number>();
  for (let i = 0; i < swingLows.length; i++) {
    if (usedLowIdx.has(i)) continue;
    const group = [swingLows[i]];
    for (let j = i + 1; j < swingLows.length; j++) {
      const diff = Math.abs(swingLows[j].price - swingLows[i].price) / (swingLows[i].price || 1);
      if (diff <= TOLERANCE) {
        group.push(swingLows[j]);
        usedLowIdx.add(j);
      }
    }
    if (group.length >= 2) {
      const avgPrice = group.reduce((s, g) => s + g.price, 0) / group.length;
      const lastIdx  = Math.max(...group.map(g => g.index));
      patterns.push({
        type:        'EQ_HIGHS_LOWS',
        direction:   'BULLISH', // EQL = sell-side liquidity = bullish target (smart money sweeps down then buys)
        priceLevel:  avgPrice,
        upperBound:  avgPrice * (1 + TOLERANCE),
        lowerBound:  avgPrice * (1 - TOLERANCE),
        confidence:  65 + Math.min(25, group.length * 8),
        description: `Equal Lows (EQL) at ${avgPrice.toFixed(2)} — ${group.length} equal swing lows. Sell-side liquidity resting below. ICT: expect price to sweep this level and reverse bullish.`,
        startIndex:  group[0].index,
        endIndex:    lastIdx,
      });
    }
  }

  return patterns;
}
