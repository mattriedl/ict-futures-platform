export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/authz';
import { getDrawdownStatus } from '@/lib/demo-trades';

/** Lightweight drawdown / daily-loss status for the current user's demo account. */
export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { user } = auth;

  try {
    const drawdown = await getDrawdownStatus(user.id);
    return NextResponse.json({ drawdown });
  } catch (e) {
    console.error('drawdown status error:', (e as Error).message);
    return NextResponse.json({ error: 'Failed to compute drawdown status' }, { status: 500 });
  }
}
