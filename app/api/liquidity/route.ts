export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { computeLiveLiquidity } from '@/lib/liquidity';
import { isCryptoSymbol } from '@/lib/crypto-instruments';
import { fetchMarketData, getCurrentPrice } from '@/lib/market-data';

/**
 * Live order-book liquidity / slippage for an intended position size.
 *
 * Query params:
 *   symbol   (required)  crypto platform symbol, e.g. DOGE-USDT
 *   side     BUY | SELL  (default BUY)
 *   size     intended size in COINS            (provide size OR usd)
 *   usd      intended notional in USD          (converted to coins via last price)
 *   entry, stop, target  optional — used to bound the "zone" depth measurement
 *
 * Reflects the CURRENT order book. Non-crypto symbols return supported:false.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const symbol = sp.get('symbol') ?? '';
    const side = (sp.get('side') ?? 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';

    if (!symbol) {
      return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
    }
    if (!isCryptoSymbol(symbol)) {
      return NextResponse.json({
        supported: false,
        symbol,
        note: 'Live order-book depth is only available for crypto spot instruments.',
      });
    }

    let size = Number(sp.get('size'));
    const usd = Number(sp.get('usd'));

    // If size not given but a USD notional is, convert using the latest price.
    if (!(size > 0) && usd > 0) {
      const bars = await fetchMarketData(symbol, sp.get('timeframe') ?? '15m');
      const price = getCurrentPrice(bars);
      if (price > 0) size = usd / price;
    }

    const entry = Number(sp.get('entry'));
    const stop = Number(sp.get('stop'));
    const target = Number(sp.get('target'));
    const zoneVals = [entry, stop, target].filter((n) => Number.isFinite(n) && n > 0);
    const zoneLow = zoneVals.length ? Math.min(...zoneVals) : undefined;
    const zoneHigh = zoneVals.length ? Math.max(...zoneVals) : undefined;

    const result = await computeLiveLiquidity(symbol, side, size, { zoneLow, zoneHigh });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Liquidity check error:', error);
    return NextResponse.json({ error: error?.message ?? 'Liquidity check failed' }, { status: 500 });
  }
}
