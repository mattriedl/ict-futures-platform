// One-off: curate the crypto universe in the Instrument table.
//  - Add the newly introduced spot coins (BTC-USDT + majors).
//  - Retire broken sub-cent memecoins and the CME BTC future (BTC=F).
// Safe: removed symbols were verified to have zero demo trades. DemoTrade uses
// onDelete:SetNull; derived cache rows (snapshots/patterns) cascade away.
import { PrismaClient } from '@prisma/client';
import { INSTRUMENTS } from '../lib/instruments';

const prisma = new PrismaClient();

const REMOVE = [
  'SHIB-USDT', 'PEPE-USDT', 'BONK-USDT', 'FLOKI-USDT', 'GALA-USDT',
  'XDCUSD', 'BTTUSD', 'JASMYUSD',
  'BTC=F',
];

async function main() {
  // Upsert every instrument from the single source of truth (adds new coins,
  // refreshes metadata on existing ones). active=true for all listed.
  for (const inst of INSTRUMENTS) {
    await prisma.instrument.upsert({
      where: { symbol: inst.symbol },
      update: { name: inst.name, exchange: inst.exchange, tickSize: inst.tickSize, pointValue: inst.pointValue, active: true },
      create: { symbol: inst.symbol, name: inst.name, exchange: inst.exchange, tickSize: inst.tickSize, pointValue: inst.pointValue, active: true },
    });
  }

  const del = await prisma.instrument.deleteMany({ where: { symbol: { in: REMOVE } } });

  const total = await prisma.instrument.count();
  const crypto = await prisma.instrument.count({ where: { OR: [{ symbol: { endsWith: '-USDT' } }, { symbol: { endsWith: 'USD' } }] } });
  console.log(`Upserted ${INSTRUMENTS.length} instruments; removed ${del.count} retired symbols.`);
  console.log(`DB now has ${total} instruments total, ${crypto} crypto.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
