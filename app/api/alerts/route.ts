export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendAlertEmail, type AlertEmailPayload } from '@/lib/email';

/**
 * Fire-and-forget email dispatch for a newly created alert.
 * Respects both the per-user toggle (UserSettings.emailAlertsEnabled) and the
 * global kill-switch (AppSettings.emailAlertsEnabled). Resolves the destination
 * address from UserSettings.alertEmail, falling back to the user's login email.
 * Never throws — any failure is logged by the caller.
 */
async function maybeSendAlertEmail(userId: string, alert: any, body: any): Promise<void> {
  // Global kill-switch (AppSettings is a singleton keyed by id = 'global').
  const appSettings = await prisma.appSettings.findUnique({ where: { id: 'global' } });
  if (appSettings && appSettings.emailAlertsEnabled === false) return;

  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  if (!settings?.emailAlertsEnabled) return;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const to = settings.alertEmail || user?.email;
  if (!to) return;

  const symbol = alert?.instrument?.symbol || body?.symbol || 'Futures';
  const payload: AlertEmailPayload = {
    symbol,
    patternType: body?.patternType ?? undefined,
    direction: body?.direction ?? undefined,
    aiScore: alert?.aiScore ?? body?.aiScore ?? null,
    entryPrice: body?.entryPrice ?? null,
    stopLoss: body?.stopLoss ?? null,
    takeProfit: body?.takeProfit ?? null,
    message: alert?.message ?? body?.message ?? undefined,
    title: alert?.title ?? body?.title ?? undefined,
  };

  await sendAlertEmail({ to, alert: payload });
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any)?.id;
    const alerts = await prisma.alert.findMany({
      where: { userId },
      include: { instrument: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ alerts });
  } catch (error: any) {
    console.error('Alerts fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any)?.id;
    const body = await request.json();

    const alert = await prisma.alert.create({
      data: {
        userId,
        instrumentId: body?.instrumentId ?? null,
        type: body?.type ?? 'SETUP',
        title: body?.title ?? 'New Alert',
        message: body?.message ?? '',
        aiScore: body?.aiScore ?? null,
        status: 'ACTIVE',
      },
      include: { instrument: true },
    });

    // Fire-and-forget email notification (never blocks the response).
    void maybeSendAlertEmail(userId, alert, body).catch((e) =>
      console.warn('Alert email dispatch failed:', (e as Error).message),
    );

    return NextResponse.json({ alert });
  } catch (error: any) {
    console.error('Alert create error:', error);
    return NextResponse.json({ error: 'Failed to create alert' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any)?.id;
    const body = await request.json();
    const { id, status, read: isRead } = body ?? {};

    if (!id) {
      return NextResponse.json({ error: 'Alert ID required' }, { status: 400 });
    }

    const updateData: any = {};
    if (status !== undefined) {
      if (!['ACTIVE', 'DISMISSED'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      updateData.status = status;
    }
    if (isRead !== undefined) updateData.read = Boolean(isRead);

    // Scope the update to the caller's own alerts.
    const res = await prisma.alert.updateMany({ where: { id, userId }, data: updateData });
    if (res.count !== 1) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }
    const alert = await prisma.alert.findUnique({ where: { id } });

    return NextResponse.json({ alert });
  } catch (error: any) {
    console.error('Alert update error:', error);
    return NextResponse.json({ error: 'Failed to update alert' }, { status: 500 });
  }
}
