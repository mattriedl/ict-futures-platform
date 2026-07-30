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
    });

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

    const body = await request.json();
    const { id, status, read: isRead } = body ?? {};

    if (!id) {
      return NextResponse.json({ error: 'Alert ID required' }, { status: 400 });
    }

    const updateData: any = {};
    if (status !== undefined) updateData.status = status;
    if (isRead !== undefined) updateData.read = isRead;

    const alert = await prisma.alert.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ alert });
  } catch (error: any) {
    console.error('Alert update error:', error);
    return NextResponse.json({ error: 'Failed to update alert' }, { status: 500 });
  }
}
