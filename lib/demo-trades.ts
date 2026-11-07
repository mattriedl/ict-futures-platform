import { prisma } from '@/lib/prisma';
import { getPointValue } from '@/lib/instruments';
import { fetchMarketData, fetchMarketDataWithMeta, getCurrentPrice } from '@/lib/market-data';
import type { DemoTrade } from '@prisma/client';

// ---------------------------------------------------------------------------
// Demo (paper) trading helpers
// ---------------------------------------------------------------------------

/** Get the user's demo account, creating one from AppSettings default if absent. */
export async function getOrCreateDemoAccount(userId: string) {
  let account = await prisma.demoAccount.findUnique({ where: { userId } });
  if (!account) {
    const settings = await prisma.appSettings.findUnique({ where: { id: 'global' } });
    const startingBalance = settings?.defaultStartingBalance ?? 100000;
    account = await prisma.demoAccount.create({
      data: { userId, startingBalance, currentBalance: startingBalance },
    });
  }
  return account;
}

export interface PnlResult {
  pnl: number;         // dollar P&L
  pnlPercent: number;  // % of notional risked position (relative to entry notional)
  rMultiple: number;   // reward measured in units of initial risk (R)
}

/**
 * Compute realized P&L for a trade given an exit price.
 * LONG:  profit when exit > entry.  SHORT: profit when exit < entry.
 * rMultiple = price move in favor / initial risk (entry->stop distance).
 */
