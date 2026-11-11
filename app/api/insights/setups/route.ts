export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSetupStats } from '@/lib/setup-stats';
import { requireUser } from '@/lib/authz';

/**
 * Read-only learning-store analytics: hit-rate statistics computed from resolved
 * SetupLog rows (overall, by asset class, by timeframe, and top/bottom
 * confluence tags by win-rate with sample sizes).
 */
export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  try {
    const stats = await getSetupStats();
    return NextResponse.json({ stats });
  } catch (e) {
    console.error('setup stats error:', (e as Error).message);
    return NextResponse.json({ error: 'Failed to compute setup stats' }, { status: 500 });
  }
}
