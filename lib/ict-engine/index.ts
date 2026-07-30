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
import { getSessionInfo }           from '../yahoo-finance';

export type { OHLCVBar, ICTPattern, TradeSetupResult, ConfluenceScore };

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

export function scoreConfluence(patterns: ICTPattern[]): ConfluenceScore {
  const session    = getSessionInfo();
  const isKillZone = session.killZone !== null;

  const bullish = patterns.filter((p: ICTPattern) => p.direction === 'BULLISH');
  const bearish = patterns.filter((p: ICTPattern) => p.direction === 'BEARISH');

  const dominantDir = bullish.length >= bearish.length ? 'BULLISH' : 'BEARISH';
  const dominant    = dominantDir === 'BULLISH' ? bullish : bearish;

  const factors = [
    // Core ICT concepts (original)
    { name: 'Order Block Present',        weight: 12, met: dominant.some((p: ICTPattern) => p.type === 'ORDER_BLOCK') },
    { name: 'Fair Value Gap',             weight: 10, met: dominant.some((p: ICTPattern) => p.type === 'FVG') },
    { name: 'Liquidity Sweep',            weight: 12, met: dominant.some((p: ICTPattern) => p.type === 'LIQUIDITY_SWEEP') },
    { name: 'Market Structure Shift/BOS', weight: 10, met: dominant.some((p: ICTPattern) => p.type === 'MSS_BOS') },
    { name: 'OTE Zone',                   weight: 10, met: dominant.some((p: ICTPattern) => p.type === 'OTE') },
    { name: 'Premium/Discount Alignment', weight: 5,  met: dominant.some((p: ICTPattern) => p.type === 'PREMIUM_DISCOUNT') },
    { name: 'Breaker Block',              weight: 4,  met: dominant.some((p: ICTPattern) => p.type === 'BREAKER_BLOCK') },
    { name: 'Mitigation Block',           weight: 3,  met: dominant.some((p: ICTPattern) => p.type === 'MITIGATION_BLOCK') },
    // Kill Zone timing
    { name: 'Kill Zone Active',           weight: 8,  met: isKillZone },
    // Full ICT Suite additions
    { name: 'Silver Bullet Setup',        weight: 10, met: dominant.some((p: ICTPattern) => p.type === 'SILVER_BULLET') },
    { name: 'Displacement Present',       weight: 8,  met: dominant.some((p: ICTPattern) => p.type === 'DISPLACEMENT') },
    { name: 'Equal Highs/Lows (EQH/EQL)',weight: 6,  met: patterns.some((p: ICTPattern) => p.type === 'EQ_HIGHS_LOWS') },
    { name: 'PDH/PDL Confluence',         weight: 5,  met: patterns.some((p: ICTPattern) => p.type === 'PDH_PDL') },
    { name: 'Opening Gap (NDOG/NWOG)',    weight: 3,  met: patterns.some((p: ICTPattern) => p.type === 'NDOG_NWOG') },
    { name: 'Power of 3 (AMD) Alignment', weight: 7,  met: dominant.some((p: ICTPattern) => p.type === 'POWER_OF_THREE') },
    // High-confidence bonuses
    { name: 'Multi-Confluence (3+ types)',weight: 5,  met: new Set(dominant.map(p => p.type)).size >= 3 },
    { name: 'High Avg Confidence (>75%)', weight: 3,  met: dominant.length > 0 && dominant.reduce((s, p) => s + p.confidence, 0) / dominant.length > 75 },
  ];

  // Raw score (max possible ≈ 121, normalize to 100)
  const MAX_POSSIBLE = factors.reduce((s, f) => s + f.weight, 0);
  const rawScore     = factors.reduce((sum: number, f: any) => sum + (f.met ? f.weight : 0), 0);
  const score        = Math.round((rawScore / MAX_POSSIBLE) * 100);

  return { score, factors };
}

export function generateTradeSetup(bars: OHLCVBar[], patterns: ICTPattern[]): TradeSetupResult | null {
  if (!bars || bars.length === 0 || !patterns || patterns.length === 0) return null;

  const lastBar = bars[bars.length - 1];
  if (!lastBar) return null;
  const price = lastBar?.close ?? 0;

  const bullish  = patterns.filter((p: ICTPattern) => p.direction === 'BULLISH');
  const bearish  = patterns.filter((p: ICTPattern) => p.direction === 'BEARISH');
  const direction = bullish.length >= bearish.length ? 'BULLISH' : 'BEARISH';
  const relevant  = direction === 'BULLISH' ? bullish : bearish;

  const confluence = scoreConfluence(patterns);
  if (confluence.score < 20) return null;

  // Priority order for entry: Silver Bullet > OTE > OB > FVG > Mitigation > Breaker
  const sb  = relevant.find((p: ICTPattern) => p.type === 'SILVER_BULLET');
  const ote = relevant.find((p: ICTPattern) => p.type === 'OTE');
  const ob  = relevant.find((p: ICTPattern) => p.type === 'ORDER_BLOCK');
  const fvg = relevant.find((p: ICTPattern) => p.type === 'FVG');
  const mit = relevant.find((p: ICTPattern) => p.type === 'MITIGATION_BLOCK');

  // Calculate ATR (14-bar)
  const atrBars = bars.slice(-14);
  const atr     = atrBars.reduce((sum: number, b: OHLCVBar) => sum + ((b?.high ?? 0) - (b?.low ?? 0)), 0) / (atrBars.length || 1);

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

  const confluenceNames  = relevant.map((p: ICTPattern) => p.type);
  const uniqueConfluences = [...new Set(confluenceNames)];

  const primaryEntry = sb ? 'Silver Bullet' : ote ? 'OTE Zone' : ob ? 'Order Block' : fvg ? 'FVG' : 'Market Price';

  return {
    direction: direction as 'BULLISH' | 'BEARISH',
    entryPrice:  parseFloat(entry.toFixed(2)),
    stopLoss:    parseFloat(sl.toFixed(2)),
    takeProfit:  parseFloat(tp.toFixed(2)),
    riskReward:  parseFloat(rr.toFixed(2)),
    aiScore:     confluence.score,
    confluences: uniqueConfluences,
    explanation: `${direction} setup — entry based on ${primaryEntry}. ${uniqueConfluences.length} ICT confluences: ${uniqueConfluences.join(', ')}. AI Score: ${confluence.score}/100. R:R = 1:${rr.toFixed(1)}.`,
  };
}
