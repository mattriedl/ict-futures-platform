'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, RefreshCw, Clock,
  Layers, Target, Brain, ChevronDown, Zap, Shield, ArrowRight,
  Activity, BarChart2, AlertTriangle,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { OneClickTrade } from '@/components/trade/one-click-trade';
import { CRYPTO_INSTRUMENTS, isCryptoSymbol, isLowLiquiditySymbol } from '@/lib/crypto-instruments';
import { FOREX_INSTRUMENTS, isForexSymbol } from '@/lib/instruments';
import { formatPrice as sharedFormatPrice } from '@/lib/format';

const CandlestickChart = dynamic(
  () => import('./candlestick-chart'),
  { ssr: false, loading: () => <div className="h-[500px] bg-white/5 animate-pulse rounded-lg" /> }
);

type SymbolInfo = { symbol: string; name: string; shortName: string; category: string };

// Mirrors the /api/futures/[symbol]/quote response (lib/live-quote.ts LiveQuote).
type LiveQuote = {
  symbol: string;
  price: number | null;
  baseline: number | null;
  change: number | null;
  changePct: number | null;
  source: string;
  ts: number | null;
  stale: boolean;
  assetClass: 'crypto' | 'forex' | 'futures';
};

const SYMBOLS: SymbolInfo[] = [
  // Equity Index
  { symbol: 'ES=F',  name: 'E-mini S&P 500',      shortName: 'ES',  category: 'Equity' },
  { symbol: 'NQ=F',  name: 'E-mini Nasdaq 100',    shortName: 'NQ',  category: 'Equity' },
  { symbol: 'YM=F',  name: 'E-mini Dow Jones',     shortName: 'YM',  category: 'Equity' },
  { symbol: 'RTY=F', name: 'E-mini Russell 2000',  shortName: 'RTY', category: 'Equity' },
  // Energy
  { symbol: 'CL=F',  name: 'Crude Oil WTI',        shortName: 'CL',  category: 'Energy' },
  { symbol: 'NG=F',  name: 'Natural Gas',           shortName: 'NG',  category: 'Energy' },
  // Metals
  { symbol: 'GC=F',  name: 'Gold',                 shortName: 'GC',  category: 'Metals' },
  { symbol: 'SI=F',  name: 'Silver',               shortName: 'SI',  category: 'Metals' },
  // Rates
  { symbol: 'ZB=F',  name: '30-Year T-Bond',       shortName: 'ZB',  category: 'Rates'  },
  { symbol: 'ZN=F',  name: '10-Year T-Note',       shortName: 'ZN',  category: 'Rates'  },
  // Grains
  { symbol: 'ZC=F',  name: 'Corn',                 shortName: 'ZC',  category: 'Grains' },
  { symbol: 'ZS=F',  name: 'Soybeans',             shortName: 'ZS',  category: 'Grains' },
  // Crypto
  { symbol: 'BTC=F', name: 'Bitcoin Futures',      shortName: 'BTC', category: 'Crypto' },
  // Micro
  { symbol: 'MES=F', name: 'Micro E-mini S&P',     shortName: 'MES', category: 'Micro'  },
  { symbol: 'MNQ=F', name: 'Micro E-mini Nasdaq',  shortName: 'MNQ', category: 'Micro'  },
  // Crypto Spot (live OKX / Kraken feeds)
  ...CRYPTO_INSTRUMENTS.map((c) => ({
    symbol: c.symbol,
    name: c.name,
    shortName: c.coin,
    category: 'Crypto Spot',
  })),
  // Forex (spot FX via Yahoo Finance)
  ...FOREX_INSTRUMENTS.map((f) => {
    const pair = f.symbol.replace('=X', ''); // e.g. EURUSD
    return {
      symbol: f.symbol,
      name: f.name,
      shortName: `${pair.slice(0, 3)}/${pair.slice(3, 6)}`, // e.g. EUR/USD
      category: 'Forex',
    };
  }),
];

const CATEGORIES = [...new Set(SYMBOLS.map(s => s.category))];

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];

