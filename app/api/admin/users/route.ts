export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { prisma } from '@/lib/prisma';

// GET /api/admin/users — list all users with counts.
export async function GET() {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      _count: { select: { demoTrades: true, alerts: true, backtests: true } },
    },
  });

  return NextResponse.json({ users });
}
