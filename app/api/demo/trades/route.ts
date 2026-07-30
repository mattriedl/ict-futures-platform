export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/authz';
import { getOrCreateDemoAccount, evaluateOpenTrades } from '@/lib/demo-trades';
import { getInstrumentMeta } from '@/lib/instruments';

const createSchema = z.object({
  symbol: z.string().min(1),
  direction: z.enum(['LONG', 'SHORT']),
  entryPrice: z.number().positive(),
  stopLoss: z.number().positive(),
  takeProfit: z.number().positive(),
  positionSize: z.number().positive().default(1),
  timeframe: z.string().default('15m'),
  source: z.enum(['ONE_CLICK', 'MANUAL']).default('MANUAL'),
  aiScore: z.number().nullable().optional(),
  confluences: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  tradeSetupId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { user } = auth;

  // Refresh open trades before returning so statuses are current.
  try {
    await evaluateOpenTrades(user.id);
  } catch (e) {
    console.warn('evaluateOpenTrades failed:', (e as Error).message);
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? undefined;
  const symbol = searchParams.get('symbol') ?? undefined;
  const take = Math.min(parseInt(searchParams.get('take') ?? '100', 10), 500);

  const trades = await prisma.demoTrade.findMany({
    where: { userId: user.id, ...(status ? { status } : {}), ...(symbol ? { symbol } : {}) },
    orderBy: { openedAt: 'desc' },
    take,
  });

  return NextResponse.json({ trades });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { user } = auth;

  // Respect the global one-click trading toggle for ONE_CLICK trades.
  const settings = await prisma.appSettings.findUnique({ where: { id: 'global' } });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  if (data.source === 'ONE_CLICK' && settings && settings.oneClickTradingEnabled === false) {
    return NextResponse.json({ error: 'One-click trading is disabled by the administrator.' }, { status: 403 });
  }

  // Validate stop/target orientation relative to direction & entry.
  if (data.direction === 'LONG' && !(data.stopLoss < data.entryPrice && data.takeProfit > data.entryPrice)) {
    return NextResponse.json({ error: 'For LONG: stop must be below entry and target above entry.' }, { status: 400 });
  }
  if (data.direction === 'SHORT' && !(data.stopLoss > data.entryPrice && data.takeProfit < data.entryPrice)) {
    return NextResponse.json({ error: 'For SHORT: stop must be above entry and target below entry.' }, { status: 400 });
  }

  await getOrCreateDemoAccount(user.id);

  const risk = Math.abs(data.entryPrice - data.stopLoss);
  const reward = Math.abs(data.takeProfit - data.entryPrice);
  const riskReward = risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;

  const confluences =
    data.confluences == null
      ? null
      : typeof data.confluences === 'string'
      ? data.confluences
      : JSON.stringify(data.confluences);

  const instrument = await prisma.instrument.findUnique({ where: { symbol: data.symbol } });
  const meta = getInstrumentMeta(data.symbol);

  const trade = await prisma.demoTrade.create({
    data: {
      userId: user.id,
      instrumentId: instrument?.id ?? null,
      symbol: data.symbol,
      direction: data.direction,
      source: data.source,
      entryPrice: data.entryPrice,
      stopLoss: data.stopLoss,
      takeProfit: data.takeProfit,
      positionSize: data.positionSize,
      riskReward,
      aiScore: data.aiScore ?? null,
      confluences,
      timeframe: data.timeframe,
      status: 'OPEN',
      tradeSetupId: data.tradeSetupId ?? null,
      notes: data.notes ?? null,
    },
  });

  return NextResponse.json({ trade, meta }, { status: 201 });
}