const PATTERN_TYPE_LABELS: Record<string, string> = {
  ORDER_BLOCK:      'Order Blocks',
  FVG:              'Fair Value Gaps',
  LIQUIDITY_SWEEP:  'Liquidity Sweeps',
  MSS_BOS:          'MSS / BOS / CHoCH',
  OTE:              'OTE Zones',
  PREMIUM_DISCOUNT: 'Premium / Discount',
  BREAKER_BLOCK:    'Breaker Blocks',
  MITIGATION_BLOCK: 'Mitigation Blocks',
  EQ_HIGHS_LOWS:    'Equal Highs / Lows',
  DISPLACEMENT:     'Displacement',
  NDOG_NWOG:        'Opening Gaps',
  SILVER_BULLET:    'Silver Bullet',
  POWER_OF_THREE:   'Power of Three',
  PDH_PDL:          'Prev Day Levels',
};

const INITIAL_OVERLAYS: Record<string, boolean> = Object.fromEntries(
  Object.keys(PATTERN_TYPE_LABELS).map(k => [k, true])
);

interface Pattern {
  type: string;
  direction: string;
  priceLevel: number;
  upperBound?: number;
  lowerBound?: number;
  confidence: number;
  description: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  Equity: 'text-blue-400',
  Energy: 'text-amber-400',
  Metals: 'text-yellow-400',
  Rates:  'text-purple-400',
  Grains: 'text-green-400',
  Crypto: 'text-orange-400',
  Micro:  'text-cyan-400',
  'Crypto Spot': 'text-orange-300',
  Forex:  'text-teal-400',
};

