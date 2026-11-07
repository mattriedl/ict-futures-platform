// ---------------------------------------------------------------------------
// Real crypto data feed (OKX + Kraken).
//
// Produces the SAME OHLCVBar shape as lib/yahoo-finance.ts so the ICT engine,
// charts, analysis, one-click tracking and demo-trade evaluation all work
// unchanged for crypto instruments.
//
// HARD RULE: NO synthetic-data fabrication for crypto. If a fetch fails we
// return an empty array (and let callers handle it honestly) — we never invent
// bars, unlike the Yahoo futures path.
//
// See CRYPTO_FEED_REFERENCE.md for the verified endpoints and formats.
// ---------------------------------------------------------------------------

import type { OHLCVBar } from '@/lib/yahoo-finance';
import { getCryptoMeta, type CryptoMeta } from '@/lib/crypto-instruments';

export type { OHLCVBar };

// Platform timeframe -> exchange-specific params.
const OKX_BAR: Record<string, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1H', '4h': '4H', '1d': '1D',
};
const KRAKEN_INTERVAL: Record<string, number> = {
  '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440,
};

// Approximate candle duration in ms — used to size history requests.
const TF_MS: Record<string, number> = {
  '1m': 60_000, '5m': 300_000, '15m': 900_000,
  '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000,
};

async function fetchJson(url: string, timeoutMs = 8000, retries = 3): Promise<any> {
  let lastErr: any;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; ICTPlatform/1.0)' },
        signal: AbortSignal.timeout(timeoutMs),
        // Always fetch fresh market data.
        next: { revalidate: 0 },
      });
      if (res.ok) return await res.json();
      if (res.status === 429 || res.status === 503) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 800));
        continue;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, (attempt + 1) * 400));
    }
  }
  throw lastErr ?? new Error('fetch failed');
}

// ---------------------------------------------------------------------------
// OKX candles
// ---------------------------------------------------------------------------

function parseOkxRows(rows: any[]): OHLCVBar[] {
  // Row: [ts_ms, open, high, low, close, vol, volCcy, volCcyQuote, confirm] (strings).
  const bars: OHLCVBar[] = [];
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 6) continue;
    if (r[8] === '0') continue; // drop the in-progress (unconfirmed) candle
    const ts = Number(r[0]);
    const open = Number(r[1]); const high = Number(r[2]);
    const low = Number(r[3]); const close = Number(r[4]);
    const volume = Number(r[5]);
    if (![ts, open, high, low, close].every(Number.isFinite)) continue;
    bars.push({ timestamp: ts, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 });
  }
  // OKX returns newest-first — sort ascending chronological.
  bars.sort((a, b) => a.timestamp - b.timestamp);
  return bars;
}

async function fetchOkxCandles(meta: CryptoMeta, timeframe: string, limit = 300): Promise<OHLCVBar[]> {
  const bar = OKX_BAR[timeframe] ?? '15m';
  const url = `https://www.okx.com/api/v5/market/candles?instId=${meta.symbol}&bar=${bar}&limit=${Math.min(limit, 300)}`;
  const data = await fetchJson(url);
  return parseOkxRows(data?.data ?? []);
}

async function fetchOkxHistory(meta: CryptoMeta, timeframe: string, targetBars: number): Promise<OHLCVBar[]> {
  const bar = OKX_BAR[timeframe] ?? '15m';
  const all: OHLCVBar[] = [];
  const seen = new Set<number>();
  let after: string | undefined; // paginate to OLDER rows (records earlier than `after` ts)
  const maxCalls = 12;

  for (let call = 0; call < maxCalls && all.length < targetBars; call++) {
    // history-candles serves older data; supports the same format + `after` cursor.
    const url =
      `https://www.okx.com/api/v5/market/history-candles?instId=${meta.symbol}&bar=${bar}&limit=100` +
      (after ? `&after=${after}` : '');
    let rows: any[];
    try {
      const data = await fetchJson(url);
      rows = data?.data ?? [];
    } catch {
      break; // stop paginating on error; return what we have (no fabrication)
    }
    if (rows.length === 0) break;
    // rows newest-first; oldest is the last element -> its ts is the next `after`.
    const oldestTs = Number(rows[rows.length - 1]?.[0]);
    for (const b of parseOkxRows(rows)) {
      if (!seen.has(b.timestamp)) { seen.add(b.timestamp); all.push(b); }
    }
    if (!Number.isFinite(oldestTs)) break;
    after = String(oldestTs);
  }
  all.sort((a, b) => a.timestamp - b.timestamp);
  return all;
}

// ---------------------------------------------------------------------------
// Kraken OHLC
// ---------------------------------------------------------------------------

function firstResultKey(result: Record<string, any>): string | undefined {
  return Object.keys(result ?? {}).find((k) => k !== 'last');
}

function parseKrakenRows(rows: any[]): OHLCVBar[] {
  // Row: [time_s, open, high, low, close, vwap, volume, count]. time in SECONDS, ascending.
  const bars: OHLCVBar[] = [];
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 7) continue;
    const ts = Number(r[0]) * 1000;
    const open = Number(r[1]); const high = Number(r[2]);
    const low = Number(r[3]); const close = Number(r[4]);
    const volume = Number(r[6]);
    if (![ts, open, high, low, close].every(Number.isFinite)) continue;
    bars.push({ timestamp: ts, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 });
  }
  bars.sort((a, b) => a.timestamp - b.timestamp);
  return bars;
}

