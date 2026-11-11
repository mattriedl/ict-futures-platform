export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/authz';
import { getOrCreateDemoAccount, evaluateOpenTradesForUser, reconcileDemoBalance } from '@/lib/demo-trades';

/**
 * Aggregate demo-trading statistics for the current user.
 * All calculations use only CLOSED trades (WIN / LOSS / CLOSED_MANUAL) with a
 * realized pnl. "wins" = pnl > 0, "losses" = pnl < 0 (scratch trades pnl==0 are
 * counted as neither for win-rate purposes but still appear in totals).
 */
export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { user } = auth;

  try {
    await evaluateOpenTradesForUser(user.id);
  } catch {
    /* non-fatal */
  }

  const account = await reconcileDemoBalance(user.id);

  const all = await prisma.demoTrade.findMany({
    where: { userId: user.id },
    orderBy: { openedAt: 'asc' },
  });

  const open = all.filter((t) => t.status === 'OPEN');
  const closed = all
    .filter((t) => t.status !== 'OPEN' && t.pnl != null)
    .sort((a, b) => new Date(a.closedAt ?? a.openedAt).getTime() - new Date(b.closedAt ?? b.openedAt).getTime());

  const wins = closed.filter((t) => (t.pnl ?? 0) > 0);
  const losses = closed.filter((t) => (t.pnl ?? 0) < 0);

  const grossProfit = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0));
  const netPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);

  const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // Expectancy per trade (dollar): winRate*avgWin - lossRate*avgLoss
  const p = closed.length > 0 ? wins.length / closed.length : 0;
  const q = closed.length > 0 ? losses.length / closed.length : 0;
  const expectancy = p * avgWin - q * avgLoss;

  const rMultiples = closed.map((t) => t.rMultiple ?? 0);
  const avgRMultiple = rMultiples.length > 0 ? rMultiples.reduce((s, r) => s + r, 0) / rMultiples.length : 0;

  // Equity curve from starting balance, ordered by close time.
  const equityCurve: { t: string; equity: number }[] = [];
  let running = account.startingBalance;
  equityCurve.push({ t: new Date(account.createdAt).toISOString(), equity: round2(running) });
  for (const t of closed) {
    running += t.pnl ?? 0;
    equityCurve.push({ t: new Date(t.closedAt ?? t.openedAt).toISOString(), equity: round2(running) });
  }

  // Max drawdown (% from running peak of equity curve).
  let peak = equityCurve[0]?.equity ?? account.startingBalance;
  let maxDrawdownPercent = 0;
  for (const point of equityCurve) {
    if (point.equity > peak) peak = point.equity;
    if (peak > 0) {
      const dd = ((peak - point.equity) / peak) * 100;
      if (dd > maxDrawdownPercent) maxDrawdownPercent = dd;
    }
  }

  // R-multiple distribution buckets.
  const buckets = [
    { label: '≤ -2R', min: -Infinity, max: -2, count: 0 },
    { label: '-2R to -1R', min: -2, max: -1, count: 0 },
    { label: '-1R to 0', min: -1, max: 0, count: 0 },
    { label: '0 to 1R', min: 0, max: 1, count: 0 },
    { label: '1R to 2R', min: 1, max: 2, count: 0 },
    { label: '2R to 3R', min: 2, max: 3, count: 0 },
    { label: '≥ 3R', min: 3, max: Infinity, count: 0 },
  ];
  for (const r of rMultiples) {
    const b = buckets.find((bk) => r >= bk.min && r < bk.max) ?? buckets[buckets.length - 1];
    b.count++;
  }

  // Per-symbol breakdown.
  const bySymbolMap = new Map<string, { trades: number; wins: number; pnl: number }>();
  for (const t of closed) {
    const e = bySymbolMap.get(t.symbol) ?? { trades: 0, wins: 0, pnl: 0 };
    e.trades++;
    if ((t.pnl ?? 0) > 0) e.wins++;
    e.pnl += t.pnl ?? 0;
    bySymbolMap.set(t.symbol, e);
  }
  const bySymbol = Array.from(bySymbolMap.entries()).map(([symbol, v]) => ({
    symbol,
    trades: v.trades,
    winRate: v.trades > 0 ? round2((v.wins / v.trades) * 100) : 0,
    pnl: round2(v.pnl),
  }));

  // Per-pattern/confluence breakdown (a trade contributes to each of its confluences).
  const byPatternMap = new Map<string, { trades: number; wins: number; pnl: number }>();
  for (const t of closed) {
    let confs: string[] = [];
    if (t.confluences) {
      try {
        const parsed = JSON.parse(t.confluences);
        confs = Array.isArray(parsed) ? parsed : [];
      } catch {
        confs = [];
      }
    }
    for (const c of confs) {
      const e = byPatternMap.get(c) ?? { trades: 0, wins: 0, pnl: 0 };
      e.trades++;
      if ((t.pnl ?? 0) > 0) e.wins++;
      e.pnl += t.pnl ?? 0;
      byPatternMap.set(c, e);
    }
  }
  const byPattern = Array.from(byPatternMap.entries())
    .map(([pattern, v]) => ({
      pattern,
      trades: v.trades,
      winRate: v.trades > 0 ? round2((v.wins / v.trades) * 100) : 0,
      pnl: round2(v.pnl),
    }))
    .sort((a, b) => b.trades - a.trades);

  // Best / worst trade.
  const bestTrade = closed.reduce<null | (typeof closed)[number]>((best, t) => (!best || (t.pnl ?? 0) > (best.pnl ?? 0) ? t : best), null);
  const worstTrade = closed.reduce<null | (typeof closed)[number]>((worst, t) => (!worst || (t.pnl ?? 0) < (worst.pnl ?? 0) ? t : worst), null);

  // Current streak (from most recent closed trades).
  let streakType: 'WIN' | 'LOSS' | null = null;
  let streakCount = 0;
  for (let i = closed.length - 1; i >= 0; i--) {
    const isWin = (closed[i].pnl ?? 0) > 0;
    const type = isWin ? 'WIN' : 'LOSS';
    if (streakType === null) {
      streakType = type;
      streakCount = 1;
    } else if (streakType === type) {
      streakCount++;
    } else {
      break;
    }
  }

  return NextResponse.json({
    account: {
      startingBalance: account.startingBalance,
      currentBalance: round2(account.currentBalance),
      name: account.name,
    },
    summary: {
      totalTrades: all.length,
      closedTrades: closed.length,
      openTrades: open.length,
      wins: wins.length,
      losses: losses.length,
      winRate: round2(winRate),
      avgWin: round2(avgWin),
      avgLoss: round2(avgLoss),
      profitFactor: profitFactor === Infinity ? null : round2(profitFactor),
      expectancy: round2(expectancy),
      avgRMultiple: round2(avgRMultiple),
      netPnl: round2(netPnl),
      netPnlPercent: account.startingBalance > 0 ? round2((netPnl / account.startingBalance) * 100) : 0,
      maxDrawdownPercent: round2(maxDrawdownPercent),
      streakType,
      streakCount,
    },
    equityCurve,
    rDistribution: buckets.map((b) => ({ label: b.label, count: b.count })),
    bySymbol,
    byPattern,
    bestTrade: bestTrade ? { symbol: bestTrade.symbol, pnl: round2(bestTrade.pnl ?? 0), rMultiple: bestTrade.rMultiple } : null,
    worstTrade: worstTrade ? { symbol: worstTrade.symbol, pnl: round2(worstTrade.pnl ?? 0), rMultiple: worstTrade.rMultiple } : null,
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
