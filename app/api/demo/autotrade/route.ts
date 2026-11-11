export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { activatePendingTrades, runAutoTrade } from '@/lib/autotrade';
import { evaluateOpenTrades } from '@/lib/demo-trades';
import { runAlertScan } from '@/lib/alerts';
import { timingSafeEqual } from 'crypto';

function safeEqual(a: string | null, b: string): boolean {
  if (!a) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.AUTOTRADE_SECRET;
  if (!secret) return false;
  const header = request.headers.get('x-autotrade-secret');
  const query = request.nextUrl.searchParams.get('secret');
  return safeEqual(header, secret) || safeEqual(query, secret);
}

// A full cycle scans every active instrument; allow it time to finish.
export const maxDuration = 300;

// POST: run one full scheduled cycle (activate pending -> resolve open -> scan & place -> setup alerts).
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

  let alerts: Awaited<ReturnType<typeof runAlertScan>> | null = null;
  try {
    alerts = await runAlertScan();
  } catch (e) {
    errors.push({ phase: 'alerts', message: (e as Error)?.message });
  }

  return NextResponse.json(
    { ok: true, ranAt, activated, cancelled, resolved, perUser, alerts, errors },
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
