import { OHLCVBar, ICTPattern } from './types';

/**
 * ICT Power of 3 (AMD — Accumulation, Manipulation, Distribution)
 *
 * The market moves in 3 phases within a trading range / session:
 *  1. Accumulation:   Price coils in a tight range, building orders
 *  2. Manipulation:   False break / stop hunt above or below the range (liquidity grab)
 *  3. Distribution:   Strong directional move away from the manipulation point
 *
 * This is the core concept behind why retail traders get stopped out before the real move.
 */
export function detectPowerOfThree(bars: OHLCVBar[]): ICTPattern[] {
  const patterns: ICTPattern[] = [];
  if ((bars?.length ?? 0) < 20) return patterns;

  // Analyze the last 30 bars in three equal thirds
  const lookback   = Math.min(30, bars.length);
  const recentBars = bars.slice(-lookback);
  const third      = Math.floor(lookback / 3);

  const phase1 = recentBars.slice(0, third);           // Accumulation
  const phase2 = recentBars.slice(third, third * 2);   // Manipulation
  const phase3 = recentBars.slice(third * 2);          // Distribution

  if (phase1.length < 3 || phase2.length < 3 || phase3.length < 3) return patterns;

  // Phase 1: Low volatility (ATR small)
  const atr1 = phase1.reduce((s, b) => s + ((b?.high ?? 0) - (b?.low ?? 0)), 0) / phase1.length;

  // Phase 1 range
  const p1High = Math.max(...phase1.map(b => b?.high ?? 0));
  const p1Low  = Math.min(...phase1.map(b => b?.low  ?? Infinity));
  const p1Range = p1High - p1Low;

  // Phase 2: Manipulation - false break outside phase 1 range
  const p2High = Math.max(...phase2.map(b => b?.high ?? 0));
  const p2Low  = Math.min(...phase2.map(b => b?.low  ?? Infinity));

  const sweptHigh = p2High > p1High;
  const sweptLow  = p2Low  < p1Low;

  if (!sweptHigh && !sweptLow) return patterns;

  // Phase 3: Distribution - strong directional move
  const p3First = phase3[0];
  const p3Last  = phase3[phase3.length - 1];
  if (!p3First || !p3Last) return patterns;

  const p3Move      = (p3Last.close ?? 0) - (p3First.open ?? 0);
  const atr3        = phase3.reduce((s, b) => s + ((b?.high ?? 0) - (b?.low ?? 0)), 0) / phase3.length;
  const isBullishAMD = sweptLow && p3Move > 0;  // Swept lows then rallied = bullish
  const isBearishAMD = sweptHigh && p3Move < 0; // Swept highs then sold off = bearish

  if (!isBullishAMD && !isBearishAMD) return patterns;

  // Validate: distribution should be stronger than accumulation range
  if (Math.abs(p3Move) < p1Range * 0.5) return patterns;

  const direction   = isBullishAMD ? 'BULLISH' : 'BEARISH';
  const manip       = isBullishAMD ? `swept sell-side liquidity below ${p1Low.toFixed(2)}` : `swept buy-side liquidity above ${p1High.toFixed(2)}`;
  const distTarget  = isBullishAMD ? p2High + p1Range : p2Low - p1Range;
  const startIdx    = bars.length - lookback;

  patterns.push({
    type:        'POWER_OF_THREE',
    direction,
    priceLevel:  isBullishAMD ? p2Low : p2High,
    upperBound:  isBullishAMD ? p3Last.close ?? 0 : p2High,
    lowerBound:  isBullishAMD ? p2Low : p3Last.close ?? 0,
    confidence:  Math.min(85, 65 + Math.floor(Math.abs(p3Move) / (atr3 || 1)) * 5),
    description: `ICT Power of 3 (AMD) — ${direction}. Phase 1 Accumulation: ${p1Low.toFixed(2)}–${p1High.toFixed(2)}. Phase 2 Manipulation: ${manip} (stop hunt). Phase 3 Distribution: ${direction === 'BULLISH' ? 'bullish impulse' : 'bearish impulse'} targeting ${distTarget.toFixed(2)}.`,
    startIndex:  startIdx,
    endIndex:    bars.length - 1,
  });

  return patterns;
}
