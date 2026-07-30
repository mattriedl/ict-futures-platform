export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, patterns, confluenceScore, direction, timeframe } = body ?? {};

    // Get historical win rates for these pattern types
    const patternTypes = (patterns ?? []).map((p: any) => p?.type).filter(Boolean);
    const outcomes = await prisma.patternOutcome.groupBy({
      by: ['patternType', 'outcome'],
      where: {
        patternType: { in: patternTypes },
        instrumentSymbol: symbol ?? undefined,
      },
      _count: true,
    });

    const winRates: Record<string, number> = {};
    for (const pt of patternTypes) {
      const wins = outcomes.find((o: any) => o?.patternType === pt && o?.outcome === 'WIN')?._count ?? 0;
      const losses = outcomes.find((o: any) => o?.patternType === pt && o?.outcome === 'LOSS')?._count ?? 0;
      const total = wins + losses;
      winRates[pt] = total > 0 ? wins / total : 0.5;
    }

    // Weighted score based on confluences + historical accuracy
    const avgWinRate = Object.values(winRates).reduce((a: number, b: number) => a + b, 0) / (Object.values(winRates).length || 1);
    const adjustedScore = Math.round((confluenceScore ?? 0) * 0.6 + avgWinRate * 100 * 0.4);

    return NextResponse.json({
      score: Math.min(100, adjustedScore),
      confluenceScore: confluenceScore ?? 0,
      historicalWinRate: parseFloat((avgWinRate * 100).toFixed(1)),
      patternWinRates: winRates,
      direction,
      timeframe,
    });
  } catch (error: any) {
    console.error('Score error:', error);
    return NextResponse.json({ error: 'Scoring failed' }, { status: 500 });
  }
}