async function fetchKrakenCandles(meta: CryptoMeta, timeframe: string): Promise<OHLCVBar[]> {
  const interval = KRAKEN_INTERVAL[timeframe] ?? 15;
  const url = `https://api.kraken.com/0/public/OHLC?pair=${meta.symbol}&interval=${interval}`;
  const data = await fetchJson(url);
  if (data?.error?.length) throw new Error(`Kraken error: ${data.error.join(',')}`);
  const result = data?.result ?? {};
  const key = firstResultKey(result);
  if (!key) return [];
  const bars = parseKrakenRows(result[key] ?? []);
  // Kraken includes the current, still-forming candle as the last element — drop it.
  return bars.length > 0 ? bars.slice(0, -1) : bars;
}

// ---------------------------------------------------------------------------
// Public API — mirrors yahoo-finance entry points
// ---------------------------------------------------------------------------

/** Recent candles for a crypto symbol (chronological ascending). Empty on failure. */
export async function fetchCryptoData(symbol: string, timeframe: string = '15m'): Promise<OHLCVBar[]> {
  const meta = getCryptoMeta(symbol);
  if (!meta) return [];
  try {
    return meta.exchange === 'OKX'
      ? await fetchOkxCandles(meta, timeframe, 300)
      : await fetchKrakenCandles(meta, timeframe);
  } catch (err) {
    console.warn(`crypto-feed: recent fetch failed for ${symbol} (${meta.exchange}):`, (err as Error)?.message);
    return [];
  }
}

export interface CryptoHistoricalResult {
  bars: OHLCVBar[];
  /** Always false for crypto — we never fabricate synthetic bars. */
  synthetic: false;
  clampedDays: number;
  /** True if the feed returned fewer bars than the requested window supports. */
  limited: boolean;
}

/**
 * Historical candles for backtests. OKX paginates back via history-candles;
 * Kraken returns its available window (~720 candles) with no deep pagination.
 * Never fabricates data — returns whatever the exchange actually provides.
 */
export async function fetchCryptoHistorical(
  symbol: string,
  timeframe: string = '15m',
  days: number = 60,
): Promise<CryptoHistoricalResult> {
  const meta = getCryptoMeta(symbol);
  const clampedDays = Math.max(1, Math.floor(days));
  if (!meta) return { bars: [], synthetic: false, clampedDays, limited: true };

  const tfMs = TF_MS[timeframe] ?? TF_MS['15m'];
  const targetBars = Math.min(Math.ceil((clampedDays * 86_400_000) / tfMs), 3000);

  let bars: OHLCVBar[] = [];
  try {
    if (meta.exchange === 'OKX') {
      bars = await fetchOkxHistory(meta, timeframe, targetBars);
    } else {
      bars = await fetchKrakenCandles(meta, timeframe); // Kraken: single-window OHLC
    }
  } catch (err) {
    console.warn(`crypto-feed: historical fetch failed for ${symbol}:`, (err as Error)?.message);
    bars = [];
  }

  // Trim to the requested window (keep the most recent targetBars).
  if (bars.length > targetBars) bars = bars.slice(bars.length - targetBars);

  return { bars, synthetic: false, clampedDays, limited: bars.length < targetBars };
}

// ---------------------------------------------------------------------------
// Order book depth (for the live liquidity / slippage feature)
// ---------------------------------------------------------------------------

export interface OrderBookLevel { price: number; size: number }
export interface OrderBook {
  symbol: string;
  exchange: 'OKX' | 'KRAKEN';
  asks: OrderBookLevel[]; // ascending price
  bids: OrderBookLevel[]; // descending price
  ts: number;
}

function toLevels(rows: any[]): OrderBookLevel[] {
  const out: OrderBookLevel[] = [];
  for (const r of rows ?? []) {
    const price = Number(r?.[0]);
    const size = Number(r?.[1]);
    if (Number.isFinite(price) && Number.isFinite(size) && size > 0) out.push({ price, size });
  }
  return out;
}

/** Fetch the live order book for a crypto symbol. Throws on failure (callers catch). */
export async function fetchCryptoOrderBook(symbol: string): Promise<OrderBook | null> {
  const meta = getCryptoMeta(symbol);
  if (!meta) return null;

  if (meta.exchange === 'OKX') {
    const url = `https://www.okx.com/api/v5/market/books?instId=${meta.symbol}&sz=400`;
    const data = await fetchJson(url);
    const book = data?.data?.[0];
    if (!book) return null;
    const asks = toLevels(book.asks).sort((a, b) => a.price - b.price);
    const bids = toLevels(book.bids).sort((a, b) => b.price - a.price);
    return { symbol, exchange: 'OKX', asks, bids, ts: Number(book.ts) || Date.now() };
  }

  // Kraken
  const url = `https://api.kraken.com/0/public/Depth?pair=${meta.symbol}&count=500`;
  const data = await fetchJson(url);
  if (data?.error?.length) throw new Error(`Kraken error: ${data.error.join(',')}`);
  const result = data?.result ?? {};
  const key = firstResultKey(result);
  if (!key) return null;
  const book = result[key];
  const asks = toLevels(book?.asks).sort((a, b) => a.price - b.price);
  const bids = toLevels(book?.bids).sort((a, b) => b.price - a.price);
  return { symbol, exchange: 'KRAKEN', asks, bids, ts: Date.now() };
}
