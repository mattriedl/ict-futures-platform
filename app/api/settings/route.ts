export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { INSTRUMENTS } from '@/lib/instruments';

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

    // General / alert preferences — validated so a bad value can't 500 the save.
    const bool = (v: any): boolean | undefined => (typeof v === 'boolean' ? v : undefined);
    const refreshInterval = clamp(body?.refreshInterval, 10, 3600);
    const alertMinScore = clamp(body?.alertMinScore, 0, 100);
    const theme = typeof body?.theme === 'string' && ['dark', 'light'].includes(body.theme) ? body.theme : undefined;
    const validSymbols = new Set(INSTRUMENTS.map((i) => i.symbol));
    const trackedSymbols =
      typeof body?.trackedSymbols === 'string'
        ? Array.from(new Set(body.trackedSymbols.split(',').map((x: string) => x.trim()).filter((x: string) => validSymbols.has(x)))).join(',')
        : undefined;
    let alertEmail: string | null | undefined;
    if (body?.alertEmail !== undefined) {
      const e = typeof body.alertEmail === 'string' ? body.alertEmail.trim() : '';
      if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        return NextResponse.json({ error: 'Alert email address is not valid.' }, { status: 400 });
      }
      alertEmail = e || null;
    }
    const generalFields = {
      ...(refreshInterval != null ? { refreshInterval: Math.round(refreshInterval) } : {}),
      ...(alertMinScore != null ? { alertMinScore } : {}),
      ...(theme ? { theme } : {}),
      ...(trackedSymbols ? { trackedSymbols } : {}),
      ...(bool(body?.alertOnOB) != null ? { alertOnOB: body.alertOnOB } : {}),
      ...(bool(body?.alertOnFVG) != null ? { alertOnFVG: body.alertOnFVG } : {}),
      ...(bool(body?.alertOnLiqSweep) != null ? { alertOnLiqSweep: body.alertOnLiqSweep } : {}),
      ...(bool(body?.alertOnMSS) != null ? { alertOnMSS: body.alertOnMSS } : {}),
      ...(bool(body?.alertOnOTE) != null ? { alertOnOTE: body.alertOnOTE } : {}),
      ...(bool(body?.notificationsOn) != null ? { notificationsOn: body.notificationsOn } : {}),
      ...(bool(body?.emailAlertsEnabled) != null ? { emailAlertsEnabled: body.emailAlertsEnabled } : {}),
      ...(alertEmail !== undefined ? { alertEmail } : {}),
    };

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
      update: { ...generalFields, ...riskFields },
      create: { userId, ...generalFields, ...riskFields },
    });

    return NextResponse.json({ settings });
  } catch (error: any) {
    console.error('Settings update error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
