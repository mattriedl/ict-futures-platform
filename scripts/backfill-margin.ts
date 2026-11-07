/**
 * Backfill reserved margin for every currently-open demo trade.
 *
 * For each OPEN DemoTrade across all users, this computes the required margin
 * from the trade's entry price, position size and the instrument point value,
 * using the owning user's per-asset-class leverage settings (falling back to
 * the defaults crypto 1x / forex 30x / futures 10x when a user has no settings
 * row or an invalid value). The computed value is written to DemoTrade.margin.
 *
 * Margin is a reservation only — this script never touches balances, P&L, or
 * any other field, so it is safe and idempotent (re-running recomputes the same
 * value from the raw trade data).
 *
 * Run with:  npx tsx scripts/backfill-margin.ts
 */
import { PrismaClient } from '@prisma/client';
import { getLeverageForSymbol, computeRequiredMargin } from '../lib/margin';

const prisma = new PrismaClient();

async function main() {
  const openTrades = await prisma.demoTrade.findMany({
    where: { status: 'OPEN' },
    include: { instrument: true },
  });

  console.log(`Found ${openTrades.length} open demo trade(s) to backfill.`);

  // Cache each user's settings so we don't refetch per trade.
  const settingsCache = new Map<string, any>();

  let updated = 0;
  for (const trade of openTrades) {
    let settings = settingsCache.get(trade.userId);
    if (settings === undefined) {
      settings = await prisma.userSettings.findUnique({ where: { userId: trade.userId } });
      settingsCache.set(trade.userId, settings);
    }

    const leverage = getLeverageForSymbol(trade.symbol, settings);
    const requiredMargin = computeRequiredMargin(
      trade.symbol,
      trade.entryPrice,
      trade.positionSize,
      leverage,
      (trade as any).instrument?.pointValue,
    );
    const margin = Math.round(requiredMargin * 100) / 100;

    await prisma.demoTrade.update({
      where: { id: trade.id },
      data: { margin },
    });
    updated++;
    console.log(
      `  ${trade.symbol} (${trade.direction}) size=${trade.positionSize} entry=${trade.entryPrice} ` +
        `-> leverage=${leverage}x margin=$${margin.toFixed(2)}`,
    );
  }

  console.log(`Backfill complete: updated margin on ${updated} open trade(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
