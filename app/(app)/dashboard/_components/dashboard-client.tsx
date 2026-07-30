'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Clock, Zap, Target,
  ArrowUpRight, ArrowDownRight, Activity, BarChart3, Eye
} from 'lucide-react';
import Link from 'next/link';

const SYMBOLS = [
  { symbol: 'ES=F', name: 'E-mini S&P 500', shortName: 'ES', color: 'blue' },
  { symbol: 'NQ=F', name: 'E-mini Nasdaq 100', shortName: 'NQ', color: 'purple' },
  { symbol: 'CL=F', name: 'Crude Oil WTI', shortName: 'CL', color: 'amber' },
  { symbol: 'GC=F', name: 'Gold', shortName: 'GC', color: 'yellow' },
];

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

export function DashboardClient() {
  const [futuresData, setFuturesData] = useState<Record<string, FuturesData>>({});
  const [analysisData, setAnalysisData] = useState<Record<string, AnalysisData>>({});
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState('');
  const [sessionInfo, setSessionInfo] = useState({ session: '', killZone: '' });

  const fetchData = useCallback(async () => {
    try {
      const results = await Promise.allSettled(
        SYMBOLS.map(async (s: any) => {
          const [dataRes, analysisRes] = await Promise.all([
            fetch(`/api/futures/${encodeURIComponent(s.symbol)}/data?timeframe=15m`),
            fetch(`/api/futures/${encodeURIComponent(s.symbol)}/analyze?timeframe=15m`),
          ]);
          const data = dataRes.ok ? await dataRes.json() : null;
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
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

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

  const allSetups = SYMBOLS.map((s: any) => {
    const analysis = analysisData?.[s.symbol];
    if (!analysis?.setup) return null;
    return { ...(analysis.setup ?? {}), symbol: s.symbol, shortName: s.shortName, bias: analysis?.bias };
  }).filter(Boolean).sort((a: any, b: any) => (b?.aiScore ?? 0) - (a?.aiScore ?? 0));

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

      {/* Futures Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {SYMBOLS.map((s: any, idx: number) => {
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
                        {loading ? '---' : (data?.currentPrice ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <div className={`flex items-center gap-1 mt-1 ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                        {isUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                        <span className="text-sm font-mono">
                          {isUp ? '+' : ''}{(data?.change ?? 0).toFixed(2)} ({isUp ? '+' : ''}{(data?.changePct ?? 0).toFixed(2)}%)
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-500">H / L</p>
                      <p className="text-xs font-mono text-gray-400">
                        {loading ? '--' : (data?.sessionHigh ?? 0).toFixed(2)}
                      </p>
                      <p className="text-xs font-mono text-gray-400">
                        {loading ? '--' : (data?.sessionLow ?? 0).toFixed(2)}
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
                <h2 className="text-lg font-display font-semibold text-white">Live Opportunities</h2>
              </div>
              <span className="text-xs text-gray-500">Ranked by AI confidence</span>
            </div>
            <div className="p-4 space-y-3">
              {loading ? (
                Array.from({ length: 3 }).map((_: any, i: number) => (
                  <div key={i} className="h-20 bg-white/5 rounded-lg animate-pulse" />
                ))
              ) : allSetups.length === 0 ? (
                <div className="text-center py-8">
                  <Activity className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No active trade setups at this time</p>
                  <p className="text-xs text-gray-600 mt-1">Setups appear when ICT confluences are detected</p>
                </div>
              ) : (
                allSetups.slice(0, 5).map((setup: any, idx: number) => (
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
                          <div><span className="text-gray-500">Entry</span><p className="text-white font-mono">{setup?.entryPrice ?? '--'}</p></div>
                          <div><span className="text-gray-500">Stop Loss</span><p className="text-red-400 font-mono">{setup?.stopLoss ?? '--'}</p></div>
                          <div><span className="text-gray-500">Take Profit</span><p className="text-green-400 font-mono">{setup?.takeProfit ?? '--'}</p></div>
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
