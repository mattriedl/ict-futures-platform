import { OHLCVBar, ICTPattern, TradeSetupResult, ConfluenceScore } from './types';
import { detectOrderBlocks }        from './order-blocks';
import { detectFairValueGaps }      from './fair-value-gaps';
import { detectLiquiditySweeps }    from './liquidity-sweeps';
import { detectMarketStructureShifts } from './market-structure';
import { detectOTE }                from './ote';
import { detectBreakerBlocks }      from './breaker-blocks';
import { detectMitigationBlocks }   from './mitigation-blocks';
import { detectEqualHighsLows }     from './equal-highs-lows';
import { detectDisplacement }       from './displacement';
import { detectOpeningGaps }        from './opening-gaps';
import { detectSilverBullet }       from './silver-bullet';
import { detectPowerOfThree }       from './power-of-three';
import { detectPreviousDayLevels }  from './previous-day-levels';
import { scoreIct, type IctScore, type Bias } from './ict-score';

export type { OHLCVBar, ICTPattern, TradeSetupResult, ConfluenceScore, IctScore, Bias };

export function analyzeICT(bars: OHLCVBar[]): ICTPattern[] {
  if (!bars || bars.length === 0) return [];

  const allPatterns: ICTPattern[] = [
    ...detectOrderBlocks(bars),
    ...detectFairValueGaps(bars),
    ...detectLiquiditySweeps(bars),
    ...detectMarketStructureShifts(bars),
    ...detectOTE(bars),
    ...detectBreakerBlocks(bars),
    ...detectMitigationBlocks(bars),
    // Full ICT Suite additions
    ...detectEqualHighsLows(bars),
    ...detectDisplacement(bars),
    ...detectOpeningGaps(bars),
    ...detectSilverBullet(bars),
    ...detectPowerOfThree(bars),
    ...detectPreviousDayLevels(bars),
  ];

  return allPatterns;
}

/**
 * ICT confluence score for the current bar series (see ict-score.ts):
 * direction from higher-timeframe structure, context levels only while still
 * in play, trigger patterns only when recent and in sequence.
 * @param at  Moment being scored (defaults to now). Backtests pass the
 *            replayed bar's timestamp so Kill Zone timing is historical.
 */
export function scoreConfluence(patterns: ICTPattern[], bars: OHLCVBar[], at?: number): IctScore {
  return scoreIct(patterns, bars, at);
}

// Round a price to a magnitude-appropriate precision. A fixed .toFixed(2)
// collapses any sub-cent coin (SHIB, PEPE, BONK, etc.) to 0, which makes
// entry/SL/TP unusable and blocks demo trades. This preserves ~6 significant
// figures across the full range from BTC ($80k+) down to micro-cap coins.
function roundPrice(n: number): number {
  const a = Math.abs(n);
  if (!isFinite(a) || a === 0) return 0;
  let decimals: number;
  if (a >= 1000) decimals = 2;
  else if (a >= 1) decimals = 4;
  else if (a >= 0.01) decimals = 5;
  else if (a >= 0.0001) decimals = 7;
  else if (a >= 0.000001) decimals = 9;
  else decimals = 12;
  return parseFloat(n.toFixed(decimals));
}

/**
 * @param at  Moment the setup is evaluated (defaults to now). Backtests pass the
 *            timestamp of the bar being replayed.
 */