export function computeTradePnl(
  trade: Pick<DemoTrade, 'direction' | 'entryPrice' | 'stopLoss' | 'positionSize' | 'symbol'>,
  exitPrice: number,
  dbPointValue?: number | null,
): PnlResult {
  const pointValue = getPointValue(trade.symbol, dbPointValue);
  const dir = trade.direction === 'LONG' ? 1 : -1;

  const priceMove = (exitPrice - trade.entryPrice) * dir; // positive = in favor
  const pnl = priceMove * pointValue * trade.positionSize;

  const initialRisk = Math.abs(trade.entryPrice - trade.stopLoss);
  const rMultiple = initialRisk > 0 ? priceMove / initialRisk : 0;

  const entryNotional = trade.entryPrice * pointValue * trade.positionSize;
  const pnlPercent = entryNotional > 0 ? (pnl / entryNotional) * 100 : 0;

  return {
    pnl: round2(pnl),
    pnlPercent: round2(pnlPercent),
    rMultiple: round2(rMultiple),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Detect whether an OPEN trade's TP or SL has been hit given the latest candle.
 * We use the candle high/low (not just close) so intrabar touches are captured.
 * If BOTH are touched in the same bar we conservatively assume the STOP hit first.
 * Returns the resolved outcome or null if still open.
 */
function resolveAgainstBar(
  trade: Pick<DemoTrade, 'direction' | 'takeProfit' | 'stopLoss'>,
  barHigh: number,
  barLow: number,
): { status: 'WIN' | 'LOSS'; exitPrice: number } | null {
  if (trade.direction === 'LONG') {
    const hitTP = barHigh >= trade.takeProfit;
    const hitSL = barLow <= trade.stopLoss;
    if (hitSL && hitTP) return { status: 'LOSS', exitPrice: trade.stopLoss }; // conservative
    if (hitTP) return { status: 'WIN', exitPrice: trade.takeProfit };
    if (hitSL) return { status: 'LOSS', exitPrice: trade.stopLoss };
  } else {
    const hitTP = barLow <= trade.takeProfit;
    const hitSL = barHigh >= trade.stopLoss;
    if (hitSL && hitTP) return { status: 'LOSS', exitPrice: trade.stopLoss }; // conservative
    if (hitTP) return { status: 'WIN', exitPrice: trade.takeProfit };
    if (hitSL) return { status: 'LOSS', exitPrice: trade.stopLoss };
  }
  return null;
}

/**
 * Evaluate all OPEN demo trades for a user (or all users if userId omitted).
 * For each open trade we fetch recent candles since the trade opened and check
 * whether price reached TP or SL. Wins/losses are realized and the demo account
 * balance is adjusted. Returns the number of trades resolved.
 */
export async function evaluateOpenTrades(userId?: string): Promise<number> {
  const openTrades = await prisma.demoTrade.findMany({
    where: { status: 'OPEN', ...(userId ? { userId } : {}) },
    include: { instrument: true },
  });
  if (openTrades.length === 0) return 0;

  // Group by symbol+timeframe to minimize data fetches.
  const key = (t: DemoTrade) => `${t.symbol}|${t.timeframe}`;
  const groups = new Map<string, DemoTrade[]>();
  for (const t of openTrades) {
    const k = key(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }

  let resolvedCount = 0;

  for (const [k, trades] of Array.from(groups.entries())) {
    const [symbol, timeframe] = k.split('|');
    let bars;
    let source = 'unknown';
    try {
      const meta = await fetchMarketDataWithMeta(symbol, timeframe);
      // REAL-DATA-ONLY: if the feed fell back to synthetic (fake) bars, treat it
      // exactly like a data failure — skip the whole group so trades stay OPEN
      // and are retried next cycle. Trades must only ever resolve against real
      // market data.
      if (meta.synthetic) continue;
      bars = meta.bars;
      source = meta.source;
    } catch {
      continue; // skip this group on data failure; will retry next evaluation
    }
    if (!bars || bars.length === 0) continue;

    // Duration of a single candle per timeframe (ms). Used as a minimum-age
    // guard so a freshly opened trade isn't evaluated before at least one full
    // candle has had a chance to form.
    const barDurationMs: Record<string, number> = {
      '1m': 60000,
      '5m': 300000,
      '15m': 900000,
      '1h': 3600000,
      '4h': 14400000,
      '1d': 86400000,
    };

    for (const trade of trades) {
      const openedMs = new Date(trade.openedAt).getTime();

      // Minimum-age guard: skip the trade until at least one full candle
      // duration has elapsed since it opened. This prevents evaluating brand-new
      // trades against stale/partial data on page load.
      const minAge = barDurationMs[trade.timeframe] ?? 0;
      if (Date.now() - openedMs < minAge) continue;

      // Only consider bars that formed strictly AFTER the trade opened. Bars
      // that were already in progress (or predate the trade) must be excluded,
      // otherwise the entry bar's own high/low can instantly trip the SL/TP.
      const forwardBars = bars.filter((b) => b.timestamp > openedMs);
      // If no forward bars exist yet, skip the trade — never fall back to
      // historical bars that predate the trade.
      const scanBars = forwardBars.length > 0 ? forwardBars : [];

      let resolution: { status: 'WIN' | 'LOSS'; exitPrice: number } | null = null;
      for (const bar of scanBars) {
        resolution = resolveAgainstBar(trade, bar.high, bar.low);
        if (resolution) break;
      }

      if (resolution) {
        const pnlRes = computeTradePnl(
          trade,
          resolution.exitPrice,
          (trade as any).instrument?.pointValue,
        );
        // Atomically flip the trade OPEN -> WIN/LOSS and credit the balance.
        // The status='OPEN' guard makes this safe against concurrent evaluations
        // (e.g. stats/account/trades endpoints running in parallel): only the
        // first transaction matches the row and increments the balance; any
        // concurrent call sees status already changed (count 0) and skips.
        const applied = await prisma.$transaction(async (tx) => {
          const res = await tx.demoTrade.updateMany({
            where: { id: trade.id, status: 'OPEN' },
            data: {
              status: resolution!.status,
              outcome: resolution!.status,
              exitPrice: resolution!.exitPrice,
              pnl: pnlRes.pnl,
              pnlPercent: pnlRes.pnlPercent,
              rMultiple: pnlRes.rMultiple,
              dataSource: 'REAL:' + source,
              closedAt: new Date(),
              // Release reserved margin when the position closes.
              margin: null,
            },
          });
          if (res.count !== 1) return false;
          await tx.demoAccount.update({
            where: { userId: trade.userId },
            data: { currentBalance: { increment: pnlRes.pnl } },
          });
          return true;
        });
        if (applied) {
          resolvedCount++;
          // Learning store: link this realized outcome back to the most relevant
          // recent un-resolved SetupLog for the same user+symbol+direction.
          // Best-effort — never let a logging failure affect trade resolution.
          try {
            const match = await prisma.setupLog.findFirst({
              where: {
                userId: trade.userId,
                symbol: trade.symbol,
                direction: trade.direction,
                outcome: null,
                detectedAt: { lte: new Date() },
              },
              orderBy: { detectedAt: 'desc' },
              select: { id: true },
            });
            if (match) {
              await prisma.setupLog.update({
                where: { id: match.id },
                data: {
                  demoTradeId: trade.id,
                  outcome: resolution!.status,
                  rMultiple: pnlRes.rMultiple,
                  resolvedAt: new Date(),
                },
              });
            }
          } catch (linkErr) {
            console.error('SetupLog outcome link skipped:', (linkErr as Error)?.message);
          }
        }
      }
    }
  }

  return resolvedCount;
}

/**
 * Recompute the demo account's currentBalance authoritatively as
 *   startingBalance + sum(pnl of all realized/closed trades)
 * and persist it if it drifted. This is idempotent and self-heals any
 * residual drift, so the displayed balance is always internally consistent.
 * Returns the reconciled account.
 */
export async function reconcileDemoBalance(userId: string) {
  const account = await getOrCreateDemoAccount(userId);
  const agg = await prisma.demoTrade.aggregate({
    where: { userId, status: { not: 'OPEN' } },
    _sum: { pnl: true },
  });
  const realized = agg._sum.pnl ?? 0;
  const expected = round2(account.startingBalance + realized);
  if (Math.abs(expected - account.currentBalance) > 0.005) {
    return prisma.demoAccount.update({
      where: { userId },
      data: { currentBalance: expected },
    });
  }
  return account;
}

export interface DrawdownStatus {
  dayStartBalance: number;      // balance at the start of "today"
  currentBalance: number;       // account currentBalance now
  startingBalance: number;      // account startingBalance
  todayRealizedPnl: number;     // realized P&L of trades closed today
  todayLossPercent: number;     // today's loss as % of dayStartBalance (0 if net positive)
  peakBalance: number;          // trailing high-water mark of the account balance
  overallDrawdownPercent: number; // drawdown from peak balance, as % of peak (0 if at peak)
  dailyLimitPercent: number;    // configured daily-loss limit
  overallLimitPercent: number;  // configured overall-drawdown limit
  dailyBreached: boolean;
  overallBreached: boolean;
  enforceDrawdown: boolean;
}

/**
 * Prop-firm style drawdown status for a user.
 *
 * "Today" is measured from local server midnight (the server runs in UTC, so
 * this is effectively the current UTC day).
 *
 * dayStartBalance = startingBalance + P&L of all trades closed BEFORE today.
 * overallDrawdownPercent is measured against an approximate running peak:
 *   peak = max(startingBalance, dayStartBalance, currentBalance).
 * This is a simple, documented approximation (it does not replay every historic
 * balance point) that is exact whenever the peak is the current or day-start
 * balance, which is the common case for a monotonically-trending demo account.
 */
export async function getDrawdownStatus(userId: string): Promise<DrawdownStatus> {
  const account = await getOrCreateDemoAccount(userId);

  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const dailyLimitPercent = settings?.maxDailyLossPercent ?? 4;
  const overallLimitPercent = settings?.maxOverallDrawdownPercent ?? 6;
  const enforceDrawdown = settings?.enforceDrawdown ?? false;

  // Start of "today" in server (UTC) time.
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  // P&L of trades closed before today -> gives the balance at day start.
  const beforeAgg = await prisma.demoTrade.aggregate({
    where: { userId, status: { not: 'OPEN' }, closedAt: { lt: todayStart } },
    _sum: { pnl: true },
  });
  const realizedBeforeToday = beforeAgg._sum.pnl ?? 0;
  const dayStartBalance = round2(account.startingBalance + realizedBeforeToday);

  // Realized P&L of trades closed today.
  const todayAgg = await prisma.demoTrade.aggregate({
    where: { userId, status: { not: 'OPEN' }, closedAt: { gte: todayStart } },
    _sum: { pnl: true },
  });
  const todayRealizedPnl = round2(todayAgg._sum.pnl ?? 0);

  const todayLossPercent =
    dayStartBalance > 0 && todayRealizedPnl < 0
      ? round2((Math.abs(todayRealizedPnl) / dayStartBalance) * 100)
      : 0;

  // Overall drawdown is measured from the trailing HIGH-WATER MARK (peak balance
  // ever reached), the way prop firms do it — not merely from the starting balance.
  // Reconstruct the running balance as startingBalance + cumulative realized P&L,
  // ordered by close time, and take the max of that series, the starting balance
  // and the current balance. Single query, folded in JS.
  const closedInOrder = await prisma.demoTrade.findMany({
    where: { userId, status: { not: 'OPEN' } },
    orderBy: [{ closedAt: 'asc' }, { createdAt: 'asc' }],
    select: { pnl: true },
  });
  let running = account.startingBalance;
  let peak = account.startingBalance;
  for (const t of closedInOrder) {
    running += t.pnl ?? 0;
    if (running > peak) peak = running;
  }
  // Guard against any residual drift; the current balance is always a valid point.
  peak = Math.max(peak, account.startingBalance, account.currentBalance);
  const peakBalance = round2(peak);

  const overallDrawdownPercent =
    peak > 0 && account.currentBalance < peak
      ? round2(((peak - account.currentBalance) / peak) * 100)
      : 0;

  return {
    dayStartBalance,
    currentBalance: round2(account.currentBalance),
    startingBalance: account.startingBalance,
    todayRealizedPnl,
    todayLossPercent,
    peakBalance,
    overallDrawdownPercent,
    dailyLimitPercent,
    overallLimitPercent,
    dailyBreached: todayLossPercent >= dailyLimitPercent,
    overallBreached: overallDrawdownPercent >= overallLimitPercent,
    enforceDrawdown,
  };
}

/** Unrealized P&L for an open trade at the latest available price. */
export async function getUnrealizedPnl(trade: DemoTrade): Promise<number> {
  try {
    const bars = await fetchMarketData(trade.symbol, trade.timeframe);
    const price = getCurrentPrice(bars);
    if (!price) return 0;
    return computeTradePnl(trade, price, (trade as any).instrument?.pointValue).pnl;
  } catch {
    return 0;
  }
}
