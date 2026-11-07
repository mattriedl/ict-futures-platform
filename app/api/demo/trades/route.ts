export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/authz';
import { getOrCreateDemoAccount, evaluateOpenTrades, getDrawdownStatus } from '@/lib/demo-trades';
import { getInstrumentMeta, getPointValue } from '@/lib/instruments';
import { getLeverageForSymbol, computeNotional, computeRequiredMargin } from '@/lib/margin';

const createSchema = z.object({
  symbol: z.string().min(1),
  direction: z.enum(['LONG', 'SHORT']),
  entryPrice: z.number().positive(),
  stopLoss: z.number().positive(),
  takeProfit: z.number().positive(),
  // positionSize is OPTIONAL now. If omitted (or autoSize=true) the server sizes
  // the position from the account's risk-per-trade setting. If an explicit value
  // is supplied, it is honored for backward compatibility.
  positionSize: z.number().positive().optional(),
  autoSize: z.boolean().optional(),
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

  const account = await getOrCreateDemoAccount(user.id);

  // Prop-firm drawdown guard: if enforcement is on and a limit is already
  // breached, refuse to open a new trade.
  const drawdown = await getDrawdownStatus(user.id);
  if (drawdown.enforceDrawdown && (drawdown.dailyBreached || drawdown.overallBreached)) {
    const reason = drawdown.dailyBreached
      ? `Daily loss limit reached (${drawdown.todayLossPercent}% of ${drawdown.dailyLimitPercent}% allowed).`
      : `Overall drawdown limit reached (${drawdown.overallDrawdownPercent}% of ${drawdown.overallLimitPercent}% allowed).`;
    return NextResponse.json(
      { error: `Trade blocked: ${reason} New trades are disabled until drawdown recovers.`, drawdown },
      { status: 422 },
    );
  }

  const risk = Math.abs(data.entryPrice - data.stopLoss);
  const reward = Math.abs(data.takeProfit - data.entryPrice);
  const riskReward = risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;

  const instrument = await prisma.instrument.findUnique({ where: { symbol: data.symbol } });
  const meta = getInstrumentMeta(data.symbol);

  // Load user settings once — used for both risk-based sizing and leverage/margin.
  const userSettings = await prisma.userSettings.findUnique({ where: { userId: user.id } });

  // --- Position sizing -------------------------------------------------------
  // Honor an explicit positionSize (unless autoSize was requested). Otherwise
  // size the position so the trade risks ~riskPercent of the current balance:
  //   riskAmount  = currentBalance * riskPercent/100
  //   perUnitRisk = |entry - stop| * pointValue
  //   positionSize = riskAmount / perUnitRisk
  // This makes each new trade risk a consistent fraction of the account
  // regardless of asset class (futures / FX / crypto).
  let positionSize: number;
  if (data.positionSize != null && !data.autoSize) {
    positionSize = data.positionSize;
  } else {
    const riskPercent = userSettings?.riskPercent ?? 1;
    const pointValue = getPointValue(data.symbol, instrument?.pointValue);
    const perUnitRisk = risk * pointValue; // dollar risk per 1 unit/contract
    const riskAmount = account.currentBalance * (riskPercent / 100);
    if (perUnitRisk > 0 && riskAmount > 0) {
      const raw = riskAmount / perUnitRisk;
      // Round to 4 dp but never floor a positive size to zero.
      positionSize = Math.round(raw * 10000) / 10000;
      if (positionSize <= 0) positionSize = 0.0001;
    } else {
      positionSize = 1;
    }
  }

  // --- Margin / leverage guard ----------------------------------------------
  // Margin is RESERVED, not deducted. Available balance = current balance minus
  // the sum of margin reserved by all currently-open trades. A new trade is
  // refused if its required margin exceeds the available balance.
  const leverage = getLeverageForSymbol(data.symbol, userSettings);
  const notional = computeNotional(data.symbol, data.entryPrice, positionSize, instrument?.pointValue);
  const requiredMargin = computeRequiredMargin(
    data.symbol,
    data.entryPrice,
    positionSize,
    leverage,
    instrument?.pointValue,
  );

  const openMarginAgg = await prisma.demoTrade.aggregate({
    where: { userId: user.id, status: 'OPEN' },
    _sum: { margin: true },
  });
  const usedMargin = openMarginAgg._sum.margin ?? 0;
  const availableBalance = account.currentBalance - usedMargin;

  if (requiredMargin > availableBalance + 1e-6) {
    const round2 = (n: number) => Math.round(n * 100) / 100;
    return NextResponse.json(
      {
        error: `Insufficient available balance: this trade needs $${round2(requiredMargin).toFixed(
          2,
        )} margin (${leverage}x leverage on $${round2(notional).toFixed(
          2,
        )} notional) but only $${round2(availableBalance).toFixed(2)} is available.`,
        requiredMargin: round2(requiredMargin),
        availableBalance: round2(availableBalance),
        notional: round2(notional),
        leverage,
      },
      { status: 422 },
    );
  }

  const confluences =
    data.confluences == null
      ? null
      : typeof data.confluences === 'string'
      ? data.confluences
      : JSON.stringify(data.confluences);

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
      positionSize,
      margin: Math.round(requiredMargin * 100) / 100,
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
