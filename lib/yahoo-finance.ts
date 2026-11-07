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

// Base prices for synthetic fallback data
const SYMBOL_BASE_PRICES: Record<string, number> = {
  'ES=F':  5200,
  'NQ=F':  18500,
  'YM=F':  39000,
  'RTY=F': 2050,
  'CL=F':  78,
  'NG=F':  2.5,
  'GC=F':  2350,
  'SI=F':  28,
  'ZB=F':  115,
  'ZN=F':  109,
  'ZC=F':  450,
  'ZS=F':  1200,
  'BTC=F': 68000,
  'MES=F': 5200,
  'MNQ=F': 18500,
};

function generateSyntheticBars(symbol: string, timeframe: string, count: number = 200): OHLCVBar[] {
  const base = SYMBOL_BASE_PRICES[symbol] ?? 1000;
  const volatility = base * 0.001; // 0.1% per bar
  const bars: OHLCVBar[] = [];

  const intervalMs: Record<string, number> = {
    '1m':  60_000,
    '5m':  300_000,
    '15m': 900_000,
    '1h':  3_600_000,
    '4h':  14_400_000,
    '1d':  86_400_000,
  };
  const barMs = intervalMs[timeframe] ?? intervalMs['15m'];
  const now = Date.now();
  let price = base;

  for (let i = count; i >= 0; i--) {
    const ts = now - i * barMs;
    const open = price;
    const change = (Math.random() - 0.49) * volatility * 2;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * volatility;
    const low  = Math.min(open, close) - Math.random() * volatility;
    const volume = Math.floor(10000 + Math.random() * 50000);

    bars.push({ timestamp: ts, open, high, low, close, volume });
    price = close;
  }

  return bars;
}

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
  synthetic: boolean; // true whenever ANY synthetic fallback was used
  source: string;     // provenance of the bars, e.g. 'yahoo'
}

/**
 * Like fetchYahooFinanceData but also reports whether synthetic (fake) bars were
 * used. `synthetic` is true if the fetch failed OR too few real bars came back
 * and we fell back to generateSyntheticBars. Callers that require REAL data only
 * (e.g. the demo-trade resolver) must check this flag and refuse to act on
 * synthetic bars.
 */
export async function fetchYahooFinanceDataWithMeta(
  symbol: string,
  timeframe: string = '15m'
): Promise<MarketDataResult> {
  const tf = TIMEFRAME_MAP[timeframe] ?? TIMEFRAME_MAP['15m'];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${tf.interval}&range=${tf.range}&includePrePost=true&corsDomain=finance.yahoo.com`;

  let bars: OHLCVBar[] = [];
  let synthetic = false;

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
    console.warn(`Yahoo Finance fetch failed for ${symbol}, using synthetic data:`, err?.message);
    bars = generateSyntheticBars(symbol, timeframe);
    synthetic = true;
  }

  // If we got back empty data, fall back to synthetic
  if (bars.length < 10) {
    console.warn(`Insufficient data for ${symbol} (${bars.length} bars), using synthetic data`);
    bars = generateSyntheticBars(symbol, timeframe);
    synthetic = true;
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
  const result: OHLCVBar[] = [];
  for (let i = 0; i < bars.length; i += 4) {
    const slice = bars.slice(i, i + 4);
    if (slice.length === 0) continue;
    result.push({
      timestamp: slice[0]?.timestamp ?? 0,
      open:      slice[0]?.open  ?? 0,
      high:      Math.max(...slice.map((b: OHLCVBar) => b?.high ?? 0)),
      low:       Math.min(...slice.map((b: OHLCVBar) => b?.low  ?? Infinity)),
      close:     slice[slice.length - 1]?.close ?? 0,
      volume:    slice.reduce((sum: number, b: OHLCVBar) => sum + (b?.volume ?? 0), 0),
    });
  }
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

export function getSessionInfo(): SessionInfo {
  const now = new Date();
  const etStr = now.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const [hourStr, minuteStr] = etStr.split(':');
  const etHour   = parseInt(hourStr ?? '0', 10);
  const etMinute = parseInt(minuteStr ?? '0', 10);
  const etTime   = etHour + etMinute / 60; // fractional hours

  let session = 'After Hours';
  let killZone: string | null = null;

  // ICT Kill Zones (ET)
  if (etTime >= 2 && etTime < 5) {
    session  = 'London Session';
    killZone = 'London Open Kill Zone (2-5 AM ET)';
  } else if (etTime >= 3 && etTime < 4) {
    session  = 'London Session';
    killZone = 'London Silver Bullet (3-4 AM ET)';
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
  } else if (etTime >= 13.5 && etTime < 16) {
    session  = 'New York Session';
    killZone = 'NY PM Kill Zone (1:30-4 PM ET)';
  } else if (etTime >= 14 && etTime < 15) {
    session  = 'New York Session';
    killZone = 'PM Silver Bullet (2-3 PM ET)';
  } else if (etTime >= 16 && etTime < 20) {
    session  = 'After Hours';
  } else if (etTime >= 20 || etTime < 2) {
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
 * timeframe, using Yahoo period1/period2. Falls back to synthetic bars on error.
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
  let synthetic = false;

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
    console.warn(`Historical fetch failed for ${symbol}, using synthetic:`, (err as Error).message);
  }

  if (bars.length < 30) {
    // Approximate bar count for the window so synthetic backtests are meaningful.
    const barsPerDay: Record<string, number> = { '1m': 1440, '5m': 288, '15m': 96, '1h': 24, '4h': 6, '1d': 1 };
    const count = Math.min((barsPerDay[timeframe] ?? 96) * clampedDays, 5000);
    bars = generateSyntheticBars(symbol, timeframe, count);
    synthetic = true;
  }

  if (timeframe === '4h') {
    bars = aggregate4H(bars);
  }

  return { bars, synthetic, clampedDays };
}
