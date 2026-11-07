import { fetchMarketHistorical } from '@/lib/market-data';
import { analyzeICT, scoreConfluence, generateTradeSetup } from '@/lib/ict-engine';
import { estimateVolumeLiquidity } from '@/lib/liquidity';
import type { OHLCVBar } from '@/lib/ict-engine/types';

export interface BacktestConfig {
  symbol: string;
  timeframe: string;
  days: number;                    // lookback window (<= 60 for intraday)
  requiredConfluences: string[];   // pattern types that MUST be present
  minAiScore: number;              // minimum AI confluence score (0-100)
  riskPerTrade: number;            // risk unit in R (used for equity curve scaling)
  intendedSizeUsd?: number;        // notional size for the liquidity approximation
}

export interface SimulatedTrade {
  index: number;
  openedAt: string;
  closedAt: string | null;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  exitPrice: number | null;
  riskReward: number;
  aiScore: number;
  confluences: string[];
  outcome: 'WIN' | 'LOSS' | 'OPEN';
  rMultiple: number;
  pnlPercent: number;
  // Volume-based liquidity APPROXIMATION (historical depth unavailable).
  liquidityParticipationPercent: number | null;
  liquidityRating: 'AMPLE' | 'MODERATE' | 'THIN' | null;
}

export interface BacktestResult {
  symbol: string;
  timeframe: string;
  synthetic: boolean;
  clampedDays: number;
  startDate: string;
  endDate: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgRR: number;
  profitFactor: number | null;
  netR: number;
  netPnlPercent: number;
  maxDrawdownPercent: number;
  equityCurve: { t: string; equity: number }[];
  trades: SimulatedTrade[];
  // Volume-based liquidity approximation summary (clearly an estimate).
  liquidity: {
    approximate: true;
    intendedSizeUsd: number;
    avgParticipationPercent: number | null;
    thinTradeCount: number;
    rating: 'AMPLE' | 'MODERATE' | 'THIN' | null;
    note: string;
  };
}

const WARMUP_BARS = 60;       // bars needed before the engine produces signals
const MAX_HOLD_BARS = 60;     // resolve/abandon a trade after this many bars
const COOLDOWN_BARS = 3;      // bars to wait after a trade before taking a new one

/**
 * Walk-forward backtest. At each bar i (>= WARMUP_BARS) we run the ICT engine on
 * the window bars[0..i] (NO future data — avoids look-ahead bias for signals).
 * If a qualifying setup appears we open a trade at that bar's close and then use
 * ONLY future bars (i+1..) to resolve TP/SL. This cleanly separates the signal
 * (past only) from the resolution (future only).
 */
export async function runBacktest(config: BacktestConfig): Promise<BacktestResult> {
  const { symbol, timeframe, days, requiredConfluences, minAiScore } = config;
  const intendedSizeUsd = config.intendedSizeUsd && config.intendedSizeUsd > 0 ? config.intendedSizeUsd : 10000;

  const { bars, synthetic, clampedDays } = await fetchMarketHistorical(symbol, timeframe, days);

  const trades: SimulatedTrade[] = [];
  let i = WARMUP_BARS;
  let cooldownUntil = 0;

  while (i < bars.length - 1) {
    if (i < cooldownUntil) {
      i++;
      continue;
    }

    // Signal generation: only bars up to and including i.
    const window = bars.slice(0, i + 1);
    const patterns = analyzeICT(window);
    const score = scoreConfluence(patterns).score;

    if (score < minAiScore) {
      i++;
      continue;
    }

    const setup = generateTradeSetup(window, patterns);
    if (!setup) {
      i++;
      continue;
    }

    // Enforce required confluences (all must be present in the setup).
    if (requiredConfluences.length > 0) {
      const has = new Set(setup.confluences);
      const missing = requiredConfluences.some((c) => !has.has(c));
      if (missing) {
        i++;
        continue;
      }
    }

    const direction: 'LONG' | 'SHORT' = setup.direction === 'BULLISH' ? 'LONG' : 'SHORT';
    const entry = setup.entryPrice;
    const stop = setup.stopLoss;
    const target = setup.takeProfit;

    // Skip degenerate setups.
    const risk = Math.abs(entry - stop);
    if (risk <= 0) {
      i++;
      continue;
    }

    // Resolution: only future bars (i+1 onward).
    let outcome: 'WIN' | 'LOSS' | 'OPEN' = 'OPEN';
    let exitPrice: number | null = null;
    let closedAt: string | null = null;
    let closeIndex = i;

    const maxJ = Math.min(bars.length - 1, i + MAX_HOLD_BARS);
    for (let j = i + 1; j <= maxJ; j++) {
      const bar = bars[j];
      const res = resolveBar(direction, target, stop, bar.high, bar.low);
      if (res) {
        outcome = res.status;
        exitPrice = res.exitPrice;
        closedAt = new Date(bar.timestamp).toISOString();
        closeIndex = j;
        break;
      }
    }

    // R multiple & pnl% based on realized exit (open trades excluded from stats).
    let rMultiple = 0;
    let pnlPercent = 0;
    if (outcome !== 'OPEN' && exitPrice != null) {
      const dir = direction === 'LONG' ? 1 : -1;
      const move = (exitPrice - entry) * dir;
      rMultiple = move / risk;
      pnlPercent = (move / entry) * 100;
    }

    // Volume-based liquidity approximation for this trade's entry bar window.
    const liqEst = estimateVolumeLiquidity(bars.slice(0, i + 1), entry, intendedSizeUsd, 20);

    trades.push({
      index: i,
      openedAt: new Date(bars[i].timestamp).toISOString(),
      closedAt,
      direction,
      entryPrice: roundPrice(entry),
      stopLoss: roundPrice(stop),
      takeProfit: roundPrice(target),
      exitPrice: exitPrice != null ? roundPrice(exitPrice) : null,
      riskReward: setup.riskReward,
      aiScore: setup.aiScore,
      confluences: setup.confluences,
      outcome,
      rMultiple: round2(rMultiple),
      pnlPercent: round2(pnlPercent),
      liquidityParticipationPercent: liqEst?.participationPercent ?? null,
      liquidityRating: liqEst?.rating ?? null,
    });

    // Advance past the trade close + cooldown to avoid overlapping duplicates.
    i = Math.max(i + 1, closeIndex);
    cooldownUntil = i + COOLDOWN_BARS;
  }

  return summarize(config, bars, trades, synthetic, clampedDays, intendedSizeUsd);
}

