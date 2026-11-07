export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { activatePendingTrades, runAutoTrade } from '@/lib/autotrade';
import { evaluateOpenTrades } from '@/lib/demo-trades';

function authorized(request: NextRequest): boolean {
  const secret = process.env.AUTOTRADE_SECRET;
  if (!secret) return false;
  const header = request.headers.get('x-autotrade-secret');
  const query = request.nextUrl.searchParams.get('secret');
  return header === secret || query === secret;
}

// POST: run one full autotrader cycle (activate pending -> resolve open -> scan & place).
export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const errors: any[] = [];
  const ranAt = new Date().toISOString();

  let activated = 0;
  let cancelled = 0;
  try {
    const r = await activatePendingTrades();
    activated = r.activated;
    cancelled = r.cancelled;
  } catch (e) {
    errors.push({ phase: 'activate', message: (e as Error)?.message });
  }

  let resolved = 0;
  try {
    resolved = await evaluateOpenTrades();
  } catch (e) {
    errors.push({ phase: 'evaluate', message: (e as Error)?.message });
  }

  const perUser: any[] = [];
  try {
    const enabledUsers = await prisma.userSettings.findMany({
      where: { autoTradeEnabled: true },
      select: { userId: true },
    });
    for (const u of enabledUsers) {
      try {
        const res = await runAutoTrade(u.userId);
        perUser.push({ userId: u.userId, ...res });
      } catch (e) {
        errors.push({ phase: 'scan', userId: u.userId, message: (e as Error)?.message });
      }
    }
  } catch (e) {
    errors.push({ phase: 'enumerate-users', message: (e as Error)?.message });
  }

  return NextResponse.json(
    { ok: true, ranAt, activated, cancelled, resolved, perUser, errors },
    { status: 200 },
  );
}

// GET: lightweight read-only status for manual testing (same secret).
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [pending, open, enabledUsers] = await Promise.all([
    prisma.demoTrade.count({ where: { status: 'PENDING' } }),
    prisma.demoTrade.count({ where: { status: 'OPEN' } }),
    prisma.userSettings.count({ where: { autoTradeEnabled: true } }),
  ]);

  return NextResponse.json({
    ok: true,
    pendingTrades: pending,
    openTrades: open,
    usersWithAutoTradeEnabled: enabledUsers,
    now: new Date().toISOString(),
  });
}
