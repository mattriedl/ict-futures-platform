export interface OHLCVBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const TIMEFRAME_MAP: Record<string, { interval: string; range: string }> = {
  '1m':  { interval: '1m',  range: '1d'  },
  '5m':  { interval: '5m',  range: '5d'  },
  '15m': { interval: '15m', range: '5d'  },
  '1h':  { interval: '1h',  range: '1mo' },
  '4h':  { interval: '1h',  range: '3mo' },
  '1d':  { interval: '1d',  range: '1y'  },
};

async function fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
      if (res.ok) return res;
      if (res.status === 429 || res.status === 503) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
        continue;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err: any) {
      if (attempt === retries - 1) throw err;
      await new Promise(r => setTimeout(r, (attempt + 1) * 500));
    }
  }
  throw new Error('Max retries exceeded');
}

export interface MarketDataResult {
  bars: OHLCVBar[];
  /**
   * Kept for API compatibility. The platform NEVER fabricates bars any more, so
   * this is always false; a failed fetch returns an empty `bars` array instead.
   */
  synthetic: boolean;
  source: string;     // provenance of the bars, e.g. 'yahoo'
}

/**
 * Fetch recent candles from Yahoo Finance. REAL DATA ONLY: if the request fails
 * or returns too little data, `bars` is empty and callers must show a
 * "market data unavailable" state rather than invent prices.
 */
