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
      },
      create: {
        userId,
        refreshInterval: body?.refreshInterval ?? 60,
        theme: body?.theme ?? 'dark',
        trackedSymbols: body?.trackedSymbols ?? 'ES=F,NQ=F,CL=F,GC=F',
      },
    });

    return NextResponse.json({ settings });
  } catch (error: any) {
    console.error('Settings update error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
