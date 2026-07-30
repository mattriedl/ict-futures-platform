/**
 * Idempotent bootstrap for the ICT Futures platform.
 *  - Ensures the AppSettings 'global' singleton exists.
 *  - Upserts all supported instruments from lib/instruments.ts.
 *  - Promotes the platform owner (mattriedl@hotmail.com) to ADMIN if present.
 *
 * Run:  npx tsx --require dotenv/config scripts/bootstrap.ts
 */
import { PrismaClient } from '@prisma/client';
import { INSTRUMENTS } from '../lib/instruments';
import { OWNER_EMAIL } from '../lib/auth';

const prisma = new PrismaClient();

async function main() {
  // 1. AppSettings singleton
  const settings = await prisma.appSettings.upsert({
    where: { id: 'global' },
    update: {},
    create: { id: 'global' },
  });
  console.log('✔ AppSettings ready:', settings.id, `(defaultStartingBalance=${settings.defaultStartingBalance})`);

  // 2. Instruments
  let created = 0;
  let updated = 0;
  for (const inst of INSTRUMENTS) {
    const res = await prisma.instrument.upsert({
      where: { symbol: inst.symbol },
      update: { name: inst.name, exchange: inst.exchange, tickSize: inst.tickSize, pointValue: inst.pointValue },
      create: {
        symbol: inst.symbol,
        name: inst.name,
        exchange: inst.exchange,
        tickSize: inst.tickSize,
        pointValue: inst.pointValue,
        active: true,
      },
    });
    if (res.createdAt.getTime() > Date.now() - 5000) created++;
    else updated++;
  }
  console.log(`✔ Instruments upserted: ${INSTRUMENTS.length} total (~${created} new, ~${updated} existing)`);

  // 3. Promote owner to ADMIN
  const owner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });
  if (owner) {
    if (owner.role !== 'ADMIN') {
      await prisma.user.update({ where: { id: owner.id }, data: { role: 'ADMIN' } });
      console.log(`✔ Promoted owner ${OWNER_EMAIL} to ADMIN`);
    } else {
      console.log(`✔ Owner ${OWNER_EMAIL} already ADMIN`);
    }
  } else {
    console.log(`ℹ Owner ${OWNER_EMAIL} not registered yet — will be promoted automatically on first login.`);
  }

  console.log('Bootstrap complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
