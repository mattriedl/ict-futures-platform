import { OHLCVBar, ICTPattern } from './types';

/**
 * New Day Opening Gap (NDOG) / New Week Opening Gap (NWOG)
 * These gaps between session opens and prior closes act as price magnets.
 * ICT: price is "drawn" to fill these gaps as part of the trading range expansion.
 */
export function detectOpeningGaps(bars: OHLCVBar[]): ICTPattern[] {
  const patterns: ICTPattern[] = [];
  if ((bars?.length ?? 0) < 5) return patterns;

  const ONE_DAY_MS  = 24 * 60 * 60 * 1000;
  const ONE_WEEK_MS = 7  * ONE_DAY_MS;

  // Detect day and week boundaries
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1];
    const curr = bars[i];
    if (!prev || !curr) continue;

    const prevDate = new Date(prev.timestamp);
    const currDate = new Date(curr.timestamp);

    const timeDiff    = curr.timestamp - prev.timestamp;
    const prevDay     = prevDate.getDay(); // 0=Sun, 5=Fri, 6=Sat
    const currDay     = currDate.getDay();
    const prevDayNum  = Math.floor(prev.timestamp / ONE_DAY_MS);
    const currDayNum  = Math.floor(curr.timestamp / ONE_DAY_MS);

    const isNewDay  = currDayNum > prevDayNum && timeDiff > 3_600_000; // >1h gap
    const isNewWeek = (prevDay === 5 || prevDay === 6) && currDay === 1; // Fri→Mon

    if (isNewDay || isNewWeek) {
      const gapSize = curr.open - prev.close;
      if (Math.abs(gapSize) < (prev.close * 0.0005)) continue; // Skip tiny gaps < 0.05%

      const direction = gapSize > 0 ? 'BULLISH' : 'BEARISH';
      const gapType   = isNewWeek ? 'NWOG' : 'NDOG';
      const gapPct    = ((Math.abs(gapSize) / prev.close) * 100).toFixed(3);

      const upper = Math.max(curr.open, prev.close);
      const lower = Math.min(curr.open, prev.close);

      patterns.push({
        type:        'NDOG_NWOG',
        direction,
        priceLevel:  (upper + lower) / 2,
        upperBound:  upper,
        lowerBound:  lower,
        confidence:  isNewWeek ? 78 : 65,
        description: `${gapType} — ${direction} gap of ${gapPct}% between ${prev.close.toFixed(2)} (prev ${isNewWeek ? 'week' : 'day'} close) and ${curr.open.toFixed(2)} (current open). These gaps are price magnets; expect a return to fill the gap zone ${lower.toFixed(2)}–${upper.toFixed(2)}.`,
        startIndex:  i - 1,
        endIndex:    i,
      });
    }
  }

  // Only keep the 3 most recent gaps (they become less relevant over time)
  return patterns.slice(-3);
}
