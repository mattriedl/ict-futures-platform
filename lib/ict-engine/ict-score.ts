// ---------------------------------------------------------------------------
// ICT confluence scoring.
//
// Follows how ICT is actually traded, instead of crediting any pattern that
// appeared anywhere in days of candles:
//
//   1. DIRECTION comes from higher-timeframe (HTF) structure: the chart's bars
//      are aggregated up (15m -> 4h, 1h/4h -> daily, daily -> weekly) and the
//      HTF swing structure decides bullish/bearish.
//   2. CONTEXT levels can be days old but count only while still IN PLAY:
//      zones (order blocks, FVGs, breakers...) until price closes through them;
//      liquidity pools (equal highs/lows, previous day/week levels) until swept.
//   3. The TRIGGER must be RECENT (current session) and in order:
//      liquidity sweep -> displacement -> market structure shift -> entry array.
//   4. TIMING: Kill Zone / Silver Bullet / Power of 3.
//
// Weights sum to 100. They were set from ICT principles, then adjusted once with
// backtests (Nov 2026, 8 markets): a lone recent displacement and a nearby
// minor zone did not predict outcomes; the ordered sequence and a fresh entry
// array did. Thresholds (alertMinScore, autoTradeMinScore) were
// re-calibrated against this scale with backtests (see docs/08).
// ---------------------------------------------------------------------------

import type { OHLCVBar, ICTPattern, ConfluenceScore } from './types';
import { getSessionInfo } from '../yahoo-finance';

export type Bias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

const ZONE_TYPES = new Set(['ORDER_BLOCK', 'FVG', 'BREAKER_BLOCK', 'MITIGATION_BLOCK', 'OTE', 'SILVER_BULLET', 'NDOG_NWOG']);
const ENTRY_TYPES = new Set(['FVG', 'ORDER_BLOCK', 'OTE', 'SILVER_BULLET', 'BREAKER_BLOCK', 'MITIGATION_BLOCK']);

