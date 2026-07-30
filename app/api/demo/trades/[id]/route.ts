export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/authz';
import { computeTradePnl } from '@/lib/demo-trades';

const patchSchema = z.object({
  exitPrice: z.number().positive().optional(), // manual close
  notes: z.string().nullable().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { user } = auth;

  const trade = await prisma.demoTrade.findUnique({
    where: { id: params.id },
    include: { instrument: true },
  });
  if (!trade || trade.userId !== user.id) {
    return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
  }

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
  const { exitPrice, notes } = parsed.data;

  // Manual close at a provided exit price (only allowed while OPEN).
  if (exitPrice != null) {
    if (trade.status !== 'OPEN') {
      return NextResponse.json({ error: 'Only open trades can be closed manually.' }, { status: 400 });
    }
    const pnlRes = computeTradePnl(trade, exitPrice, trade.instrument?.pointValue);
    // Atomic close guarded on status='OPEN' so a double-click or a concurrent
    // auto-evaluation can never credit the balance twice for the same trade.
    const applied = await prisma.$transaction(async (tx) => {
      const res = await tx.demoTrade.updateMany({
        where: { id: trade.id, status: 'OPEN' },
        data: {
          status: 'CLOSED_MANUAL',
          outcome: pnlRes.pnl >= 0 ? 'WIN' : 'LOSS',
          exitPrice,
          pnl: pnlRes.pnl,
          pnlPercent: pnlRes.pnlPercent,
          rMultiple: pnlRes.rMultiple,
          closedAt: new Date(),
          ...(notes !== undefined ? { notes } : {}),
        },
      });
      if (res.count !== 1) return false;
      await tx.demoAccount.update({
        where: { userId: user.id },
        data: { currentBalance: { increment: pnlRes.pnl } },
      });
      return true;
    });
    if (!applied) {
      return NextResponse.json({ error: 'Trade is no longer open.' }, { status: 409 });
    }
    const updated = await prisma.demoTrade.findUnique({ where: { id: trade.id } });
    return NextResponse.json({ trade: updated });
  }

  // Notes-only update.
  const updated = await prisma.demoTrade.update({
    where: { id: trade.id },
    data: { ...(notes !== undefined ? { notes } : {}) },
  });
  return NextResponse.json({ trade: updated });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { user } = auth;

  const trade = await prisma.demoTrade.findUnique({ where: { id: params.id } });
  if (!trade || trade.userId !== user.id) {
    return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
  }

  // If a realized trade is deleted, roll its P&L back out of the balance.
  if (trade.pnl != null && trade.status !== 'OPEN') {
    await prisma.$transaction([
      prisma.demoAccount.update({
        where: { userId: user.id },
        data: { currentBalance: { decrement: trade.pnl } },
      }),
      prisma.demoTrade.delete({ where: { id: trade.id } }),
    ]);
  } else {
    await prisma.demoTrade.delete({ where: { id: trade.id } });
  }

  return NextResponse.json({ ok: true });
}