// Format a price with a sensible number of decimals for its magnitude so both a
// $60,000 BTC and a $0.00001234 memecoin render legibly. FX pairs keep their
// standard quoting precision (JPY pairs 3 dp, all others 5 dp) so e.g. EUR/USD
// shows 1.16932 rather than 1.17; all other markets delegate to the shared
// adaptive formatter (lib/format) for consistency across the app.
function formatPrice(p: number | null | undefined, symbol?: string): string {
  if (p == null || Number.isNaN(p)) return '—';
  if (symbol && isForexSymbol(symbol)) {
    const d = /JPY=X$/i.test(symbol) ? 3 : 5;
    return p.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  return sharedFormatPrice(p, { grouping: true });
}

export function ChartClient({ symbol: initialSymbol }: { symbol: string }) {
  const [symbol, setSymbol]               = useState(decodeURIComponent(initialSymbol));
  const [timeframe, setTimeframe]         = useState('15m');
  const [bars, setBars]                   = useState<any[]>([]);
  const [patterns, setPatterns]           = useState<Pattern[]>([]);
  const [confluence, setConfluence]       = useState<any>(null);
  const [setup, setSetup]                 = useState<any>(null);
  const [bias, setBias]                   = useState('NEUTRAL');
  const [loading, setLoading]             = useState(true);
  const [session, setSession]             = useState<any>(null);
  const [aiExplanation, setAiExplanation] = useState('');
  const [aiLoading, setAiLoading]         = useState(false);
  const [showSymbolDropdown, setShowSymbolDropdown] = useState(false);
  const [enabledOverlays, setEnabledOverlays]       = useState<Record<string, boolean>>(INITIAL_OVERLAYS);
  const [activeCategory, setActiveCategory]         = useState<string | null>(null);
  const [quote, setQuote]                           = useState<LiveQuote | null>(null);
  // Remember the last real price so a transient stale quote doesn't blank the header.
  const [lastGoodPrice, setLastGoodPrice]           = useState<number | null>(null);
  const [dataUnavailable, setDataUnavailable]       = useState(false);

  const currentSymbol = SYMBOLS.find(s => s.symbol === symbol) ?? SYMBOLS[0];

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const [dataRes, analysisRes] = await Promise.all([
        fetch(`/api/futures/${encodeURIComponent(symbol)}/data?timeframe=${timeframe}`),
        fetch(`/api/futures/${encodeURIComponent(symbol)}/analyze?timeframe=${timeframe}`),
      ]);

      if (dataRes.ok) {
        const data = await dataRes.json();
        setBars(data?.bars ?? []);
        setDataUnavailable(Boolean(data?.unavailable));
        setSession({ session: data?.session, killZone: data?.killZone });
      } else {
        setBars([]);
        setDataUnavailable(true);
      }
      if (analysisRes.ok) {
        const analysis = await analysisRes.json();
        setPatterns(analysis?.patterns ?? []);
        setConfluence(analysis?.confluence ?? null);
        setSetup(analysis?.setup ?? null);
        setBias(analysis?.bias ?? 'NEUTRAL');
        if (analysis?.session) {
          setSession({ session: analysis.session?.session, killZone: analysis.session?.killZone });
        }
      }
    } catch (err: any) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe]);

  useEffect(() => {
    fetchAnalysis();
    // Crypto trades 24/7, so refresh a bit faster; futures keep the 30s poll.
    const pollMs = isCryptoSymbol(symbol) ? 12000 : 30000;
    const interval = setInterval(fetchAnalysis, pollMs);
    return () => clearInterval(interval);
  }, [fetchAnalysis, symbol]);

  // Dedicated live-quote poll — real-time and INDEPENDENT of the selected
  // timeframe, so switching timeframes never moves the header price. Crypto
  // updates every 5s; futures/FX every 15s.
  useEffect(() => {
    let cancelled = false;
    const fetchQuote = async () => {
      try {
        const res = await fetch(`/api/futures/${encodeURIComponent(symbol)}/quote`);
        if (!res.ok) return;
        const q: LiveQuote = await res.json();
        if (cancelled) return;
        setQuote(q);
        if (q?.price != null && !q.stale) setLastGoodPrice(q.price);
      } catch {
        // Leave the previous quote in place on transient failures.
      }
    };
    // Reset last-good price when the symbol changes, then fetch immediately.
    setLastGoodPrice(null);
    setQuote(null);
    fetchQuote();
    const quoteMs = isCryptoSymbol(symbol) ? 5000 : 15000;
    const quoteInterval = setInterval(fetchQuote, quoteMs);
    return () => {
      cancelled = true;
      clearInterval(quoteInterval);
    };
  }, [symbol]);

  const getAiExplanation = async () => {
    if (aiLoading || patterns.length === 0) return;
    setAiLoading(true);
    setAiExplanation('');

    try {
      const lastBar = bars?.[bars.length - 1];
      const livePrice = quote?.price ?? lastGoodPrice ?? lastBar?.close ?? 0;
      const res = await fetch('/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patterns,
          symbol,
          timeframe,
          currentPrice: livePrice,
          bias,
          session: session?.session,
          killZone: session?.killZone,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setAiExplanation(err?.error ?? 'Failed to generate AI analysis. Please try again.');
        return;
      }

      const reader  = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let partial = '';

      while (true) {
        const { done, value } = await (reader?.read() ?? { done: true, value: undefined });
        if (done) break;
        partial += decoder.decode(value, { stream: true });
        const lines = partial.split('\n');
        partial = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed  = JSON.parse(data);
              const content = parsed?.choices?.[0]?.delta?.content ?? '';
              buffer += content;
              setAiExplanation(buffer);
            } catch (_) {}
          }
        }
      }
    } catch (err: any) {
      console.error('AI explanation error:', err);
      setAiExplanation('Failed to generate AI analysis. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const filteredPatterns = patterns.filter(p => enabledOverlays?.[p?.type] !== false);
  // Draw only patterns that formed in the most recent candles; the full window
  // (days of data) produces hundreds of overlapping labels that hide price.
  // The pattern list in the side panel still shows everything.
  const OVERLAY_RECENT_BARS = 120;
  const chartPatterns = filteredPatterns.filter(
    (p: any) => typeof p?.endIndex !== 'number' || p.endIndex >= bars.length - OVERLAY_RECENT_BARS,
  );

  const patternsByType = filteredPatterns.reduce<Record<string, Pattern[]>>((acc, p) => {
    if (!acc[p.type]) acc[p.type] = [];
    acc[p.type].push(p);
    return acc;
  }, {});

  const filteredByCategory = activeCategory
    ? SYMBOLS.filter(s => s.category === activeCategory)
    : SYMBOLS;

  // Live price header — driven by the dedicated live-quote poll, NOT the loaded
  // candles, so the reference price stays real-time and identical across
  // timeframes. Change/changePct come from the quote's 24h/prev-close baseline.
  const isLiveQuote  = quote != null && !quote.stale && quote.price != null;
  const headerPrice  = quote?.price ?? lastGoodPrice;
  const priceChange  = isLiveQuote ? quote?.change ?? null : null;
  const priceChangePct = isLiveQuote ? quote?.changePct ?? null : null;
  const priceUp      = priceChange != null && priceChange >= 0;
  const quoteUnavailable = quote != null && quote.stale;

  const setAllOverlays = (value: boolean) =>
    setEnabledOverlays(Object.fromEntries(Object.keys(PATTERN_TYPE_LABELS).map(k => [k, value])));

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Main Chart Area */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Chart Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-white/5 bg-[#0D1121]/50">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Symbol Selector */}
            <div className="relative">
              <button
                onClick={() => setShowSymbolDropdown(!showSymbolDropdown)}
                className="flex items-center gap-2 bg-[#1A1F35] px-4 py-2 rounded-lg border border-white/5 hover:border-white/10 transition-all"
              >
                <BarChart2 className="w-4 h-4 text-gray-400" />
                <span className="text-white font-semibold font-mono">{currentSymbol?.shortName}</span>
                <span className="text-gray-500 text-xs hidden sm:block">{currentSymbol?.name}</span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>

              {showSymbolDropdown && (
                <div className="absolute top-full left-0 mt-1 bg-[#1A1F35] border border-white/10 rounded-xl shadow-2xl z-50 w-72">
                  {/* Category filter */}
                  <div className="flex flex-wrap gap-1 p-2 border-b border-white/5">
                    <button
                      onClick={() => setActiveCategory(null)}
                      className={`text-[10px] px-2 py-1 rounded-full transition-colors ${!activeCategory ? 'bg-blue-500/20 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                      All
                    </button>
                    {CATEGORIES.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
                        className={`text-[10px] px-2 py-1 rounded-full transition-colors ${activeCategory === cat ? 'bg-blue-500/20 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <div className="max-h-72 overflow-auto">
                    {CATEGORIES.filter(cat => !activeCategory || cat === activeCategory).map(cat => (
                      <div key={cat}>
                        <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider bg-white/2">{cat}</div>
                        {filteredByCategory.filter(s => s.category === cat).map(s => (
                          <button
                            key={s.symbol}
                            onClick={() => { setSymbol(s.symbol); setShowSymbolDropdown(false); setActiveCategory(null); }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-white/5 transition-colors flex items-center justify-between ${s.symbol === symbol ? 'bg-blue-500/5' : ''}`}
                          >
                            <span className={`font-mono font-semibold ${CATEGORY_COLORS[cat] ?? 'text-white'}`}>{s.shortName}</span>
                            <span className="text-gray-500 text-xs">{s.name}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Live Price — real-time, timeframe-independent quote */}
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-mono font-bold text-white tabular-nums">
                {headerPrice != null ? formatPrice(headerPrice, symbol) : '—'}
              </span>
              {priceChange != null && priceChangePct != null && (
                <span className={`flex items-center gap-1 text-sm font-mono font-semibold ${priceUp ? 'text-green-400' : 'text-red-400'}`}>
                  {priceUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {priceUp ? '+' : ''}{formatPrice(priceChange, symbol)}
                  <span className="text-xs opacity-90">({priceUp ? '+' : ''}{priceChangePct.toFixed(2)}%)</span>
                </span>
              )}
              {isLiveQuote && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-green-400 uppercase tracking-wide">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  Live
                </span>
              )}
              {quoteUnavailable && (
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  Live price unavailable
                </span>
              )}
            </div>

            {/* Timeframe Selector */}
            <div className="flex bg-[#1A1F35] rounded-lg p-0.5 border border-white/5">
              {TIMEFRAMES.map(tf => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1.5 text-xs font-mono rounded-md transition-all ${timeframe === tf ? 'bg-blue-500/20 text-blue-400' : 'text-gray-400 hover:text-white'}`}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* Bias */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${
              bias === 'BULLISH' ? 'bg-green-500/10 text-green-400' : bias === 'BEARISH' ? 'bg-red-500/10 text-red-400' : 'bg-gray-500/10 text-gray-400'
            }`}>
              {bias === 'BULLISH' ? <TrendingUp className="w-4 h-4" /> : bias === 'BEARISH' ? <TrendingDown className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              {bias}
            </div>
          </div>

          <button
            onClick={fetchAnalysis}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 text-blue-400 rounded-lg text-sm hover:bg-blue-500/20 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Session / Kill Zone Banner */}
        {session && (
          <div className={`flex items-center gap-2 px-5 py-1.5 text-xs border-b border-white/5 ${
            session.killZone
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
              : 'bg-white/2 text-gray-500'
          }`}>
            <Clock className="w-3.5 h-3.5" />
            <span className="font-medium">{session.session}</span>
            {session.killZone && (
              <>
                <span className="text-amber-500/50 mx-1">•</span>
                <Activity className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-semibold text-amber-300">{session.killZone}</span>
              </>
            )}
          </div>
        )}

        {/* Low-liquidity / manipulation warning */}
        {isLowLiquiditySymbol(symbol) && (
          <div className="flex items-start gap-2 px-5 py-2 text-xs border-b border-amber-500/20 bg-amber-500/10 text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              <span className="font-semibold">Low-liquidity / high-manipulation market.</span>{' '}
              This is a memecoin / microcap with thin order books — expect wide spreads, slippage
              and elevated risk of stop hunts and volatile wicks. Size positions conservatively.
            </span>
          </div>
        )}

        {/* Chart */}
        <div className="flex-1 p-4 relative">
          <CandlestickChart bars={bars} patterns={chartPatterns} loading={loading} />
          {dataUnavailable && !loading && (
            <div className="absolute inset-4 flex items-center justify-center pointer-events-none">
              <div className="bg-[#1A1F35]/90 border border-amber-500/30 text-amber-300 text-sm rounded-lg px-4 py-3 max-w-md text-center">
                Market data for {symbol} is unavailable right now. The data source didn&apos;t respond;
                this page retries automatically. No prices are simulated.
              </div>
            </div>
          )}
        </div>

        {/* Overlay Toggles */}
        <div className="px-5 py-3 border-t border-white/5 bg-[#0D1121]/50">
          <div className="flex items-center gap-2 flex-wrap">
            <Layers className="w-4 h-4 text-gray-400 mr-1 flex-shrink-0" />
            <button
              onClick={() => setAllOverlays(true)}
              className="text-xs px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20 hover:bg-blue-500/25 transition-all flex-shrink-0"
            >
              Select all
            </button>
            <button
              onClick={() => setAllOverlays(false)}
              className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-gray-400 border border-white/5 hover:text-white hover:bg-white/10 transition-all flex-shrink-0"
            >
              Clear all
            </button>
            <span className="w-px h-4 bg-white/10 mx-0.5 flex-shrink-0" />
            {Object.entries(PATTERN_TYPE_LABELS).map(([key, label]) => {
              const count = patternsByType[key]?.length ?? 0;
              return (
                <button
                  key={key}
                  onClick={() => setEnabledOverlays(prev => ({ ...prev, [key]: !(prev?.[key] ?? true) }))}
                  className={`text-xs px-3 py-1 rounded-full transition-all flex items-center gap-1.5 ${
                    enabledOverlays?.[key] !== false
                      ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                      : 'bg-white/5 text-gray-500 border border-white/5'
                  }`}
                >
                  {label}
                  {count > 0 && enabledOverlays?.[key] !== false && (
                    <span className="bg-blue-500/30 text-blue-300 text-[9px] px-1 py-0.5 rounded-full font-mono">{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-full lg:w-96 border-l border-white/5 bg-[#0D1121]/30 overflow-auto">
        <div className="p-4 space-y-4">

          {/* AI Confluence Score */}
          <div className="bg-[#1A1F35]/60 rounded-xl p-4 border border-white/5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-semibold text-white">Confluence Score</h3>
              </div>
              <span className={`text-2xl font-mono font-bold ${
                (confluence?.score ?? 0) >= 70 ? 'text-green-400' : (confluence?.score ?? 0) >= 40 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {confluence?.score ?? 0}<span className="text-xs text-gray-500 font-normal">/100</span>
              </span>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-auto">
              {(confluence?.factors ?? []).map((f: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${f?.met ? 'bg-green-400' : 'bg-gray-700'}`} />
                    <span className={f?.met ? 'text-gray-300' : 'text-gray-600'}>{f?.name}</span>
                  </div>
                  <span className={`font-mono flex-shrink-0 ${f?.met ? 'text-green-400' : 'text-gray-700'}`}>+{f?.weight}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Trade Setup */}
          {setup && (
            <div className="bg-[#1A1F35]/60 rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">ICT Trade Setup</h3>
              </div>
              <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-lg ${setup?.direction === 'BULLISH' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                {setup?.direction === 'BULLISH' ? <TrendingUp className="w-4 h-4 text-green-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
                <span className={`text-sm font-semibold ${setup?.direction === 'BULLISH' ? 'text-green-400' : 'text-red-400'}`}>{setup?.direction} Setup</span>
                <span className="ml-auto text-xs text-gray-500">Score: {setup?.weightedScore ?? setup?.aiScore}/100</span>
              </div>
              {setup?.liveStatus && setup.liveStatus !== 'FRESH' && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-gray-500/10 border border-white/5 text-[11px] text-gray-400">
                  {setup.liveStatusLabel}. Not tradeable at the current price — the autotrader skips it and One-Click will refuse it.
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  { label: 'Entry',       value: formatPrice(setup?.entryPrice, symbol), color: 'text-white'   },
                  { label: 'R:R Ratio',   value: `1:${setup?.riskReward}`, color: 'text-blue-400' },
                  { label: 'Stop Loss',   value: formatPrice(setup?.stopLoss, symbol),   color: 'text-red-400'  },
                  { label: 'Take Profit', value: formatPrice(setup?.takeProfit, symbol), color: 'text-green-400'},
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-[#0D1121]/60 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    <p className={`font-mono font-semibold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
              {setup?.confluences && setup.confluences.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {setup.confluences.map((c: string) => (
                    <span key={c} className="text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-full">
                      {c.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              )}
              {setup?.entryPrice != null && setup?.stopLoss != null && setup?.takeProfit != null && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <OneClickTrade
                    className="w-full"
                    setup={{
                      symbol,
                      direction: setup.direction,
                      entryPrice: setup.entryPrice,
                      stopLoss: setup.stopLoss,
                      takeProfit: setup.takeProfit,
                      riskReward: setup.riskReward,
                      aiScore: setup.weightedScore ?? setup.aiScore,
                      confluences: setup.confluences ?? [],
                      timeframe,
                    }}
                  />
                  <p className="text-[10px] text-gray-600 mt-1.5 text-center">Logs this setup as a tracked demo trade</p>
                </div>
              )}
            </div>
          )}

          {/* Active Patterns */}
          <div className="bg-[#1A1F35]/60 rounded-xl p-4 border border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-5 h-5 text-purple-400" />
              <h3 className="text-sm font-semibold text-white">Detected Patterns</h3>
              <span className="ml-auto text-xs text-gray-500">{filteredPatterns.length} active</span>
            </div>
            <div className="space-y-2 max-h-72 overflow-auto">
              {filteredPatterns.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">No patterns detected on this timeframe</p>
              ) : (
                filteredPatterns.map((p: Pattern, i: number) => (
                  <div key={i} className="bg-[#0D1121]/60 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-300">
                        {PATTERN_TYPE_LABELS[p?.type] ?? p?.type?.replace?.(/_/g, ' ')}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${p?.direction === 'BULLISH' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                        {p?.direction}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">{p?.description}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] text-gray-600">Confidence:</span>
                      <div className="flex-1 h-1 bg-white/5 rounded-full">
                        <div
                          className={`h-1 rounded-full ${(p?.confidence ?? 0) >= 70 ? 'bg-green-400' : (p?.confidence ?? 0) >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                          style={{ width: `${p?.confidence ?? 0}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-gray-400">{Math.round(p?.confidence ?? 0)}%</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* AI Explanation */}
          <div className="bg-[#1A1F35]/60 rounded-xl p-4 border border-white/5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">AI ICT Analysis</h3>
              </div>
              <button
                onClick={getAiExplanation}
                disabled={aiLoading || patterns.length === 0}
                className="text-xs px-3 py-1 bg-amber-500/10 text-amber-400 rounded-lg hover:bg-amber-500/20 transition-all disabled:opacity-50"
              >
                {aiLoading ? 'Analyzing...' : 'Generate'}
              </button>
            </div>
            {aiExplanation ? (
              <div className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap max-h-80 overflow-auto">
                {aiExplanation}
              </div>
            ) : (
              <p className="text-xs text-gray-500 text-center py-4">
                Click &quot;Generate&quot; for AI-powered ICT analysis of all detected patterns
              </p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
