'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Clock, Zap, Target,
  ArrowUpRight, ArrowDownRight, Activity, BarChart3, Eye, Shield, ShieldAlert
} from 'lucide-react';
import Link from 'next/link';
import { formatPrice } from '@/lib/format';
import { getInstrumentMeta } from '@/lib/instruments';

interface DashSymbol { symbol: string; name: string; shortName: string; color: string }

const COLORS = ['blue', 'purple', 'amber', 'yellow'];
const DEFAULT_TRACKED = 'ES=F,NQ=F,CL=F,GC=F';

/** Build dashboard cards from the user's tracked-symbol setting. */
function buildSymbols(tracked: string): DashSymbol[] {
  const list = Array.from(new Set(tracked.split(',').map((s) => s.trim()).filter(Boolean))).slice(0, 20);
  return list.map((symbol, i) => {
    const meta = getInstrumentMeta(symbol);
    return {
      symbol,
      name: meta?.name ?? symbol,
      shortName: symbol.replace('=F', '').replace('=X', ''),
      color: COLORS[i % COLORS.length],
    };
  });
}

interface FuturesData {
  currentPrice: number;
  change: number;
  changePct: number;
  sessionHigh: number;
  sessionLow: number;
  session: string;
  killZone: string | null;
}

interface AnalysisData {
  patterns: any[];
  confluence: any;
  setup: any;
  bias: string;
  patternsCount: number;
}

interface DrawdownStatus {
  dayStartBalance: number;
  currentBalance: number;
  startingBalance: number;
  todayRealizedPnl: number;
  todayLossPercent: number;
  peakBalance?: number;
  overallDrawdownPercent: number;
  dailyLimitPercent: number;
  overallLimitPercent: number;
  dailyBreached: boolean;
  overallBreached: boolean;
  enforceDrawdown: boolean;
}

