import { OHLCVBar, ICTPattern } from './types';

/**
 * ICT Silver Bullet Entry Model
 * A high-probability FVG-based entry that forms during specific kill zone windows.
 *
 * Windows (ET):
 *  - London Silver Bullet: 3:00–4:00 AM
 *  - AM Silver Bullet:     10:00–11:00 AM
 *  - PM Silver Bullet:     2:00–3:00 PM
 *
 * The model looks for a 3-candle FVG formed within the window that is then retested.
 */

function getETHour(timestamp: number): number {
  const date = new Date(timestamp);
  const etStr = date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false,
  });
  return parseInt(etStr, 10);
}

function isInSilverBulletWindow(timestamp: number): { inWindow: boolean; windowName: string } {
  const etHour = getETHour(timestamp);
  if (etHour === 3)  return { inWindow: true, windowName: 'London Silver Bullet (3-4 AM ET)' };
  if (etHour === 10) return { inWindow: true, windowName: 'AM Silver Bullet (10-11 AM ET)' };
  if (etHour === 14) return { inWindow: true, windowName: 'PM Silver Bullet (2-3 PM ET)' };
  return { inWindow: false, windowName: '' };
}

export function detectSilverBullet(bars: OHLCVBar[]): ICTPattern[] {
  const patterns: ICTPattern[] = [];
  if ((bars?.length ?? 0) < 5) return patterns;

  for (let i = 1; i < bars.length - 1; i++) {
    const prev = bars[i - 1];
    const curr = bars[i];
    const next = bars[i + 1];
    if (!prev || !curr || !next) continue;

    const { inWindow, windowName } = isInSilverBulletWindow(curr.timestamp ?? 0);
    if (!inWindow) continue;

    // Bullish Silver Bullet FVG: gap between prev.high and next.low on bullish impulse
    const bullFVGLow  = prev.high ?? 0;
    const bullFVGHigh = next.low  ?? 0;
    if (bullFVGHigh > bullFVGLow && (curr.close ?? 0) > (curr.open ?? 0)) {
      const gapSize = bullFVGHigh - bullFVGLow;
      // Check if price comes back to retest this FVG in subsequent bars
      let retested = false;
      for (let j = i + 2; j < Math.min(i + 8, bars.length); j++) {
        const testBar = bars[j];
        if (!testBar) continue;
        if ((testBar.low ?? 0) <= bullFVGHigh && (testBar.close ?? 0) > bullFVGLow) {
          retested = true;
          break;
        }
      }
      patterns.push({
        type:        'SILVER_BULLET',
        direction:   'BULLISH',
        priceLevel:  (bullFVGLow + bullFVGHigh) / 2,
        upperBound:  bullFVGHigh,
        lowerBound:  bullFVGLow,
        confidence:  retested ? 88 : 72,
        description: `Bullish Silver Bullet FVG during ${windowName}. Imbalance: ${bullFVGLow.toFixed(2)}–${bullFVGHigh.toFixed(2)} (gap: ${gapSize.toFixed(2)}). ${retested ? 'Price has retested this zone — high-probability long entry.' : 'Awaiting retest for entry confirmation.'}`,
        startIndex:  i - 1,
        endIndex:    i + 1,
      });
    }

    // Bearish Silver Bullet FVG: gap between prev.low and next.high on bearish impulse
    const bearFVGHigh = prev.low  ?? 0;
    const bearFVGLow  = next.high ?? 0;
    if (bearFVGHigh > bearFVGLow && (curr.close ?? 0) < (curr.open ?? 0)) {
      const gapSize = bearFVGHigh - bearFVGLow;
      let retested = false;
      for (let j = i + 2; j < Math.min(i + 8, bars.length); j++) {
        const testBar = bars[j];
        if (!testBar) continue;
        if ((testBar.high ?? 0) >= bearFVGLow && (testBar.close ?? 0) < bearFVGHigh) {
          retested = true;
          break;
        }
      }
      patterns.push({
        type:        'SILVER_BULLET',
        direction:   'BEARISH',
        priceLevel:  (bearFVGLow + bearFVGHigh) / 2,
        upperBound:  bearFVGHigh,
        lowerBound:  bearFVGLow,
        confidence:  retested ? 88 : 72,
        description: `Bearish Silver Bullet FVG during ${windowName}. Imbalance: ${bearFVGLow.toFixed(2)}–${bearFVGHigh.toFixed(2)} (gap: ${gapSize.toFixed(2)}). ${retested ? 'Price has retested this zone — high-probability short entry.' : 'Awaiting retest for entry confirmation.'}`,
        startIndex:  i - 1,
        endIndex:    i + 1,
      });
    }
  }

  return patterns.slice(-4); // Most recent 4 Silver Bullet setups
}
