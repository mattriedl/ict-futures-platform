export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/authz';
import { runBacktest, BacktestDataError } from '@/lib/backtest';

const configSchema = z.object({
  symbol: z.string().min(1),
  timeframe: z.enum(['1m', '5m', '15m', '1h', '4h', '1d']).default('15m'),
  days: z.number().int().min(1).max(60).default(60),
  requiredConfluences: z.array(z.string()).default([]),
  minAiScore: z.number().min(0).max(100).default(0),
  riskPerTrade: z.number().positive().default(1),
  intendedSizeUsd: z.number().positive().max(100000000).optional(),
});

export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { user } = auth;

  const runs = await prisma.backtestRun.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true, symbol: true, timeframe: true, startDate: true, endDate: true,
      totalTrades: true, wins: true, losses: true, winRate: true, avgRR: true,
      profitFactor: true, netR: true, netPnlPercent: true, maxDrawdownPercent: true,
      minAiScore: true, requiredConfluences: true, createdAt: true,
    },
  });

  return NextResponse.json({ runs });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { user } = auth;

  const settings = await prisma.appSettings.findUnique({ where: { id: 'global' } });
  if (settings && settings.backtestingEnabled === false) {
    return NextResponse.json({ error: 'Backtesting is disabled by the administrator.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = configSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }
  const config = parsed.data;

  let result;
  try {
    result = await runBacktest(config);
  } catch (e) {
    if (e instanceof BacktestDataError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    console.error('Backtest failed:', e);
    return NextResponse.json({ error: 'Backtest execution failed' }, { status: 500 });
  }

  const run = await prisma.backtestRun.create({
    data: {
      userId: user.id,
      symbol: result.symbol,
      timeframe: result.timeframe,
      startDate: new Date(result.startDate),
      endDate: new Date(result.endDate),
      requiredConfluences: JSON.stringify(config.requiredConfluences),
      minAiScore: config.minAiScore,
      riskPerTrade: config.riskPerTrade,
      config: JSON.stringify(config),
      totalTrades: result.totalTrades,
      wins: result.wins,
      losses: result.losses,
      winRate: result.winRate,
      avgRR: result.avgRR,
      profitFactor: result.profitFactor ?? 0,
      netR: result.netR,
      netPnlPercent: result.netPnlPercent,
      maxDrawdownPercent: result.maxDrawdownPercent,
      equityCurve: JSON.stringify(result.equityCurve),
      trades: JSON.stringify(result.trades),
    },
  });

  return NextResponse.json({ id: run.id, result }, { status: 201 });
}
