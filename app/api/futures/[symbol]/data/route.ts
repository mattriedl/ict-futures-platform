export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionInfo } from '@/lib/yahoo-finance';
import { fetchMarketDataWithMeta } from '@/lib/market-data';
import { requireUser } from '@/lib/authz';
import { decodeSymbol } from '@/lib/symbols';

export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } }
) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  try {
    const symbol    = decodeSymbol(params?.symbol);
    const timeframe = request.nextUrl.searchParams.get('timeframe') ?? '15m';

    const { bars, source } = await fetchMarketDataWithMeta(symbol, timeframe);
    const sessionInfo = getSessionInfo();

    // REAL DATA ONLY: an empty series means the feed is unreachable right now.
    // Report that honestly (HTTP 200 so the UI can render a notice).
    const unavailable = !bars || bars.length === 0;

    const lastBar  = bars?.[bars.length - 1];
    const prevBar  = bars?.[bars.length - 2];
    const lastPrice = lastBar?.close ?? 0;
    const prevClose = prevBar?.close ?? lastPrice;
    const change    = lastPrice - prevClose;
    const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0;

    // Session high/low (last 20 bars)
    const sessionBars = bars?.slice(-20) ?? [];
    const sessionHigh = sessionBars.length > 0 ? Math.max(...sessionBars.map((b) => b.high)) : 0;
    const sessionLow  = sessionBars.length > 0 ? Math.min(...sessionBars.map((b) => b.low)) : 0;

    return NextResponse.json({
      symbol,
      timeframe,
      bars,
      unavailable,
      source,
      currentPrice: lastPrice,
      change:       parseFloat(change.toFixed(6)),
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
