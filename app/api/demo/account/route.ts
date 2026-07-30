export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/authz';
import { getOrCreateDemoAccount, evaluateOpenTrades, reconcileDemoBalance } from '@/lib/demo-trades';

export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { user } = auth;

  try {
    await evaluateOpenTrades(user.id);
  } catch {
    /* non-fatal */
  }

  const account = await reconcileDemoBalance(user.id);

  const closed = await prisma.demoTrade.findMany({
    where: { userId: user.id, status: { in: ['WIN', 'LOSS', 'CLOSED_MANUAL'] } },
    select: { pnl: true },
  });
  const realizedPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const openCount = await prisma.demoTrade.count({ where: { userId: user.id, status: 'OPEN' } });

  return NextResponse.json({
    account,
    realizedPnl: Math.round(realizedPnl * 100) / 100,
    openTrades: openCount,
  });
}

const patchSchema = z.object({
  startingBalance: z.number().positive().optional(),
  reset: z.boolean().optional(),
  name: z.string().min(1).optional(),
});

export async function PATCH(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { user } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }
  const { startingBalance, reset, name } = parsed.data;

  await getOrCreateDemoAccount(user.id);

  // Full reset: wipe trades and reset balance to (new or existing) starting balance.
  if (reset) {
    await prisma.demoTrade.deleteMany({ where: { userId: user.id } });
    const existing = await prisma.demoAccount.findUnique({ where: { userId: user.id } });
    const base = startingBalance ?? existing?.startingBalance ?? 100000;
    const account = await prisma.demoAccount.update({
      where: { userId: user.id },
      data: { startingBalance: base, currentBalance: base, ...(name ? { name } : {}) },
    });
    return NextResponse.json({ account, reset: true });
  }

  // Edit starting balance: recompute current = new starting + realized P&L.
  if (startingBalance != null) {
    const closed = await prisma.demoTrade.findMany({
      where: { userId: user.id, status: { in: ['WIN', 'LOSS', 'CLOSED_MANUAL'] } },
      select: { pnl: true },
    });
    const realizedPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const account = await prisma.demoAccount.update({
      where: { userId: user.id },
      data: {
        startingBalance,
        currentBalance: Math.round((startingBalance + realizedPnl) * 100) / 100,
        ...(name ? { name } : {}),
      },
    });
    return NextResponse.json({ account });
  }

  // Name-only update.
  if (name) {
    const account = await prisma.demoAccount.update({ where: { userId: user.id }, data: { name } });
    return NextResponse.json({ account });
  }

  return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
}
