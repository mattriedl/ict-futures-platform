export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any)?.id;
    let settings = await prisma.userSettings.findUnique({ where: { userId } });

    if (!settings) {
      settings = await prisma.userSettings.create({
        data: { userId },
      });
    }

    return NextResponse.json({ settings });
  } catch (error: any) {
    console.error('Settings fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any)?.id;
    const body = await request.json();

    // Clamp prop-firm risk controls to sensible ranges before persisting.
    const clamp = (v: any, min: number, max: number): number | undefined => {
      const n = typeof v === 'number' ? v : parseFloat(v);
      if (v == null || Number.isNaN(n)) return undefined;
      return Math.min(max, Math.max(min, n));
    };
    const riskPercent = clamp(body?.riskPercent, 0.1, 10);
    const maxDailyLossPercent = clamp(body?.maxDailyLossPercent, 1, 20);
    const maxOverallDrawdownPercent = clamp(body?.maxOverallDrawdownPercent, 1, 50);
    const enforceDrawdown = body?.enforceDrawdown != null ? Boolean(body.enforceDrawdown) : undefined;

    // Per-asset-class leverage (floor of 1x; class-specific ceilings).
    const leverageCrypto = clamp(body?.leverageCrypto, 1, 5);
    const leverageForex = clamp(body?.leverageForex, 1, 100);
    const leverageFutures = clamp(body?.leverageFutures, 1, 50);

    // Automated trading controls.
    const autoTradeEnabled = body?.autoTradeEnabled != null ? Boolean(body.autoTradeEnabled) : undefined;
    const autoTradeMinScore = clamp(body?.autoTradeMinScore, 0, 100);

    const riskFields = {
      ...(riskPercent != null ? { riskPercent } : {}),
      ...(maxDailyLossPercent != null ? { maxDailyLossPercent } : {}),
      ...(maxOverallDrawdownPercent != null ? { maxOverallDrawdownPercent } : {}),
      ...(enforceDrawdown != null ? { enforceDrawdown } : {}),
      ...(leverageCrypto != null ? { leverageCrypto } : {}),
      ...(leverageForex != null ? { leverageForex } : {}),
      ...(leverageFutures != null ? { leverageFutures } : {}),
      ...(autoTradeEnabled != null ? { autoTradeEnabled } : {}),
      ...(autoTradeMinScore != null ? { autoTradeMinScore } : {}),
    };

    const settings = await prisma.userSettings.upsert({
      where: { userId },
      update: {
        refreshInterval: body?.refreshInterval ?? 60,
        theme: body?.theme ?? 'dark',
        trackedSymbols: body?.trackedSymbols ?? 'ES=F,NQ=F,CL=F,GC=F',
        alertMinScore: body?.alertMinScore ?? 60,
        alertOnOB: body?.alertOnOB ?? true,
        alertOnFVG: body?.alertOnFVG ?? true,
        alertOnLiqSweep: body?.alertOnLiqSweep ?? true,
        alertOnMSS: body?.alertOnMSS ?? true,
        alertOnOTE: body?.alertOnOTE ?? true,
        notificationsOn: body?.notificationsOn ?? true,
        ...riskFields,
      },
      create: {
        userId,
        refreshInterval: body?.refreshInterval ?? 60,
        theme: body?.theme ?? 'dark',
        trackedSymbols: body?.trackedSymbols ?? 'ES=F,NQ=F,CL=F,GC=F',
        ...riskFields,
      },
    });

    return NextResponse.json({ settings });
  } catch (error: any) {
    console.error('Settings update error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
