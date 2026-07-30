export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { prisma } from '@/lib/prisma';

// GET /api/admin/stats — platform-wide statistics for the admin dashboard.
export async function GET() {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;

  const [
    totalUsers,
    totalAdmins,
    totalInstruments,
    activeInstruments,
    totalTrades,
    openTrades,
    totalAlerts,
    totalBacktests,
    recentUsers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'ADMIN' } }),
    prisma.instrument.count(),
    prisma.instrument.count({ where: { active: true } }),
    prisma.demoTrade.count(),
    prisma.demoTrade.count({ where: { status: 'OPEN' } }),
    prisma.alert.count(),
    prisma.backtestRun.count(),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({
    stats: {
      totalUsers,
      totalAdmins,
      totalInstruments,
      activeInstruments,
      totalTrades,
      openTrades,
      totalAlerts,
      totalBacktests,
    },
    recentUsers,
  });
}