export function generateTradeSetup(bars: OHLCVBar[], patterns: ICTPattern[], at?: number): TradeSetupResult | null {
  if (!bars || bars.length === 0 || !patterns || patterns.length === 0) return null;

  const lastBar = bars[bars.length - 1];
  if (!lastBar) return null;
  const price = lastBar?.close ?? 0;

  // Direction comes from higher-timeframe structure, not a pattern count.
  const confluence = scoreConfluence(patterns, bars, at);
  if (confluence.bias === 'NEUTRAL' || confluence.score < 20) return null;
  const direction: 'BULLISH' | 'BEARISH' = confluence.bias;
  const relevant  = patterns.filter((p: ICTPattern) => p.direction === direction);

  // Calculate ATR (14-bar)
  const atrBars = bars.slice(-14);
  const atr     = atrBars.reduce((sum: number, b: OHLCVBar) => sum + ((b?.high ?? 0) - (b?.low ?? 0)), 0) / (atrBars.length || 1);

  // Entry zone selection. Detectors emit patterns oldest-first across the whole
  // window (days of candles), so taking the first match used to anchor the
  // entry to a zone from days ago, often far from price or already broken,
  // producing setups that were invalid the moment they were shown. Use the MOST
  // RECENT zone of each type that is (a) on the correct side of price,
  // (b) within MAX_ZONE_ATR of price, and (c) not broken by a later close.
  const MAX_ZONE_ATR = 3;
  const isBull = direction === 'BULLISH';
  const zoneLevel = (p: ICTPattern) => (isBull ? p.lowerBound : p.upperBound) ?? p.priceLevel;
  const pickZone = (type: string): ICTPattern | undefined => {
    let best: ICTPattern | undefined;
    for (const p of relevant) {
      if (p.type !== type) continue;
      const level = zoneLevel(p);
      if (!Number.isFinite(level) || level <= 0) continue;
      if (isBull ? level > price : level < price) continue;
      if (Math.abs(price - level) > atr * MAX_ZONE_ATR) continue;
      let broken = false;
      for (let k = Math.max(0, (p.endIndex ?? 0) + 1); k < bars.length; k++) {
        const c = bars[k].close;
        if (isBull ? c < level : c > level) { broken = true; break; }
      }
      if (broken) continue;
      if (!best || (p.endIndex ?? 0) > (best.endIndex ?? 0)) best = p;
    }
    return best;
  };

  // Priority order for entry: Silver Bullet > OTE > OB > FVG > Mitigation
  const sb  = pickZone('SILVER_BULLET');
  const ote = pickZone('OTE');
  const ob  = pickZone('ORDER_BLOCK');
  const fvg = pickZone('FVG');
  const mit = pickZone('MITIGATION_BLOCK');

  let entry: number;
  let sl: number;
  let tp: number;

  if (direction === 'BULLISH') {
    // Entry: prefer OTE zone midpoint > Silver Bullet lower > OB lower > FVG lower
    entry = sb?.lowerBound ?? ote?.lowerBound ?? ob?.lowerBound ?? fvg?.lowerBound ?? mit?.lowerBound ?? price;
    sl    = entry - atr * 1.5;
    tp    = entry + atr * 3;

    // Look for the nearest EQH or PDH as take-profit target
    const eqh = patterns.filter(p => p.type === 'EQ_HIGHS_LOWS' && p.direction === 'BEARISH');
    const pdh = patterns.filter(p => p.type === 'PDH_PDL' && p.direction === 'BEARISH');
    const targets = [...eqh, ...pdh].filter(p => (p.priceLevel ?? 0) > entry);
    if (targets.length > 0) {
      const nearestTarget = targets.reduce((a, b) =>
        Math.abs(a.priceLevel - entry) < Math.abs(b.priceLevel - entry) ? a : b
      );
      tp = Math.max(tp, nearestTarget.priceLevel);
    }
  } else {
    entry = sb?.upperBound ?? ote?.upperBound ?? ob?.upperBound ?? fvg?.upperBound ?? mit?.upperBound ?? price;
    sl    = entry + atr * 1.5;
    tp    = entry - atr * 3;

    // Look for nearest EQL or PDL as take-profit
    const eql = patterns.filter(p => p.type === 'EQ_HIGHS_LOWS' && p.direction === 'BULLISH');
    const pdl = patterns.filter(p => p.type === 'PDH_PDL' && p.direction === 'BULLISH');
    const targets = [...eql, ...pdl].filter(p => (p.priceLevel ?? 0) < entry);
    if (targets.length > 0) {
      const nearestTarget = targets.reduce((a, b) =>
        Math.abs(a.priceLevel - entry) < Math.abs(b.priceLevel - entry) ? a : b
      );
      tp = Math.min(tp, nearestTarget.priceLevel);
    }
  }

  const risk   = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  const rr     = risk > 0 ? reward / risk : 0;

  // Only the patterns that actually earned points (in play / recent / in bias).
  const uniqueConfluences = confluence.contributing.length
    ? confluence.contributing
    : [...new Set(relevant.map((p: ICTPattern) => p.type))];

  const primaryEntry = sb ? 'Silver Bullet' : ote ? 'OTE Zone' : ob ? 'Order Block' : fvg ? 'FVG' : mit ? 'Mitigation Block' : 'Market Price';

  return {
    direction: direction as 'BULLISH' | 'BEARISH',
    entryPrice:  roundPrice(entry),
    stopLoss:    roundPrice(sl),
    takeProfit:  roundPrice(tp),
    riskReward:  parseFloat(rr.toFixed(2)),
    aiScore:     confluence.score,
    confluences: uniqueConfluences,
    explanation: `${direction} setup — entry based on ${primaryEntry}. ${uniqueConfluences.length} ICT confluences: ${uniqueConfluences.join(', ')}. AI Score: ${confluence.score}/100. R:R = 1:${rr.toFixed(1)}.`,
  };
}