export async function fetchYahooFinanceDataWithMeta(
  symbol: string,
  timeframe: string = '15m'
): Promise<MarketDataResult> {
  const tf = TIMEFRAME_MAP[timeframe] ?? TIMEFRAME_MAP['15m'];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${tf.interval}&range=${tf.range}&includePrePost=true&corsDomain=finance.yahoo.com`;

  let bars: OHLCVBar[] = [];
  const synthetic = false;

  try {
    const res = await fetchWithRetry(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com',
        'Origin': 'https://finance.yahoo.com',
      },
      next: { revalidate: 0 },
    });

    const data = await res.json();
    const result = data?.chart?.result?.[0];

    if (result) {
      const timestamps = result?.timestamp ?? [];
      const quote = result?.indicators?.quote?.[0] ?? {};
      const opens   = quote?.open   ?? [];
      const highs   = quote?.high   ?? [];
      const lows    = quote?.low    ?? [];
      const closes  = quote?.close  ?? [];
      const volumes = quote?.volume ?? [];

      for (let i = 0; i < timestamps.length; i++) {
        const o = opens[i]; const h = highs[i]; const l = lows[i]; const c = closes[i];
        if (o == null || h == null || l == null || c == null) continue;
        bars.push({
          timestamp: timestamps[i] * 1000,
          open: o, high: h, low: l, close: c,
          volume: volumes[i] ?? 0,
        });
      }
    }
  } catch (err: any) {
    console.warn(`Yahoo Finance fetch failed for ${symbol}:`, err?.message);
    bars = [];
  }

  if (bars.length < 10) {
    if (bars.length > 0) console.warn(`Insufficient data for ${symbol} (${bars.length} bars)`);
    bars = [];
  }

  // For 4h, aggregate 1h bars into 4h
  if (timeframe === '4h') {
    return { bars: aggregate4H(bars), synthetic, source: 'yahoo' };
  }

  return { bars, synthetic, source: 'yahoo' };
}

/**
 * Backward-compatible wrapper: returns just the bars (real or synthetic).
 * Use fetchYahooFinanceDataWithMeta when you need to know if bars are synthetic.
 */
export async function fetchYahooFinanceData(
  symbol: string,
  timeframe: string = '15m'
): Promise<OHLCVBar[]> {
  return (await fetchYahooFinanceDataWithMeta(symbol, timeframe)).bars;
}

function aggregate4H(bars: OHLCVBar[]): OHLCVBar[] {
  // Group 1h bars into 4h buckets aligned to UTC 00/04/08/12/16/20 — grouping
  // every 4 rows drifts out of alignment whenever the feed skips an hour
  // (weekends, maintenance breaks, missing prints).
  const FOUR_H = 4 * 3_600_000;
  const result: OHLCVBar[] = [];
  let cur: OHLCVBar | null = null;
  let curBucket = -1;
  for (const b of bars) {
    const bucket = Math.floor(b.timestamp / FOUR_H) * FOUR_H;
    if (!cur || bucket !== curBucket) {
      if (cur) result.push(cur);
      cur = { timestamp: bucket, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0 };
      curBucket = bucket;
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume ?? 0;
    }
  }
  if (cur) result.push(cur);
  return result;
}

export function getCurrentPrice(bars: OHLCVBar[]): number {
  return bars?.[bars.length - 1]?.close ?? 0;
}

export interface SessionInfo {
  session: string;
  killZone: string | null;
  etHour: number;
  etMinute: number;
}

export function getSessionInfo(at: Date | number = Date.now()): SessionInfo {
  const date = typeof at === 'number' ? new Date(at) : at;
  // formatToParts + hourCycle h23 avoids the "24:05" midnight quirk some ICU
  // builds produce with hour12:false.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const etHour   = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10) % 24;
  const etMinute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  const etTime   = etHour + etMinute / 60; // fractional hours

  let session = 'After Hours';
  let killZone: string | null = null;

  // ICT Kill Zones (ET). Narrower Silver Bullet windows are checked BEFORE the
  // broader kill zones that contain them, otherwise they can never match.
  if (etTime >= 3 && etTime < 4) {
    session  = 'London Session';
    killZone = 'London Silver Bullet (3-4 AM ET)';
  } else if (etTime >= 2 && etTime < 5) {
    session  = 'London Session';
    killZone = 'London Open Kill Zone (2-5 AM ET)';
  } else if (etTime >= 5 && etTime < 7) {
    session  = 'London Session';
  } else if (etTime >= 7 && etTime < 10) {
    session  = 'New York Session';
    killZone = 'NY Open Kill Zone (7-10 AM ET)';
  } else if (etTime >= 10 && etTime < 11) {
    session  = 'New York Session';
    killZone = 'AM Silver Bullet / London Close KZ (10-11 AM ET)';
  } else if (etTime >= 11 && etTime < 12) {
    session  = 'New York Session';
    killZone = 'London Close Kill Zone (10 AM-12 PM ET)';
  } else if (etTime >= 12 && etTime < 13.5) {
    session  = 'New York Session';
  } else if (etTime >= 14 && etTime < 15) {
    session  = 'New York Session';
    killZone = 'PM Silver Bullet (2-3 PM ET)';
  } else if (etTime >= 13.5 && etTime < 16) {
    session  = 'New York Session';
    killZone = 'NY PM Kill Zone (1:30-4 PM ET)';
  } else if (etTime >= 16 && etTime < 20) {
    session  = 'After Hours';
  } else {
    session  = 'Asia Session';
  }

  return { session, killZone, etHour, etMinute };
}



// ---------------------------------------------------------------------------
// Historical data fetch for backtesting.
// Yahoo limits intraday history: 1m ~ 7 days, 5m/15m/1h ~ 60 days. Daily = years.
// We clamp the requested window to what each interval supports.
// ---------------------------------------------------------------------------

const INTERVAL_MAX_DAYS: Record<string, number> = {
  '1m': 7,
  '5m': 59,
  '15m': 59,
  '1h': 59,
  '4h': 59,
  '1d': 3650,
};

export interface HistoricalResult {
  bars: OHLCVBar[];
  synthetic: boolean;
  clampedDays: number;
}

/**
 * Fetch historical candles for a symbol over the last `days` days at the given
 * timeframe, using Yahoo period1/period2. Returns no bars (never fake ones) on error.
 */
export async function fetchHistoricalData(
  symbol: string,
  timeframe: string = '15m',
  days: number = 60,
): Promise<HistoricalResult> {
  const maxDays = INTERVAL_MAX_DAYS[timeframe] ?? 59;
  const clampedDays = Math.min(Math.max(1, Math.floor(days)), maxDays);

  const interval = timeframe === '4h' ? '1h' : timeframe;
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - clampedDays * 86400;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?interval=${interval}&period1=${period1}&period2=${period2}&includePrePost=false`;

  let bars: OHLCVBar[] = [];
  const synthetic = false;

  try {
    const res = await fetchWithRetry(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://finance.yahoo.com',
        Origin: 'https://finance.yahoo.com',
      },
      next: { revalidate: 0 },
    });
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (result) {
      const timestamps = result?.timestamp ?? [];
      const quote = result?.indicators?.quote?.[0] ?? {};
      const opens = quote?.open ?? [];
      const highs = quote?.high ?? [];
      const lows = quote?.low ?? [];
      const closes = quote?.close ?? [];
      const volumes = quote?.volume ?? [];
      for (let i = 0; i < timestamps.length; i++) {
        const o = opens[i];
        const h = highs[i];
        const l = lows[i];
        const c = closes[i];
        if (o == null || h == null || l == null || c == null) continue;
        bars.push({ timestamp: timestamps[i] * 1000, open: o, high: h, low: l, close: c, volume: volumes[i] ?? 0 });
      }
    }
  } catch (err) {
    console.warn(`Historical fetch failed for ${symbol}:`, (err as Error).message);
  }

  // REAL DATA ONLY: too little history means the backtest cannot run.
  if (bars.length < 30) bars = [];

  if (timeframe === '4h') {
    bars = aggregate4H(bars);
  }

  return { bars, synthetic, clampedDays };
}
