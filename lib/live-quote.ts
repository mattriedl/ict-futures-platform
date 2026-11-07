// ---------------------------------------------------------------------------
// Live, timeframe-independent quote helper.
//
// Purpose: the chart header price (and the analyze endpoint's reported
// `currentPrice`) must reflect a single, real-time, timeframe-independent
// quote — NOT the last candle close of whatever timeframe happens to be
// loaded (which changes as the user switches timeframes).
//
// Sources (all verified reachable from this VM, timeframe-independent):
//   - CRYPTO : OKX ticker (last + open24h). Falls back to Kraken / Coinbase
//              tickers, consistent with lib/crypto-feed.ts fallbacks.
//   - FUTURES/FOREX : Yahoo chart meta (regularMarketPrice + previous close).
//
// HARD RULE: never synthesize a price. On failure we return price=null and
// stale=true so the UI can show a graceful "live price unavailable" state.
// ---------------------------------------------------------------------------

import { isCryptoSymbol, getCryptoMeta } from '@/lib/crypto-instruments';

export type LiveAssetClass = 'crypto' | 'forex' | 'futures';

export interface LiveQuote {
  symbol: string;
  price: number | null;
  baseline: number | null;
  change: number | null;
  changePct: number | null;
  source: string;
  ts: number | null;
  stale: boolean;
  assetClass: LiveAssetClass;
}

const QUOTE_TIMEOUT_MS = 4000;

/** Derive the broad asset class from the symbol suffix / crypto registry. */
export function deriveLiveAssetClass(symbol: string): LiveAssetClass {
  if (isCryptoSymbol(symbol)) return 'crypto';
  if (symbol.endsWith('=X')) return 'forex';
  return 'futures';
}

async function fetchJsonQuick(url: string, headers?: Record<string, string>): Promise<any> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; ICTPlatform/1.0)',
      ...(headers ?? {}),
    },
    signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS),
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Crypto quote sources
// ---------------------------------------------------------------------------

interface RawQuote { price: number; baseline: number | null; ts: number | null; source: string; }

async function fetchOkxQuote(instId: string): Promise<RawQuote | null> {
  const data = await fetchJsonQuick(
    `https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`,
  );
  const t = data?.data?.[0];
  if (!t) return null;
  const price = Number(t.last);
  const baseline = Number(t.open24h);
  const ts = Number(t.ts);
  if (!Number.isFinite(price) || price <= 0) return null;
  return {
    price,
    baseline: Number.isFinite(baseline) && baseline > 0 ? baseline : null,
    ts: Number.isFinite(ts) ? ts : null,
    source: 'okx',
  };
}

async function fetchKrakenQuote(pair: string): Promise<RawQuote | null> {
  const data = await fetchJsonQuick(
    `https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(pair)}`,
  );
  if (data?.error?.length) throw new Error(`Kraken error: ${data.error.join(',')}`);
  const result = data?.result ?? {};
  const key = Object.keys(result).find((k) => k !== 'last');
  if (!key) return null;
  const t = result[key];
  // c = [last trade price, lot volume]; o = today's opening price.
  const price = Number(Array.isArray(t?.c) ? t.c[0] : NaN);
  const baseline = Number(Array.isArray(t?.o) ? t.o[0] : t?.o);
  if (!Number.isFinite(price) || price <= 0) return null;
  return {
    price,
    baseline: Number.isFinite(baseline) && baseline > 0 ? baseline : null,
    ts: Date.now(),
    source: 'kraken',
  };
}

async function fetchCoinbaseQuote(product: string): Promise<RawQuote | null> {
  const ticker = await fetchJsonQuick(
    `https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/ticker`,
  );
  const price = Number(ticker?.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  let baseline: number | null = null;
  try {
    const stats = await fetchJsonQuick(
      `https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/stats`,
    );
    const open = Number(stats?.open);
    if (Number.isFinite(open) && open > 0) baseline = open;
  } catch {
    baseline = null;
  }
  const ts = ticker?.time ? Date.parse(ticker.time) : Date.now();
  return { price, baseline, ts: Number.isFinite(ts) ? ts : Date.now(), source: 'coinbase' };
}

async function fetchCryptoQuote(symbol: string): Promise<RawQuote | null> {
  const meta = getCryptoMeta(symbol);
  if (!meta) return null;

  // Candidate sources, primary first (matching the coin's home exchange), then
  // the same OKX/Kraken/Coinbase fallbacks used elsewhere for crypto.
  const okxInstId = meta.exchange === 'OKX' ? meta.symbol : `${meta.coin}-USDT`;
  const krakenPair = meta.exchange === 'KRAKEN' ? meta.symbol : `${meta.coin}USD`;
  const coinbaseProduct = `${meta.coin}-USD`;

  const attempts: Array<() => Promise<RawQuote | null>> =
    meta.exchange === 'KRAKEN'
      ? [
          () => fetchKrakenQuote(krakenPair),
          () => fetchOkxQuote(okxInstId),
          () => fetchCoinbaseQuote(coinbaseProduct),
        ]
      : [
          () => fetchOkxQuote(okxInstId),
          () => fetchKrakenQuote(krakenPair),
          () => fetchCoinbaseQuote(coinbaseProduct),
        ];

  for (const attempt of attempts) {
    try {
      const q = await attempt();
      if (q) return q;
    } catch {
      // try next source
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Yahoo quote (futures / forex)
// ---------------------------------------------------------------------------

async function fetchYahooQuote(symbol: string): Promise<RawQuote | null> {
  const data = await fetchJsonQuick(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol,
    )}?interval=1m&range=1d`,
  );
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  const price = Number(meta.regularMarketPrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  const baselineRaw = meta.chartPreviousClose ?? meta.previousClose;
  const baseline = Number(baselineRaw);
  const t = Number(meta.regularMarketTime);
  return {
    price,
    baseline: Number.isFinite(baseline) && baseline > 0 ? baseline : null,
    ts: Number.isFinite(t) ? t * 1000 : null,
    source: 'yahoo',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch a real-time, timeframe-independent quote for a symbol.
 * Never fabricates: on any failure returns price=null, stale=true, source 'none'.
 */
export async function fetchLiveQuote(symbol: string): Promise<LiveQuote> {
  const assetClass = deriveLiveAssetClass(symbol);

  let raw: RawQuote | null = null;
  try {
    raw = assetClass === 'crypto' ? await fetchCryptoQuote(symbol) : await fetchYahooQuote(symbol);
  } catch {
    raw = null;
  }

  if (!raw) {
    return {
      symbol,
      price: null,
      baseline: null,
      change: null,
      changePct: null,
      source: 'none',
      ts: null,
      stale: true,
      assetClass,
    };
  }

  const price = raw.price;
  const baseline = raw.baseline;
  const change = price != null && baseline != null ? price - baseline : null;
  const changePct =
    change != null && baseline != null && baseline > 0 ? (change / baseline) * 100 : null;

  return {
    symbol,
    price,
    baseline,
    change,
    changePct,
    source: raw.source,
    ts: raw.ts,
    stale: false,
    assetClass,
  };
}