/** Typical spacing between bars, in ms (median of recent gaps). */
export function barSpacingMs(bars: OHLCVBar[]): number {
  const gaps: number[] = [];
  for (let i = Math.max(1, bars.length - 50); i < bars.length; i++) {
    const g = bars[i].timestamp - bars[i - 1].timestamp;
    if (g > 0) gaps.push(g);
  }
  if (!gaps.length) return 15 * 60_000;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

/** How far back a trigger may be and still count as "this session". */
export function recentWindowMs(barMs: number): number {
  const H = 3_600_000;
  if (barMs <= 15 * 60_000) return 8 * H;   // intraday: the current session
  if (barMs <= H) return 24 * H;            // 1h chart: last day
  if (barMs <= 4 * H) return 4 * 24 * H;    // 4h chart: last few days
  return 15 * 24 * H;                       // daily chart: last ~2 weeks
}

function htfBucketMs(barMs: number): number {
  const H = 3_600_000;
  if (barMs <= 15 * 60_000) return 4 * H;
  if (barMs <= 4 * H) return 24 * H;
  return 7 * 24 * H;
}

function aggregate(bars: OHLCVBar[], bucketMs: number): OHLCVBar[] {
  const out: OHLCVBar[] = [];
  let cur: OHLCVBar | null = null;
  let key = -1;
  for (const b of bars) {
    const k = Math.floor(b.timestamp / bucketMs);
    if (!cur || k !== key) {
      if (cur) out.push(cur);
      cur = { ...b };
      key = k;
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume ?? 0;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export interface HtfContext {
  bias: Bias;
  rangeHigh: number;
  rangeLow: number;
  reason: string;
}

/**
 * Higher-timeframe bias from swing structure on aggregated candles:
 *   - last close beyond the latest swing high/low -> that direction;
 *   - otherwise higher highs + higher lows -> bullish, lower/lower -> bearish;
 *   - otherwise neutral.
 * Also returns the HTF dealing range (for premium/discount).
 */
export function htfContext(bars: OHLCVBar[]): HtfContext {
  const none: HtfContext = { bias: 'NEUTRAL', rangeHigh: 0, rangeLow: 0, reason: 'not enough data' };
  if (bars.length < 20) return none;
  const htf = aggregate(bars, htfBucketMs(barSpacingMs(bars)));
  if (htf.length < 6) return none;

  const recent = htf.slice(-20);
  const rangeHigh = Math.max(...recent.map((b) => b.high));
  const rangeLow = Math.min(...recent.map((b) => b.low));

  // 2-bar fractal swings on the HTF candles.
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = 2; i < htf.length - 2; i++) {
    const h = htf[i].high, l = htf[i].low;
    if (h > htf[i - 1].high && h > htf[i - 2].high && h >= htf[i + 1].high && h >= htf[i + 2].high) highs.push(h);
    if (l < htf[i - 1].low && l < htf[i - 2].low && l <= htf[i + 1].low && l <= htf[i + 2].low) lows.push(l);
  }
  const close = htf[htf.length - 1].close;
  const lastH = highs[highs.length - 1];
  const lastL = lows[lows.length - 1];

  if (lastH != null && close > lastH) return { bias: 'BULLISH', rangeHigh, rangeLow, reason: 'HTF close above last swing high' };
  if (lastL != null && close < lastL) return { bias: 'BEARISH', rangeHigh, rangeLow, reason: 'HTF close below last swing low' };
  if (highs.length >= 2 && lows.length >= 2) {
    const hh = highs[highs.length - 1] > highs[highs.length - 2];
    const hl = lows[lows.length - 1] > lows[lows.length - 2];
    if (hh && hl) return { bias: 'BULLISH', rangeHigh, rangeLow, reason: 'HTF higher highs and higher lows' };
    if (!hh && !hl) return { bias: 'BEARISH', rangeHigh, rangeLow, reason: 'HTF lower highs and lower lows' };
  }
  return { bias: 'NEUTRAL', rangeHigh, rangeLow, reason: 'HTF structure mixed' };
}

export interface PatternState {
  recentStartIdx: number;
  isRecent: (p: ICTPattern) => boolean;
  isZoneIntact: (p: ICTPattern) => boolean;
  isLiquidityUnswept: (p: ICTPattern) => boolean;
}

/** Recency and "still in play" checks for patterns over a bar series. */
export function patternState(bars: OHLCVBar[]): PatternState {
  const last = bars[bars.length - 1];
  const cutoff = (last?.timestamp ?? 0) - recentWindowMs(barSpacingMs(bars));
  let recentStartIdx = bars.length - 1;
  while (recentStartIdx > 0 && bars[recentStartIdx - 1].timestamp >= cutoff) recentStartIdx--;

  // Suffix extremes so "was it broken/swept after index k?" is O(1).
  const n = bars.length;
  const minCloseAfter = new Array<number>(n + 1).fill(Infinity);
  const maxCloseAfter = new Array<number>(n + 1).fill(-Infinity);
  const maxHighAfter = new Array<number>(n + 1).fill(-Infinity);
  const minLowAfter = new Array<number>(n + 1).fill(Infinity);
  for (let i = n - 1; i >= 0; i--) {
    minCloseAfter[i] = Math.min(minCloseAfter[i + 1], bars[i].close);
    maxCloseAfter[i] = Math.max(maxCloseAfter[i + 1], bars[i].close);
    maxHighAfter[i] = Math.max(maxHighAfter[i + 1], bars[i].high);
    minLowAfter[i] = Math.min(minLowAfter[i + 1], bars[i].low);
  }
  const after = (p: ICTPattern) => Math.min(n, Math.max(0, (p.endIndex ?? 0) + 1));

  return {
    recentStartIdx,
    isRecent: (p) => (p.endIndex ?? 0) >= recentStartIdx,
    // A zone is used up once a later candle CLOSES through its far edge.
    isZoneIntact: (p) => {
      const k = after(p);
      if (p.direction === 'BULLISH') return minCloseAfter[k] >= (p.lowerBound ?? p.priceLevel);
      return maxCloseAfter[k] <= (p.upperBound ?? p.priceLevel);
    },
    // A liquidity pool is used up once price trades through it.
    isLiquidityUnswept: (p) => {
      const level = p.priceLevel;
      const isHighSide = p.type === 'EQ_HIGHS_LOWS' ? p.direction === 'BEARISH' : level >= (last?.close ?? 0);
      // PDH/PDL rows describe the whole window; judge them on the recent window.
      const k = p.type === 'PDH_PDL' ? recentStartIdx : after(p);
      return isHighSide ? maxHighAfter[k] < level : minLowAfter[k] > level;
    },
  };
}

export interface IctScore extends ConfluenceScore {
  bias: Bias;
  biasReason: string;
  /** Pattern types that contributed to the score (for display / alert filters). */
  contributing: string[];
}

/**
 * Score the current setup for `bars` (patterns from analyzeICT(bars)).
 * @param at  moment being scored for Kill Zone timing (defaults to now;
 *            backtests pass the replayed bar's timestamp).
 */
export function scoreIct(patterns: ICTPattern[], bars: OHLCVBar[], at?: number): IctScore {
  const ctx = htfContext(bars);
  const bias = ctx.bias;
  const state = patternState(bars);
  const price = bars[bars.length - 1]?.close ?? 0;
  const atrBars = bars.slice(-14);
  const atr = atrBars.reduce((s, b) => s + (b.high - b.low), 0) / (atrBars.length || 1);
  const session = getSessionInfo(at ?? Date.now());

  const dir = bias === 'NEUTRAL' ? null : bias;
  const inDir = (p: ICTPattern) => dir != null && p.direction === dir;
  const latest = (list: ICTPattern[]) =>
    list.reduce<ICTPattern | undefined>((a, p) => (!a || (p.endIndex ?? 0) > (a.endIndex ?? 0) ? p : a), undefined);

  // ---- Context (may be days old, must still be in play) ---------------------
  const mid = (ctx.rangeHigh + ctx.rangeLow) / 2;
  const inDiscountPremium = dir === 'BULLISH' ? price < mid : dir === 'BEARISH' ? price > mid : false;

  const liquidityAhead = patterns.filter((p) => {
    if (dir == null || (p.type !== 'EQ_HIGHS_LOWS' && p.type !== 'PDH_PDL')) return false;
    const ahead = dir === 'BULLISH' ? p.priceLevel > price : p.priceLevel < price;
    return ahead && state.isLiquidityUnswept(p);
  });

  const zoneAtPrice = patterns.filter((p) => {
    if (!inDir(p) || !ZONE_TYPES.has(p.type) || !state.isZoneIntact(p)) return false;
    const level = dir === 'BULLISH' ? (p.lowerBound ?? p.priceLevel) : (p.upperBound ?? p.priceLevel);
    const correctSide = dir === 'BULLISH' ? level <= price : level >= price;
    return correctSide && Math.abs(price - level) <= atr * 2;
  });

  // ---- Trigger (recent, in direction, in order) ------------------------------
  const recentIn = (type: string) => patterns.filter((p) => p.type === type && inDir(p) && state.isRecent(p));
  const sweeps = recentIn('LIQUIDITY_SWEEP');
  const displacement = recentIn('DISPLACEMENT');

  // The latest recent structure event must agree with the bias.
  const recentStructure = patterns.filter((p) => p.type === 'MSS_BOS' && state.isRecent(p));
  const lastStructure = latest(recentStructure);
  const shift = lastStructure && inDir(lastStructure) ? lastStructure : undefined;

  const entries = patterns.filter((p) => ENTRY_TYPES.has(p.type) && inDir(p) && state.isRecent(p) && state.isZoneIntact(p));

  const sweep = latest(sweeps);
  const entry = latest(entries);
  const ordered =
    !!sweep && !!shift && !!entry &&
    (sweep.endIndex ?? 0) <= (shift.endIndex ?? 0) &&
    (shift.startIndex ?? 0) <= (entry.endIndex ?? 0);

  // ---- Timing ---------------------------------------------------------------
  const killZone = session.killZone !== null;
  const sbOrAmd = patterns.some(
    (p) => inDir(p) && ((p.type === 'SILVER_BULLET' && state.isRecent(p)) || p.type === 'POWER_OF_THREE'),
  );

  const factors = [
    {
      name: dir == null
        ? 'HTF direction unclear (mixed structure) — no setup'
        : `HTF bias ${bias.toLowerCase()} — price in ${dir === 'BEARISH' ? 'premium' : 'discount'}`,
      weight: 10,
      met: inDiscountPremium,
    },
    { name: 'Unswept liquidity target ahead', weight: 10, met: liquidityAhead.length > 0 },
    { name: 'Intact zone at price (with bias)', weight: 5, met: zoneAtPrice.length > 0 },
    { name: 'Recent liquidity sweep', weight: 15, met: sweeps.length > 0 },
    { name: 'Recent displacement', weight: 5, met: displacement.length > 0 },
    { name: 'Recent market structure shift', weight: 15, met: !!shift },
    { name: 'Fresh entry array (FVG/OB/OTE)', weight: 15, met: entries.length > 0 },
    { name: 'Sequence: sweep → shift → entry', weight: 10, met: ordered },
    { name: 'Kill Zone active', weight: 8, met: killZone },
    { name: 'Silver Bullet / Power of 3', weight: 7, met: sbOrAmd },
  ];
  const score = dir == null ? 0 : factors.reduce((s, f) => s + (f.met ? f.weight : 0), 0);

  const contributing = new Set<string>();
  liquidityAhead.forEach((p) => contributing.add(p.type));
  zoneAtPrice.forEach((p) => contributing.add(p.type));
  [...sweeps, ...displacement, ...entries].forEach((p) => contributing.add(p.type));
  if (shift) contributing.add('MSS_BOS');
  if (sbOrAmd) patterns.filter((p) => inDir(p) && (p.type === 'SILVER_BULLET' || p.type === 'POWER_OF_THREE')).forEach((p) => contributing.add(p.type));

  return { score, factors, bias, biasReason: ctx.reason, contributing: Array.from(contributing) };
}