export function DashboardClient() {
  const [futuresData, setFuturesData] = useState<Record<string, FuturesData>>({});
  const [analysisData, setAnalysisData] = useState<Record<string, AnalysisData>>({});
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState('');
  const [sessionInfo, setSessionInfo] = useState({ session: '', killZone: '' });
  // Minimum AI score threshold — reuses the existing user setting (alertMinScore).
  const [minScore, setMinScore] = useState(50);
  const [drawdown, setDrawdown] = useState<DrawdownStatus | null>(null);
  const [symbols, setSymbols] = useState<DashSymbol[]>(() => buildSymbols(DEFAULT_TRACKED));
  const [refreshMs, setRefreshMs] = useState(60000);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const results = await Promise.allSettled(
        symbols.map(async (s) => {
          const [dataRes, analysisRes, quoteRes] = await Promise.all([
            fetch(`/api/futures/${encodeURIComponent(s.symbol)}/data?timeframe=15m`),
            fetch(`/api/futures/${encodeURIComponent(s.symbol)}/analyze?timeframe=15m`),
            fetch(`/api/futures/${encodeURIComponent(s.symbol)}/quote`),
          ]);
          const data = dataRes.ok ? await dataRes.json() : null;
          // Price and change come from the live quote (vs prior close / 24h open),
          // matching the chart header. The candle-to-candle change shown before
          // was usually +0.00.
          const quote = quoteRes.ok ? await quoteRes.json() : null;
          if (data && quote && !quote.stale && quote.price != null) {
            data.currentPrice = quote.price;
            if (quote.change != null) data.change = quote.change;
            if (quote.changePct != null) data.changePct = quote.changePct;
          }
          const analysis = analysisRes.ok ? await analysisRes.json() : null;
          return { symbol: s.symbol, data, analysis };
        })
      );

      const newFutures: Record<string, FuturesData> = {};
      const newAnalysis: Record<string, AnalysisData> = {};

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { symbol, data, analysis } = result.value ?? {};
          if (data && symbol) {
            newFutures[symbol] = data;
            if (!sessionInfo.session) {
              setSessionInfo({ session: data?.session ?? '', killZone: data?.killZone ?? '' });
            }
          }
          if (analysis && symbol) newAnalysis[symbol] = analysis;
        }
      }

      setFuturesData(newFutures);
      setAnalysisData(newAnalysis);
    } catch (err: any) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [symbols]);

  // Wait for the user's settings so we fetch their tracked instruments (not the
  // defaults) and poll at their configured refresh interval.
  useEffect(() => {
    if (!settingsLoaded) return;
    fetchData();
    const interval = setInterval(fetchData, refreshMs);
    return () => clearInterval(interval);
  }, [fetchData, refreshMs, settingsLoaded]);

  // Load the configured minimum AI score threshold (reuse existing user setting).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings');
        if (!res.ok) return;
        const json = await res.json();
        const v = json?.settings?.alertMinScore;
        if (typeof v === 'number' && !Number.isNaN(v)) setMinScore(v);
        const tracked = json?.settings?.trackedSymbols;
        if (typeof tracked === 'string' && tracked.trim()) setSymbols(buildSymbols(tracked));
        const ri = json?.settings?.refreshInterval;
        if (typeof ri === 'number' && ri >= 10) setRefreshMs(ri * 1000);
      } catch { /* keep defaults */ } finally {
        setSettingsLoaded(true);
      }
    })();
  }, []);

  // Poll prop-firm drawdown / daily-loss status for the demo account.
  useEffect(() => {
    const loadDrawdown = async () => {
      try {
        const res = await fetch('/api/demo/drawdown');
        if (!res.ok) return;
        const json = await res.json();
        if (json?.drawdown) setDrawdown(json.drawdown);
      } catch { /* ignore drawdown fetch errors */ }
    };
    loadDrawdown();
    const interval = setInterval(loadDrawdown, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleString('en-US', {
          timeZone: 'America/New_York',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Rank by the learning-weighted score when present — the same score the
  // autotrader and alerts use — falling back to the raw confluence score.
  const scoreOf = (s: any) => s?.weightedScore ?? s?.aiScore ?? 0;
  const allSetups = symbols.map((s) => {
    const analysis = analysisData?.[s.symbol];
    if (!analysis?.setup) return null;
    return { ...(analysis.setup ?? {}), symbol: s.symbol, shortName: s.shortName, bias: analysis?.bias };
  }).filter(Boolean).sort((a: any, b: any) => scoreOf(b) - scoreOf(a));

  // Opportunity screener: every setup that clears the configured minimum AI score,
  // kept sorted by aiScore descending. Cap the rendered rows so a large qualifying
  // list stays scrollable instead of overflowing the layout.
  const MAX_VISIBLE_SETUPS = 25;
  const qualifyingSetups = allSetups.filter((s: any) => scoreOf(s) >= minScore);
  const visibleSetups = qualifyingSetups.slice(0, MAX_VISIBLE_SETUPS);

  const sessions = [
    { name: 'Asian Session', time: '6 PM - 2 AM ET', kz: false },
    { name: 'London Kill Zone', time: '2 AM - 5 AM ET', kz: true },
    { name: 'London Session', time: '2 AM - 7 AM ET', kz: false },
    { name: 'NY Kill Zone', time: '7 AM - 10 AM ET', kz: true },
    { name: 'London Close KZ', time: '10 AM - 12 PM ET', kz: true },
    { name: 'NY Afternoon', time: '12 PM - 4 PM ET', kz: false },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-white tracking-tight">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">Real-time ICT futures intelligence overview</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#1A1F35] px-4 py-2 rounded-lg border border-white/5">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="font-mono text-sm text-white" suppressHydrationWarning>{currentTime}</span>
            <span className="text-xs text-gray-500">ET</span>
          </div>
          {sessionInfo.session && (
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${
              sessionInfo.killZone
                ? 'bg-amber-500/10 border-amber-500/20'
                : 'bg-[#1A1F35] border-white/5'
            }`}>
              {sessionInfo.killZone && <Zap className="w-4 h-4 text-amber-400" />}
              <span className={`text-sm font-medium ${sessionInfo.killZone ? 'text-amber-400' : 'text-gray-300'}`}>
                {sessionInfo.killZone || sessionInfo.session}
              </span>
              <span className="w-2 h-2 rounded-full bg-green-400 animate-live-pulse" />
            </div>
          )}
        </div>
      </div>

      {/* Prop-firm drawdown / daily-loss guard */}
      {drawdown && (() => {
        const dailyRatio = drawdown.dailyLimitPercent > 0 ? drawdown.todayLossPercent / drawdown.dailyLimitPercent : 0;
        const overallRatio = drawdown.overallLimitPercent > 0 ? drawdown.overallDrawdownPercent / drawdown.overallLimitPercent : 0;
        const tone = (breached: boolean, ratio: number) =>
          breached ? 'text-red-400' : ratio >= 0.75 ? 'text-amber-400' : 'text-green-400';
        const barTone = (breached: boolean, ratio: number) =>
          breached ? 'bg-red-400' : ratio >= 0.75 ? 'bg-amber-400' : 'bg-green-400';
        const anyBreach = drawdown.dailyBreached || drawdown.overallBreached;
        return (
          <div className={`rounded-xl border p-4 ${
            anyBreach ? 'bg-red-500/10 border-red-500/30' : 'bg-[#1A1F35]/60 border-white/5'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {anyBreach ? <ShieldAlert className="w-4 h-4 text-red-400" /> : <Shield className="w-4 h-4 text-blue-400" />}
                <span className="text-sm font-medium text-white">Risk Guard</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                  drawdown.enforceDrawdown ? 'bg-blue-500/10 text-blue-400' : 'bg-gray-500/10 text-gray-400'
                }`}>
                  {drawdown.enforceDrawdown ? 'ENFORCED' : 'MONITOR'}
                </span>
              </div>
              <span className="text-xs text-gray-500">
                Balance <span className="font-mono text-gray-300">${drawdown.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-400">Daily Loss</span>
                  <span className={`font-mono ${tone(drawdown.dailyBreached, dailyRatio)}`}>
                    {drawdown.todayLossPercent.toFixed(2)}% / {drawdown.dailyLimitPercent.toFixed(2)}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div className={`h-full ${barTone(drawdown.dailyBreached, dailyRatio)}`} style={{ width: `${Math.min(100, dailyRatio * 100)}%` }} />
                </div>
                <p className="text-[10px] text-gray-500 mt-1 font-mono">
                  Today P&amp;L {drawdown.todayRealizedPnl >= 0 ? '+' : ''}${drawdown.todayRealizedPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-400">Overall Drawdown</span>
                  <span className={`font-mono ${tone(drawdown.overallBreached, overallRatio)}`}>
                    {drawdown.overallDrawdownPercent.toFixed(2)}% / {drawdown.overallLimitPercent.toFixed(2)}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div className={`h-full ${barTone(drawdown.overallBreached, overallRatio)}`} style={{ width: `${Math.min(100, overallRatio * 100)}%` }} />
                </div>
                {anyBreach && (
                  <p className="text-[10px] text-red-400 mt-1">
                    {drawdown.enforceDrawdown ? 'New trades are blocked until limits reset.' : 'Limit breached (monitor only).'}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Futures Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {symbols.map((s, idx: number) => {
          const data = futuresData?.[s.symbol];
          const analysis = analysisData?.[s.symbol];
          const isUp = (data?.change ?? 0) >= 0;

          return (
            <motion.div
              key={s.symbol}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <Link href={`/chart/${encodeURIComponent(s.symbol)}`}>
                <div className={`bg-[#1A1F35]/60 backdrop-blur border border-white/5 rounded-xl p-5 hover:border-white/10 transition-all cursor-pointer group ${loading ? 'animate-pulse' : ''}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${s.color === 'blue' ? 'bg-blue-500/10' : s.color === 'purple' ? 'bg-purple-500/10' : s.color === 'amber' ? 'bg-amber-500/10' : 'bg-yellow-500/10'}`}>
                        <BarChart3 className={`w-4 h-4 ${s.color === 'blue' ? 'text-blue-400' : s.color === 'purple' ? 'text-purple-400' : s.color === 'amber' ? 'text-amber-400' : 'text-yellow-400'}`} />
                      </div>
                      <div>
                        <span className="text-white font-semibold text-sm">{s.shortName}</span>
                        <p className="text-[10px] text-gray-500 leading-tight">{s.name}</p>
                      </div>
                    </div>
                    <Eye className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
                  </div>

                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-mono font-bold text-white">
                        {loading ? '---' : formatPrice(data?.currentPrice ?? 0, { grouping: true })}
                      </p>
                      <div className={`flex items-center gap-1 mt-1 ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                        {isUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                        <span className="text-sm font-mono">
                          {isUp ? '+' : ''}{formatPrice(data?.change ?? 0)} ({isUp ? '+' : ''}{(data?.changePct ?? 0).toFixed(2)}%)
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-500">H / L</p>
                      <p className="text-xs font-mono text-gray-400">
                        {loading ? '--' : formatPrice(data?.sessionHigh ?? 0, { grouping: true })}
                      </p>
                      <p className="text-xs font-mono text-gray-400">
                        {loading ? '--' : formatPrice(data?.sessionLow ?? 0, { grouping: true })}
                      </p>
                    </div>
                  </div>

                  {(analysis?.patternsCount ?? 0) > 0 && (
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Target className={`w-3.5 h-3.5 ${analysis?.bias === 'BULLISH' ? 'text-green-400' : analysis?.bias === 'BEARISH' ? 'text-red-400' : 'text-gray-400'}`} />
                        <span className="text-xs text-gray-400">{analysis?.patternsCount ?? 0} patterns</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        analysis?.bias === 'BULLISH' ? 'bg-green-500/10 text-green-400'
                          : analysis?.bias === 'BEARISH' ? 'bg-red-500/10 text-red-400'
                            : 'bg-gray-500/10 text-gray-400'
                      }`}>
                        {analysis?.bias ?? 'NEUTRAL'}
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>

      {/* Live Opportunities + Session Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-[#1A1F35]/60 backdrop-blur border border-white/5 rounded-xl">
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-display font-semibold text-white">Opportunity Screener</h2>
              </div>
              <span className="text-xs text-gray-500">
                {loading
                  ? 'Scanning…'
                  : `${qualifyingSetups.length} ${qualifyingSetups.length === 1 ? 'opportunity' : 'opportunities'} clearing your ${minScore} score filter`}
              </span>
            </div>
            <div className="p-4 space-y-3 max-h-[640px] overflow-y-auto">
              {loading ? (
                Array.from({ length: 3 }).map((_: any, i: number) => (
                  <div key={i} className="h-20 bg-white/5 rounded-lg animate-pulse" />
                ))
              ) : qualifyingSetups.length === 0 ? (
                <div className="text-center py-8">
                  <Activity className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No setups currently clear your {minScore} score filter</p>
                  <p className="text-xs text-gray-600 mt-1">Lower the Minimum AI Score in Settings, or wait for stronger confluences</p>
                </div>
              ) : (
                visibleSetups.map((setup: any, idx: number) => (
                  <motion.div
                    key={`${setup?.symbol}-${idx}`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                  >
                    <Link href={`/chart/${encodeURIComponent(setup?.symbol ?? '')}`}>
                      <div className="bg-[#0D1121]/60 border border-white/5 rounded-lg p-4 hover:border-white/10 transition-all">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <span className="text-white font-semibold font-mono">{setup?.shortName}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              setup?.direction === 'BULLISH' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                            }`}>
                              {setup?.direction === 'BULLISH' ? <TrendingUp className="w-3 h-3 inline mr-1" /> : <TrendingDown className="w-3 h-3 inline mr-1" />}
                              {setup?.direction}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-500">AI Score</p>
                            <p className={`text-lg font-mono font-bold ${
                              (setup?.aiScore ?? 0) >= 70 ? 'text-green-400' : (setup?.aiScore ?? 0) >= 40 ? 'text-amber-400' : 'text-red-400'
                            }`}>
                              {setup?.aiScore ?? 0}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-4 text-xs">
                          <div><span className="text-gray-500">Entry</span><p className="text-white font-mono">{setup?.entryPrice != null ? formatPrice(setup.entryPrice, { grouping: true }) : '--'}</p></div>
                          <div><span className="text-gray-500">Stop Loss</span><p className="text-red-400 font-mono">{setup?.stopLoss != null ? formatPrice(setup.stopLoss, { grouping: true }) : '--'}</p></div>
                          <div><span className="text-gray-500">Take Profit</span><p className="text-green-400 font-mono">{setup?.takeProfit != null ? formatPrice(setup.takeProfit, { grouping: true }) : '--'}</p></div>
                          <div><span className="text-gray-500">R:R</span><p className="text-blue-400 font-mono">{setup?.riskReward ?? '--'}</p></div>
                        </div>
                        <div className="flex gap-1.5 mt-3 flex-wrap">
                          {(setup?.confluences ?? []).map((c: string, ci: number) => (
                            <span key={ci} className="text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-full">
                              {c?.replace?.(/_/g, ' ') ?? c}
                            </span>
                          ))}
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))
              )}
              {!loading && qualifyingSetups.length > MAX_VISIBLE_SETUPS && (
                <p className="text-center text-xs text-gray-600 pt-1">
                  Showing top {MAX_VISIBLE_SETUPS} of {qualifyingSetups.length} qualifying setups (highest AI score first)
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Session Timeline */}
        <div className="bg-[#1A1F35]/60 backdrop-blur border border-white/5 rounded-xl">
          <div className="px-5 py-4 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-display font-semibold text-white">Session Timeline</h2>
            </div>
          </div>
          <div className="p-4 space-y-2">
            {sessions.map((sess: any, i: number) => {
              const isActive = sessionInfo.killZone === sess.name ||
                (sessionInfo.session && sess.name?.includes(sessionInfo.session?.split(' ')?.[0] ?? ''));
              return (
                <div
                  key={i}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${
                    isActive ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {sess.kz && <Zap className="w-3.5 h-3.5 text-amber-400" />}
                    <span className={`text-sm ${isActive ? 'text-blue-400 font-medium' : 'text-gray-400'}`}>
                      {sess.name}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-gray-500">{sess.time}</span>
                </div>
              );
            })}
          </div>

          <div className="px-4 pb-4">
            <div className="bg-[#0D1121]/60 rounded-lg p-4 mt-2">
              <h3 className="text-sm font-medium text-gray-300 mb-3">Quick Stats</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Active Patterns</span>
                  <span className="text-white font-mono">
                    {Object.values(analysisData).reduce((sum: number, a: any) => sum + (a?.patternsCount ?? 0), 0)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Trade Setups</span>
                  <span className="text-white font-mono">{allSetups.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Highest Score</span>
                  <span className="text-green-400 font-mono">{allSetups?.[0]?.aiScore ?? '--'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
