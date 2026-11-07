export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSetupStats } from '@/lib/setup-stats';

/**
 * Read-only learning-store analytics: hit-rate statistics computed from resolved
 * SetupLog rows (overall, by asset class, by timeframe, and top/bottom
 * confluence tags by win-rate with sample sizes).
 */
export async function GET() {
  try {
    const stats = await getSetupStats();
    return NextResponse.json({ stats });
  } catch (e) {
    console.error('setup stats error:', (e as Error).message);
    return NextResponse.json({ error: 'Failed to compute setup stats' }, { status: 500 });
  }
}
