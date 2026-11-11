import { OHLCVBar, ICTPattern } from './types';

/**
 * Market Structure — BOS, MSS, CHoCH
 *
 * BOS  (Break of Structure):  continuation in SAME direction as trend
 * MSS  (Market Structure Shift): reversal against trend
 * CHoCH (Change of Character): early warning of trend change (lower high in uptrend / higher low in downtrend)
 */
export function detectMarketStructureShifts(bars: OHLCVBar[]): ICTPattern[] {
  const patterns: ICTPattern[] = [];
  if ((bars?.length ?? 0) < 15) return patterns;

  // Identify swing points (local highs/lows using 3-bar window)
  type Swing = { index: number; type: 'HIGH' | 'LOW'; price: number };
  const swings: Swing[] = [];

  for (let i = 3; i < bars.length - 3; i++) {
    const bar = bars[i];
    if (!bar) continue;
    let isHigh = true;
    let isLow  = true;

    for (let j = i - 3; j <= i + 3; j++) {
      if (j === i) continue;
      const cmp = bars[j];
      if (!cmp) continue;
      if ((cmp?.high ?? 0) >= (bar?.high ?? 0)) isHigh = false;
      if ((cmp?.low  ?? 0) <= (bar?.low  ?? 0)) isLow  = false;
    }

    if (isHigh) swings.push({ index: i, type: 'HIGH', price: bar.high ?? 0 });
    if (isLow)  swings.push({ index: i, type: 'LOW',  price: bar.low  ?? 0 });
  }

  if (swings.length < 4) return patterns;

  // Determine overall trend from swing sequence
  const recentSwings = swings.slice(-8);
  const highs  = recentSwings.filter(s => s.type === 'HIGH');
  const lows   = recentSwings.filter(s => s.type === 'LOW');

  // Trend detection: Higher Highs + Higher Lows = uptrend; Lower Highs + Lower Lows = downtrend
  let isUptrend   = false;
  let isDowntrend = false;
  if (highs.length >= 2 && lows.length >= 2) {
    const hhCount  = highs.slice(-2)[1].price > highs.slice(-2)[0].price ? 1 : 0;
    const hlCount  = lows.slice(-2)[1].price  > lows.slice(-2)[0].price  ? 1 : 0;
    const lhCount  = highs.slice(-2)[1].price < highs.slice(-2)[0].price ? 1 : 0;
    const llCount  = lows.slice(-2)[1].price  < lows.slice(-2)[0].price  ? 1 : 0;
    isUptrend   = hhCount > 0 && hlCount > 0;
    isDowntrend = lhCount > 0 && llCount > 0;
  }

  const lastBar = bars[bars.length - 1];
  if (!lastBar) return patterns;

  const recentHighSwings = highs.slice(-3);
  const recentLowSwings  = lows.slice(-3);

  // Index of the first candle after the swing that CLOSED beyond its level —
  // i.e. when the break actually happened (used for recency in scoring).
  const breakIndex = (fromIdx: number, level: number, up: boolean): number => {
    for (let k = fromIdx + 1; k < bars.length; k++) {
      const c = bars[k]?.close ?? 0;
      if (up ? c > level : c < level) return k;
    }
    return bars.length - 1;
  };

  // --- BOS / MSS detection ---
  for (const sh of recentHighSwings) {
    if ((lastBar?.close ?? 0) > sh.price) {
      // Breaking above a swing high
      const isBOS = isUptrend;   // In uptrend = continuation (BOS)
      const isMSS = isDowntrend; // In downtrend = reversal (MSS)
      const label = isBOS ? 'BOS' : isMSS ? 'MSS' : 'Break';

      patterns.push({
        type:        'MSS_BOS',
        direction:   'BULLISH',
        priceLevel:  sh.price,
        confidence:  isMSS ? 78 : 65, // MSS is more significant
        description: `Bullish ${label} — price closed above swing high at ${sh.price.toFixed(2)}. ${
          isMSS
            ? 'Market Structure Shift: this breaks the downtrend structure and signals a potential trend reversal to bullish. High-probability reversal signal.'
            : 'Break of Structure: continuation of bullish trend — smart money likely accumulating.'
        }`,
        startIndex:  sh.index,
        endIndex:    breakIndex(sh.index, sh.price, true),
      });
    }
  }

  for (const sl of recentLowSwings) {
    if ((lastBar?.close ?? 0) < sl.price) {
      const isBOS = isDowntrend;
      const isMSS = isUptrend;
      const label = isBOS ? 'BOS' : isMSS ? 'MSS' : 'Break';

      patterns.push({
        type:        'MSS_BOS',
        direction:   'BEARISH',
        priceLevel:  sl.price,
        confidence:  isMSS ? 78 : 65,
        description: `Bearish ${label} — price closed below swing low at ${sl.price.toFixed(2)}. ${
          isMSS
            ? 'Market Structure Shift: this breaks the uptrend structure and signals a potential trend reversal to bearish. High-probability reversal signal.'
            : 'Break of Structure: continuation of bearish trend — smart money likely distributing.'
        }`,
        startIndex:  sl.index,
        endIndex:    breakIndex(sl.index, sl.price, false),
      });
    }
  }

  // --- CHoCH (Change of Character) ---
  // In uptrend: a lower high forms (bearish CHoCH warning)
  // In downtrend: a higher low forms (bullish CHoCH warning)
  if (isUptrend && highs.length >= 2) {
    const [prevHigh, latestHigh] = highs.slice(-2);
    if (prevHigh && latestHigh && latestHigh.price < prevHigh.price) {
      patterns.push({
        type:        'MSS_BOS',
        direction:   'BEARISH',
        priceLevel:  latestHigh.price,
        confidence:  60,
        description: `Bearish CHoCH (Change of Character) — lower high at ${latestHigh.price.toFixed(2)} in an uptrend. Early warning of potential trend reversal. Smart money may be distributing. Wait for BOS confirmation below ${Math.min(...lows.slice(-1).map(l => l.price)).toFixed(2)}.`,
        startIndex:  prevHigh.index,
        endIndex:    latestHigh.index,
      });
    }
  }

  if (isDowntrend && lows.length >= 2) {
    const [prevLow, latestLow] = lows.slice(-2);
    if (prevLow && latestLow && latestLow.price > prevLow.price) {
      patterns.push({
        type:        'MSS_BOS',
        direction:   'BULLISH',
        priceLevel:  latestLow.price,
        confidence:  60,
        description: `Bullish CHoCH (Change of Character) — higher low at ${latestLow.price.toFixed(2)} in a downtrend. Early warning of potential trend reversal. Smart money may be accumulating. Wait for BOS confirmation above ${Math.max(...highs.slice(-1).map(h => h.price)).toFixed(2)}.`,
        startIndex:  prevLow.index,
        endIndex:    latestLow.index,
      });
    }
  }

  return patterns;
}
