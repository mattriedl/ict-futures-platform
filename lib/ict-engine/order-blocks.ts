import { OHLCVBar, ICTPattern } from './types';

export function detectOrderBlocks(bars: OHLCVBar[]): ICTPattern[] {
  const patterns: ICTPattern[] = [];
  if ((bars?.length ?? 0) < 5) return patterns;

  for (let i = 2; i < bars.length - 2; i++) {
    const prev = bars[i - 1];
    const curr = bars[i];
    const next1 = bars[i + 1];
    const next2 = bars[i + 2];
    if (!prev || !curr || !next1 || !next2) continue;

    const prevBody = Math.abs((prev?.close ?? 0) - (prev?.open ?? 0));
    const currBody = Math.abs((curr?.close ?? 0) - (curr?.open ?? 0));
    const nextBody = Math.abs((next1?.close ?? 0) - (next1?.open ?? 0));

    // Bullish OB: bearish candle followed by strong bullish move
    if ((curr?.close ?? 0) < (curr?.open ?? 0) && (next1?.close ?? 0) > (next1?.open ?? 0) && nextBody > currBody * 1.5) {
      if ((next2?.close ?? 0) > (next1?.close ?? 0)) {
        patterns.push({
          type: 'ORDER_BLOCK',
          direction: 'BULLISH',
          priceLevel: (curr?.low ?? 0),
          upperBound: curr?.open ?? 0,
          lowerBound: curr?.low ?? 0,
          confidence: Math.min(90, 50 + (nextBody / (currBody || 1)) * 10),
          description: `Bullish Order Block detected. Last bearish candle before strong bullish impulse. Zone: ${(curr?.low ?? 0).toFixed(2)} - ${(curr?.open ?? 0).toFixed(2)}`,
          startIndex: i,
          endIndex: i + 2,
        });
      }
    }

    // Bearish OB: bullish candle followed by strong bearish move
    if ((curr?.close ?? 0) > (curr?.open ?? 0) && (next1?.close ?? 0) < (next1?.open ?? 0) && nextBody > currBody * 1.5) {
      if ((next2?.close ?? 0) < (next1?.close ?? 0)) {
        patterns.push({
          type: 'ORDER_BLOCK',
          direction: 'BEARISH',
          priceLevel: (curr?.high ?? 0),
          upperBound: curr?.high ?? 0,
          lowerBound: curr?.open ?? 0,
          confidence: Math.min(90, 50 + (nextBody / (currBody || 1)) * 10),
          description: `Bearish Order Block detected. Last bullish candle before strong bearish impulse. Zone: ${(curr?.open ?? 0).toFixed(2)} - ${(curr?.high ?? 0).toFixed(2)}`,
          startIndex: i,
          endIndex: i + 2,
        });
      }
    }
  }

  return patterns;
}
