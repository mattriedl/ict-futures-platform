export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionInfo } from '@/lib/yahoo-finance';
import { fetchMarketData } from '@/lib/market-data';

export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } }
) {
  try {
    const symbol    = params?.symbol ?? '';
    const timeframe = request.nextUrl.searchParams.get('timeframe') ?? '15m';

    const bars       = await fetchMarketData(symbol, timeframe);
    const sessionInfo = getSessionInfo();

    const lastBar  = bars?.[bars.length - 1];
    const prevBar  = bars?.[bars.length - 2];
    const lastPrice = lastBar?.close ?? 0;
    const prevClose = prevBar?.close ?? lastPrice;
    const change    = lastPrice - prevClose;
    const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0;

    // Session high/low (last 20 bars)
    const sessionBars = bars?.slice(-20) ?? [];
    const sessionHigh = sessionBars.length > 0 ? Math.max(...sessionBars.map((b: any) => b?.high ?? 0)) : 0;
    const sessionLow  = sessionBars.length > 0 ? Math.min(...sessionBars.map((b: any) => b?.low  ?? Infinity)) : 0;

    return NextResponse.json({
      symbol,
      timeframe,
      bars,
      currentPrice: lastPrice,
      change:       parseFloat(change.toFixed(2)),
      changePct:    parseFloat(changePct.toFixed(2)),
      sessionHigh,
      sessionLow,
      session:      sessionInfo.session,
      killZone:     sessionInfo.killZone,
      etHour:       sessionInfo.etHour,
      etMinute:     sessionInfo.etMinute,
    });
  } catch (error: any) {
    console.error('Data fetch error:', error);
    return NextResponse.json({ error: error?.message ?? 'Failed to fetch data' }, { status: 500 });
  }
}
