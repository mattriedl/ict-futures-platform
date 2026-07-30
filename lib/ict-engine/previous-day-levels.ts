import { OHLCVBar, ICTPattern } from './types';

/**
 * Previous Day High/Low (PDH/PDL) and Previous Week High/Low (PWH/PWL)
 *
 * These are key reference levels in ICT methodology.
 * Price often targets these levels as liquidity rests at obvious highs/lows.
 * Traders who buy/sell breakouts of these levels become trapped when price reverses.
 */
export function detectPreviousDayLevels(bars: OHLCVBar[]): ICTPattern[] {
  const patterns: ICTPattern[] = [];
  if ((bars?.length ?? 0) < 5) return patterns;

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // Find daily boundaries
  type DayData = { high: number; low: number; open: number; close: number; date: number };
  const days: DayData[] = [];
  let currentDayNum = -1;
  let dayHigh = -Infinity;
  let dayLow  = Infinity;
  let dayOpen = 0;
  let dayClose = 0;

  for (const bar of bars) {
    if (!bar) continue;
    const dayNum = Math.floor(bar.timestamp / ONE_DAY_MS);
    if (dayNum !== currentDayNum) {
      if (currentDayNum !== -1 && dayHigh > -Infinity) {
        days.push({ high: dayHigh, low: dayLow, open: dayOpen, close: dayClose, date: currentDayNum });
      }
      currentDayNum = dayNum;
      dayHigh = bar.high ?? 0;
      dayLow  = bar.low  ?? Infinity;
      dayOpen = bar.open ?? 0;
      dayClose = bar.close ?? 0;
    } else {
      dayHigh  = Math.max(dayHigh,  bar.high  ?? 0);
      dayLow   = Math.min(dayLow,   bar.low   ?? Infinity);
      dayClose = bar.close ?? 0;
    }
  }

  if (days.length < 2) return patterns;

  // Previous Day High / Low
  const prevDay = days[days.length - 1];
  const lastBar = bars[bars.length - 1];
  if (!prevDay || !lastBar) return patterns;

  const currentPrice = lastBar.close ?? 0;

  // PDH: previous day high — acts as resistance, breakout trap
  const pdhDist = Math.abs(currentPrice - prevDay.high) / (prevDay.high || 1);
  patterns.push({
    type:        'PDH_PDL',
    direction:   currentPrice > prevDay.high ? 'BULLISH' : 'BEARISH',
    priceLevel:  prevDay.high,
    upperBound:  prevDay.high * 1.001,
    lowerBound:  prevDay.high * 0.999,
    confidence:  pdhDist < 0.005 ? 80 : 60, // Higher confidence if near the level
    description: `Previous Day High (PDH) at ${prevDay.high.toFixed(2)}. ${currentPrice > prevDay.high ? 'Price is above PDH — buy-side liquidity was swept. Watch for reversal.' : `Price approaching PDH from below at ${((pdhDist * 100).toFixed(2))}% away. Buy-side liquidity rests here.`}`,
    startIndex:  Math.max(0, bars.length - 50),
    endIndex:    bars.length - 1,
  });

  // PDL: previous day low — acts as support, breakdown trap
  const pdlDist = Math.abs(currentPrice - prevDay.low) / (prevDay.low || 1);
  patterns.push({
    type:        'PDH_PDL',
    direction:   currentPrice < prevDay.low ? 'BEARISH' : 'BULLISH',
    priceLevel:  prevDay.low,
    upperBound:  prevDay.low * 1.001,
    lowerBound:  prevDay.low * 0.999,
    confidence:  pdlDist < 0.005 ? 80 : 60,
    description: `Previous Day Low (PDL) at ${prevDay.low.toFixed(2)}. ${currentPrice < prevDay.low ? 'Price is below PDL — sell-side liquidity was swept. Watch for reversal.' : `Price approaching PDL from above at ${((pdlDist * 100).toFixed(2))}% away. Sell-side liquidity rests here.`}`,
    startIndex:  Math.max(0, bars.length - 50),
    endIndex:    bars.length - 1,
  });

  // Previous Week High/Low (if we have enough data)
  if (days.length >= 5) {
    const ONE_WEEK_MS = 7 * ONE_DAY_MS;
    let weekHigh = -Infinity;
    let weekLow  = Infinity;
    const weekAgo = (lastBar.timestamp - ONE_WEEK_MS) / ONE_DAY_MS;
    let foundPrevWeek = false;

    for (const day of days) {
      if (day.date >= weekAgo - 7 && day.date < weekAgo) {
        weekHigh = Math.max(weekHigh, day.high);
        weekLow  = Math.min(weekLow,  day.low);
        foundPrevWeek = true;
      }
    }

    if (foundPrevWeek && weekHigh > -Infinity) {
      patterns.push({
        type:        'PDH_PDL',
        direction:   'BEARISH',
        priceLevel:  weekHigh,
        upperBound:  weekHigh * 1.001,
        lowerBound:  weekHigh * 0.999,
        confidence:  55,
        description: `Previous Week High (PWH) at ${weekHigh.toFixed(2)}. Major reference level — buy-side liquidity pool. ICT: weekly highs are frequent targets for institutional stop hunts.`,
        startIndex:  Math.max(0, bars.length - 100),
        endIndex:    bars.length - 1,
      });

      patterns.push({
        type:        'PDH_PDL',
        direction:   'BULLISH',
        priceLevel:  weekLow,
        upperBound:  weekLow * 1.001,
        lowerBound:  weekLow * 0.999,
        confidence:  55,
        description: `Previous Week Low (PWL) at ${weekLow.toFixed(2)}. Major reference level — sell-side liquidity pool. ICT: weekly lows are frequent targets for institutional stop hunts.`,
        startIndex:  Math.max(0, bars.length - 100),
        endIndex:    bars.length - 1,
      });
    }
  }

  return patterns;
}
