/**
 * FIX C — One-off reconciliation of historical FOREX demo trades.
 *
 * Background: the FOREX contract point value was previously mis-set to 100000
 * (a full standard lot notional) instead of 1000. Every closed FX trade's P&L
 * was therefore inflated by 100x, which cascaded into hugely inflated demo
 * account balances.
 *
 * This script recomputes pnl / pnlPercent / rMultiple for every CLOSED FX trade
 * (symbols ending in "=X") from their raw entry/exit/stop prices using the
 * corrected point value of 1000, then recomputes each affected demo account's
 * currentBalance = startingBalance + sum(pnl of all non-OPEN trades).
 *
 * It is IDEMPOTENT: results are recomputed from the raw prices every run, so
 * running it twice produces the same numbers. Only pnl/pnlPercent/rMultiple and
 * account balances are touched — entry/exit/stop/target/status are never changed.
 * FUTURES and CRYPTO trades are left completely untouched.
 *
 * Run with:  npx tsx scripts/reconcile-fx.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Corrected FOREX point value (matches lib/instruments.ts and the DB Instrument rows).
const FX_POINT_VALUE = 1000;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function main() {
  console.log('=== FIX C: FOREX demo-trade reconciliation ===\n');

  // All CLOSED forex trades (symbol like %=X, status WIN or LOSS).
  const fxTrades = await prisma.demoTrade.findMany({
    where: {
      status: { in: ['WIN', 'LOSS'] },
      symbol: { endsWith: '=X' },
    },
  });

  console.log(`Found ${fxTrades.length} closed FOREX trades to reconcile.\n`);

  let totalPnlBefore = 0;
  let totalPnlAfter = 0;
  let updated = 0;

  for (const t of fxTrades) {
    const entry = t.entryPrice;
    const exit = t.exitPrice;
    if (entry == null || exit == null) continue;

    const dir = t.direction === 'LONG' ? 1 : -1;
    const priceMove = (exit - entry) * dir;
    const size = t.positionSize ?? 0;

    const newPnl = round2(priceMove * FX_POINT_VALUE * size);
    const denom = entry * FX_POINT_VALUE * size;
    const newPnlPercent = denom !== 0 ? round2((newPnl / denom) * 100) : 0;
    const initialRisk = t.stopLoss != null ? Math.abs(entry - t.stopLoss) : 0;
    const newRMultiple = initialRisk !== 0 ? round2(priceMove / initialRisk) : 0;

    totalPnlBefore += t.pnl ?? 0;
    totalPnlAfter += newPnl;

    // Only update if something actually changes (keeps the run cheap + idempotent).
    if (
      (t.pnl ?? 0) !== newPnl ||
      (t.pnlPercent ?? 0) !== newPnlPercent ||
      (t.rMultiple ?? 0) !== newRMultiple
    ) {
      await prisma.demoTrade.update({
        where: { id: t.id },
        data: { pnl: newPnl, pnlPercent: newPnlPercent, rMultiple: newRMultiple },
      });
      updated++;
    }
  }

  console.log(`Recomputed ${fxTrades.length} FX trades, updated ${updated}.`);
  console.log(`Total FX P&L before: ${round2(totalPnlBefore)}`);
  console.log(`Total FX P&L after:  ${round2(totalPnlAfter)}\n`);

  // Recompute affected demo-account balances.
  const accounts = await prisma.demoAccount.findMany({ include: { user: true } });

  console.log('=== Demo account balances ===');
  for (const acct of accounts) {
    const closed = await prisma.demoTrade.findMany({
      where: { userId: acct.userId, status: { not: 'OPEN' } },
      select: { pnl: true },
    });
    const sumPnl = closed.reduce((s, c) => s + (c.pnl ?? 0), 0);
    const newBalance = round2(acct.startingBalance + sumPnl);
    const oldBalance = acct.currentBalance;

    if (newBalance !== oldBalance) {
      await prisma.demoAccount.update({
        where: { id: acct.id },
        data: { currentBalance: newBalance },
      });
    }

    console.log(
      `  ${acct.user?.email ?? acct.userId}: ${oldBalance} -> ${newBalance}` +
        (newBalance !== oldBalance ? '  (updated)' : '  (unchanged)')
    );
  }

  console.log('\n=== Reconciliation complete ===');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
