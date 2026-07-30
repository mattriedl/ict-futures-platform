import { OHLCVBar, ICTPattern } from './types';

export function detectBreakerBlocks(bars: OHLCVBar[]): ICTPattern[] {
  const patterns: ICTPattern[] = [];
  if ((bars?.length ?? 0) < 10) return patterns;

  for (let i = 3; i < bars.length - 3; i++) {
    const bar = bars[i];
    if (!bar) continue;

    // Look for a failed bullish OB (was bullish, now broken)
    const isBullishCandle = (bar?.close ?? 0) > (bar?.open ?? 0);
    const prevBearish = (bars[i - 1]?.close ?? 0) < (bars[i - 1]?.open ?? 0);
    const nextStrong = Math.abs((bars[i + 1]?.close ?? 0) - (bars[i + 1]?.open ?? 0));
    const currBody = Math.abs((bar?.close ?? 0) - (bar?.open ?? 0));

    if (isBullishCandle && prevBearish && nextStrong > currBody * 2) {
      // Check if price later broke below this OB, making it a breaker
      const laterBars = bars.slice(i + 2, i + 6);
      const broken = laterBars.some((lb: OHLCVBar) => (lb?.close ?? 0) < (bar?.low ?? 0));
      if (broken) {
        patterns.push({
          type: 'BREAKER_BLOCK',
          direction: 'BEARISH',
          priceLevel: bar?.high ?? 0,
          upperBound: bar?.high ?? 0,
          lowerBound: bar?.low ?? 0,
          confidence: 65,
          description: `Bearish Breaker Block. Failed bullish order block that has been broken and may now act as resistance. Zone: ${(bar?.low ?? 0).toFixed(2)} - ${(bar?.high ?? 0).toFixed(2)}`,
          startIndex: i,
          endIndex: i + 3,
        });
      }
    }

    // Failed bearish OB
    const isBearishCandle = (bar?.close ?? 0) < (bar?.open ?? 0);
    const prevBullish = (bars[i - 1]?.close ?? 0) > (bars[i - 1]?.open ?? 0);
    if (isBearishCandle && prevBullish && nextStrong > currBody * 2) {
      const laterBars = bars.slice(i + 2, i + 6);
      const broken = laterBars.some((lb: OHLCVBar) => (lb?.close ?? 0) > (bar?.high ?? 0));
      if (broken) {
        patterns.push({
          type: 'BREAKER_BLOCK',
          direction: 'BULLISH',
          priceLevel: bar?.low ?? 0,
          upperBound: bar?.high ?? 0,
          lowerBound: bar?.low ?? 0,
          confidence: 65,
          description: `Bullish Breaker Block. Failed bearish order block that has been broken and may now act as support. Zone: ${(bar?.low ?? 0).toFixed(2)} - ${(bar?.high ?? 0).toFixed(2)}`,
          startIndex: i,
          endIndex: i + 3,
        });
      }
    }
  }

  return patterns;
}
