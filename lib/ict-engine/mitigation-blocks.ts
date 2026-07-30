import { OHLCVBar, ICTPattern } from './types';

export function detectMitigationBlocks(bars: OHLCVBar[]): ICTPattern[] {
  const patterns: ICTPattern[] = [];
  if ((bars?.length ?? 0) < 15) return patterns;

  // Find unmitigated OBs that price is approaching
  for (let i = 2; i < bars.length - 5; i++) {
    const curr = bars[i];
    const next = bars[i + 1];
    if (!curr || !next) continue;

    const currBody = Math.abs((curr?.close ?? 0) - (curr?.open ?? 0));
    const nextBody = Math.abs((next?.close ?? 0) - (next?.open ?? 0));

    // Bullish OB not yet mitigated
    if ((curr?.close ?? 0) < (curr?.open ?? 0) && nextBody > currBody * 1.5 && (next?.close ?? 0) > (next?.open ?? 0)) {
      const obHigh = curr?.open ?? 0;
      const obLow = curr?.low ?? 0;

      // Check if any bar from i+2 to end touched this zone
      let mitigated = false;
      for (let j = i + 2; j < bars.length; j++) {
        const testBar = bars[j];
        if (!testBar) continue;
        if ((testBar?.low ?? 0) <= obHigh && (testBar?.low ?? 0) >= obLow) {
          mitigated = true;
          // Check if this is recent (last 5 bars)
          if (j >= bars.length - 5) {
            patterns.push({
              type: 'MITIGATION_BLOCK',
              direction: 'BULLISH',
              priceLevel: (obHigh + obLow) / 2,
              upperBound: obHigh,
              lowerBound: obLow,
              confidence: 70,
              description: `Bullish Mitigation Block. Price is testing a previously unmitigated bullish order block at ${obLow.toFixed(2)} - ${obHigh.toFixed(2)}. Potential support.`,
              startIndex: i,
              endIndex: j,
            });
          }
          break;
        }
      }
    }
  }

  return patterns;
}
