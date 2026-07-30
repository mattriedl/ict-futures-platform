import { prisma } from '@/lib/prisma';
import { getPointValue } from '@/lib/instruments';
import { fetchYahooFinanceData, getCurrentPrice } from '@/lib/yahoo-finance';
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
    try {
      bars = await fetchYahooFinanceData(symbol, timeframe);
    } catch {
      continue; // skip this group on data failure; will retry next evaluation
    }
    if (!bars || bars.length === 0) continue;

    for (const trade of trades) {
      // Only consider bars that occurred at/after the trade opened.
      const openedMs = new Date(trade.openedAt).getTime();
      const forwardBars = bars.filter((b) => b.timestamp >= openedMs);
      const scanBars = forwardBars.length > 0 ? forwardBars : bars.slice(-1);

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
              closedAt: new Date(),
            },
          });
          if (res.count !== 1) return false;
          await tx.demoAccount.update({
            where: { userId: trade.userId },
            data: { currentBalance: { increment: pnlRes.pnl } },
          });
          return true;
        });
        if (applied) resolvedCount++;
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

/** Unrealized P&L for an open trade at the latest available price. */
export async function getUnrealizedPnl(trade: DemoTrade): Promise<number> {
  try {
    const bars = await fetchYahooFinanceData(trade.symbol, trade.timeframe);
    const price = getCurrentPrice(bars);
    if (!price) return 0;
    return computeTradePnl(trade, price, (trade as any).instrument?.pointValue).pnl;
  } catch {
    return 0;
  }
}