function resolveBar(
  direction: 'LONG' | 'SHORT',
  target: number,
  stop: number,
  high: number,
  low: number,
): { status: 'WIN' | 'LOSS'; exitPrice: number } | null {
  if (direction === 'LONG') {
    const hitTP = high >= target;
    const hitSL = low <= stop;
    if (hitSL && hitTP) return { status: 'LOSS', exitPrice: stop }; // conservative
    if (hitTP) return { status: 'WIN', exitPrice: target };
    if (hitSL) return { status: 'LOSS', exitPrice: stop };
  } else {
    const hitTP = low <= target;
    const hitSL = high >= stop;
    if (hitSL && hitTP) return { status: 'LOSS', exitPrice: stop }; // conservative
    if (hitTP) return { status: 'WIN', exitPrice: target };
    if (hitSL) return { status: 'LOSS', exitPrice: stop };
  }
  return null;
}

function summarize(
  config: BacktestConfig,
  bars: OHLCVBar[],
  trades: SimulatedTrade[],
  synthetic: boolean,
  clampedDays: number,
  intendedSizeUsd: number,
): BacktestResult {
  const closed = trades.filter((t) => t.outcome !== 'OPEN');
  const wins = closed.filter((t) => t.outcome === 'WIN');
  const losses = closed.filter((t) => t.outcome === 'LOSS');

  const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
  const avgRR = closed.length > 0 ? closed.reduce((s, t) => s + t.riskReward, 0) / closed.length : 0;

  const grossWinR = wins.reduce((s, t) => s + Math.max(0, t.rMultiple), 0);
  const grossLossR = Math.abs(losses.reduce((s, t) => s + Math.min(0, t.rMultiple), 0));
  const profitFactor = grossLossR > 0 ? grossWinR / grossLossR : grossWinR > 0 ? null : 0;
  const netR = closed.reduce((s, t) => s + t.rMultiple, 0);
  const netPnlPercent = closed.reduce((s, t) => s + t.pnlPercent, 0);

  // Equity curve in R units (each trade risks `riskPerTrade` R -> we track cumulative R).
  const equityCurve: { t: string; equity: number }[] = [];
  let cumR = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const startEquity = bars[0] ? new Date(bars[0].timestamp).toISOString() : new Date().toISOString();
  equityCurve.push({ t: startEquity, equity: 0 });
  for (const t of closed) {
    cumR += t.rMultiple;
    equityCurve.push({ t: t.closedAt ?? t.openedAt, equity: round2(cumR) });
    if (cumR > peak) peak = cumR;
    const dd = peak - cumR; // drawdown in R
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  // Express max drawdown as % of peak equity where meaningful, else raw R.
  const maxDrawdownPercent = peak > 0 ? round2((maxDrawdown / peak) * 100) : round2(maxDrawdown);

  // Volume-based liquidity approximation summary across all trades.
  const parts = trades
    .map((t) => t.liquidityParticipationPercent)
    .filter((p): p is number => p != null);
  const avgParticipationPercent = parts.length > 0 ? round2(parts.reduce((s, p) => s + p, 0) / parts.length) : null;
  const thinTradeCount = trades.filter((t) => t.liquidityRating === 'THIN').length;
  const overallRating: 'AMPLE' | 'MODERATE' | 'THIN' | null =
    avgParticipationPercent == null ? null
      : avgParticipationPercent <= 1 ? 'AMPLE'
      : avgParticipationPercent <= 5 ? 'MODERATE'
      : 'THIN';
  const liquidity = {
    approximate: true as const,
    intendedSizeUsd,
    avgParticipationPercent,
    thinTradeCount,
    rating: overallRating,
    note:
      `Liquidity is APPROXIMATED from traded candle volume for an assumed $${intendedSizeUsd.toLocaleString('en-US')} ` +
      'position. Historical order-book depth is not available, so these figures estimate fill difficulty and are NOT guaranteed fills.',
  };

  return {
    symbol: config.symbol,
    timeframe: config.timeframe,
    synthetic,
    clampedDays,
    startDate: bars[0] ? new Date(bars[0].timestamp).toISOString() : new Date().toISOString(),
    endDate: bars[bars.length - 1] ? new Date(bars[bars.length - 1].timestamp).toISOString() : new Date().toISOString(),
    totalTrades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: round2(winRate),
    avgRR: round2(avgRR),
    profitFactor: profitFactor == null ? null : round2(profitFactor),
    netR: round2(netR),
    netPnlPercent: round2(netPnlPercent),
    maxDrawdownPercent,
    equityCurve,
    trades,
    liquidity,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Magnitude-aware price rounding so sub-cent coins are not collapsed to 0.
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
