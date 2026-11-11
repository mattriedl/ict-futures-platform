export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { fetchLiveQuote, deriveLiveAssetClass, type LiveQuote } from '@/lib/live-quote';
import { requireUser } from '@/lib/authz';
import { decodeSymbol } from '@/lib/symbols';

// Real-time, timeframe-independent live quote for the chart header + analysis.
// Always returns HTTP 200 so the client can render a graceful
// "live price unavailable" state instead of throwing.
export async function GET(
  _request: NextRequest,
  { params }: { params: { symbol: string } },
) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  // Symbols contain '=' (e.g. NQ=F, EURUSD=X) which may arrive URL-encoded.
  const symbol = decodeSymbol(params?.symbol);

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
