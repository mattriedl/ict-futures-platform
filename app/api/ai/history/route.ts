export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Get pattern outcomes grouped by type
    const byPattern = await prisma.patternOutcome.groupBy({
      by: ['patternType', 'outcome'],
      _count: true,
      _avg: { pnlPercent: true },
    });

    // Get by instrument
    const byInstrument = await prisma.patternOutcome.groupBy({
      by: ['instrumentSymbol', 'outcome'],
      _count: true,
      _avg: { pnlPercent: true },
    });

    // Get by timeframe
    const byTimeframe = await prisma.patternOutcome.groupBy({
      by: ['timeframe', 'outcome'],
      _count: true,
    });

    // Total stats
    const totalCount = await prisma.patternOutcome.count();
    const totalWins = await prisma.patternOutcome.count({ where: { outcome: 'WIN' } });

    // Format pattern stats
    const patternTypes = [...new Set(byPattern.map((r: any) => r?.patternType))];
    const patternStats = patternTypes.map((pt: any) => {
      const wins = byPattern.find((r: any) => r?.patternType === pt && r?.outcome === 'WIN');
      const losses = byPattern.find((r: any) => r?.patternType === pt && r?.outcome === 'LOSS');
      const winCount = wins?._count ?? 0;
      const lossCount = losses?._count ?? 0;
      const total = winCount + lossCount;
      return {
        patternType: pt,
        totalSetups: total,
        wins: winCount,
        losses: lossCount,
        winRate: total > 0 ? parseFloat(((winCount / total) * 100).toFixed(1)) : 0,
        avgPnl: parseFloat(((wins?._avg?.pnlPercent ?? 0) + (losses?._avg?.pnlPercent ?? 0)).toFixed(2)),
      };
    });

    // Format instrument stats
    const symbols = [...new Set(byInstrument.map((r: any) => r?.instrumentSymbol))];
    const instrumentStats = symbols.map((sym: any) => {
      const wins = byInstrument.find((r: any) => r?.instrumentSymbol === sym && r?.outcome === 'WIN');
      const losses = byInstrument.find((r: any) => r?.instrumentSymbol === sym && r?.outcome === 'LOSS');
      const winCount = wins?._count ?? 0;
      const lossCount = losses?._count ?? 0;
      const total = winCount + lossCount;
      return {
        symbol: sym,
        totalSetups: total,
        winRate: total > 0 ? parseFloat(((winCount / total) * 100).toFixed(1)) : 0,
      };
    });

    return NextResponse.json({
      totalSetups: totalCount,
      overallWinRate: totalCount > 0 ? parseFloat(((totalWins / totalCount) * 100).toFixed(1)) : 0,
      patternStats,
      instrumentStats,
      byTimeframe: byTimeframe.map((r: any) => ({
        timeframe: r?.timeframe,
        outcome: r?.outcome,
        count: r?._count ?? 0,
      })),
    });
  } catch (error: any) {
    console.error('History error:', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}
