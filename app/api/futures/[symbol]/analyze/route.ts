export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { fetchYahooFinanceData, getSessionInfo } from '@/lib/yahoo-finance';
import { analyzeICT, scoreConfluence, generateTradeSetup } from '@/lib/ict-engine';

export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } }
) {
  try {
    const symbol    = params?.symbol ?? '';
    const timeframe = request.nextUrl.searchParams.get('timeframe') ?? '15m';

    const bars      = await fetchYahooFinanceData(symbol, timeframe);
    const patterns  = analyzeICT(bars);
    const confluence = scoreConfluence(patterns);
    const setup     = generateTradeSetup(bars, patterns);
    const sessionInfo = getSessionInfo();

    const lastBar = bars?.[bars.length - 1];
    const bullish = patterns.filter((p: any) => p?.direction === 'BULLISH');
    const bearish = patterns.filter((p: any) => p?.direction === 'BEARISH');
    const bias    = bullish.length > bearish.length ? 'BULLISH'
                  : bearish.length > bullish.length ? 'BEARISH'
                  : 'NEUTRAL';

    // Pattern breakdown by type
    const patternBreakdown: Record<string, number> = {};
    for (const p of patterns) {
      patternBreakdown[p.type] = (patternBreakdown[p.type] ?? 0) + 1;
    }

    return NextResponse.json({
      symbol,
      timeframe,
      currentPrice:     lastBar?.close ?? 0,
      patterns,
      confluence,
      setup,
      bias,
      session:          sessionInfo,
      patternsCount:    patterns.length,
      patternBreakdown,
      timestamp:        Date.now(),
    });
  } catch (error: any) {
    console.error('Analysis error:', error);
    return NextResponse.json({ error: error?.message ?? 'Analysis failed' }, { status: 500 });
  }
}
