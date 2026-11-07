export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { fetchLiveQuote, deriveLiveAssetClass, type LiveQuote } from '@/lib/live-quote';

// Real-time, timeframe-independent live quote for the chart header + analysis.
// Always returns HTTP 200 so the client can render a graceful
// "live price unavailable" state instead of throwing.
export async function GET(
  _request: NextRequest,
  { params }: { params: { symbol: string } },
) {
  let symbol = params?.symbol ?? '';
  // Symbols contain '=' (e.g. NQ=F, EURUSD=X) which may arrive URL-encoded.
  try {
    symbol = decodeURIComponent(symbol);
  } catch {
    // keep raw symbol if it isn't valid percent-encoding
  }

  try {
    const quote = await fetchLiveQuote(symbol);
    return NextResponse.json(quote);
  } catch {
    const fallback: LiveQuote = {
      symbol,
      price: null,
      baseline: null,
      change: null,
      changePct: null,
      source: 'none',
      ts: null,
      stale: true,
      assetClass: deriveLiveAssetClass(symbol),
    };
    return NextResponse.json(fallback);
  }
}
