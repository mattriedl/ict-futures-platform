import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { INSTRUMENTS } from '../lib/instruments';

const prisma = new PrismaClient();

async function main() {
  // Optional test account — created ONLY when both env vars are set, so a fresh
  // server never ships with a login whose password is known from source control.
  const testEmail = process.env.SEED_TEST_USER_EMAIL;
  const testPassword = process.env.SEED_TEST_USER_PASSWORD;
  if (testEmail && testPassword) {
    const hashedPassword = await bcrypt.hash(testPassword, 10);
    await prisma.user.upsert({
      where: { email: testEmail },
      update: {},
      create: {
        email: testEmail,
        name: 'Test User',
        password: hashedPassword,
        settings: {
          create: {
            refreshInterval: 60,
            theme: 'dark',
            trackedSymbols: 'ES=F,NQ=F,CL=F,GC=F',
            alertMinScore: 60,
          },
        },
      },
    });
    console.log(`Seeded test user ${testEmail}`);
  } else {
    console.log('Skipping test user (set SEED_TEST_USER_EMAIL and SEED_TEST_USER_PASSWORD to create one).');
  }

  // Seed all instruments from the single source of truth (lib/instruments.ts):
  // 15 CME/CBOT/NYMEX/COMEX futures + 22 crypto spot (OKX + Kraken) + 28 forex
  // (Yahoo FX "=X") = 65 total. Crypto names are already suffixed "(Crypto)".
  for (const inst of INSTRUMENTS) {
    const data = {
      symbol: inst.symbol,
      name: inst.name,
      exchange: inst.exchange,
      tickSize: inst.tickSize,
      pointValue: inst.pointValue,
    };
    await prisma.instrument.upsert({
      where: { symbol: inst.symbol },
      update: { name: data.name, exchange: data.exchange, tickSize: data.tickSize, pointValue: data.pointValue },
      create: data,
    });
  }
  console.log(`Seeded ${INSTRUMENTS.length} instruments (futures + crypto spot).`);

  // Seed historical pattern outcomes for AI learning
  const patternTypes = ['ORDER_BLOCK', 'FVG', 'LIQUIDITY_SWEEP', 'MSS_BOS', 'OTE', 'BREAKER_BLOCK', 'MITIGATION_BLOCK'];
  const directions = ['BULLISH', 'BEARISH'];
  const outcomes = ['WIN', 'LOSS'];
  const symbols = ['ES=F', 'NQ=F', 'CL=F', 'GC=F'];
  const timeframes = ['5m', '15m', '1h', '4h', '1d'];

  // Win rates per pattern type (realistic)
  const winRates: Record<string, number> = {
    'ORDER_BLOCK': 0.68,
    'FVG': 0.62,
    'LIQUIDITY_SWEEP': 0.71,
    'MSS_BOS': 0.65,
    'OTE': 0.73,
    'BREAKER_BLOCK': 0.58,
    'MITIGATION_BLOCK': 0.60,
  };

  let seedIndex = 0;
  for (const pt of patternTypes) {
    for (const sym of symbols) {
      for (const tf of timeframes) {
        const totalSetups = 15 + (seedIndex % 10);
        const wr = winRates[pt] ?? 0.6;
        const wins = Math.round(totalSetups * wr);
        for (let i = 0; i < totalSetups; i++) {
          const isWin = i < wins;
          const dir = directions[i % 2] ?? 'BULLISH';
          const basePrice = sym === 'ES=F' ? 5500 : sym === 'NQ=F' ? 19000 : sym === 'CL=F' ? 72 : 2400;
          const offset = (seedIndex * 7 + i * 3) % 100;
          await prisma.patternOutcome.upsert({
            where: { id: `seed-${pt}-${sym}-${tf}-${i}` },
            update: {},
            create: {
              id: `seed-${pt}-${sym}-${tf}-${i}`,
              patternType: pt,
              direction: dir,
              instrumentSymbol: sym,
              timeframe: tf,
              entryPrice: basePrice + offset,
              exitPrice: isWin ? basePrice + offset + (dir === 'BULLISH' ? 20 : -20) : basePrice + offset + (dir === 'BULLISH' ? -10 : 10),
              outcome: isWin ? 'WIN' : 'LOSS',
              pnlPercent: isWin ? 1.5 + (i % 5) * 0.3 : -(0.8 + (i % 3) * 0.2),
            },
          });
        }
        seedIndex++;
      }
    }
  }

  console.log('Seed completed successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
