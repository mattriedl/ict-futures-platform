export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/authz';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { user } = auth;

  const run = await prisma.backtestRun.findUnique({ where: { id: params.id } });
  if (!run || run.userId !== user.id) {
    return NextResponse.json({ error: 'Backtest not found' }, { status: 404 });
  }

  return NextResponse.json({
    run: {
      ...run,
      requiredConfluences: safeParse(run.requiredConfluences, []),
      equityCurve: safeParse(run.equityCurve, []),
      trades: safeParse(run.trades, []),
      config: run.config ? safeParse(run.config, null) : null,
    },
  });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { user } = auth;

  const run = await prisma.backtestRun.findUnique({ where: { id: params.id } });
  if (!run || run.userId !== user.id) {
    return NextResponse.json({ error: 'Backtest not found' }, { status: 404 });
  }
  await prisma.backtestRun.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
