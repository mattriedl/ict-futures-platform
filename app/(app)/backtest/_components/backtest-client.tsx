'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  FlaskConical, Play, Trash2, TrendingUp, TrendingDown, Target,
  Percent, Activity, Loader2, ChevronRight, Calendar, Gauge,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { INSTRUMENTS } from '@/lib/instruments';
import { isCryptoSymbol } from '@/lib/crypto-instruments';

const TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d'];
const CONFLUENCE_OPTIONS = [
  'ORDER_BLOCK', 'FVG', 'LIQUIDITY_SWEEP', 'MSS_BOS', 'OTE',
  'BREAKER_BLOCK', 'MITIGATION_BLOCK', 'DISPLACEMENT', 'SILVER_BULLET', 'PREMIUM_DISCOUNT',
];

const fmt = (n: number, d = 2) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export function BacktestClient() {
  const [symbol, setSymbol] = useState('ES=F');
  const [timeframe, setTimeframe] = useState('15m');
  const [days, setDays] = useState(60);
  const [minAiScore, setMinAiScore] = useState(0);
  const [riskPerTrade, setRiskPerTrade] = useState(1);
  const [intendedSizeUsd, setIntendedSizeUsd] = useState(10000);
  const [confluences, setConfluences] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);

  const loadRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/backtest');
      if (res.ok) setRuns((await res.json()).runs ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  const toggleConfluence = (c: string) =>
    setConfluences((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, timeframe, days, minAiScore, riskPerTrade, intendedSizeUsd, requiredConfluences: confluences }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || 'Backtest failed'); return; }
      setResult(json.result);
      toast.success(`Backtest complete — ${json.result.totalTrades} trades`);
      loadRuns();
    } catch (e) {
      toast.error('Backtest request failed');
    } finally {
      setRunning(false);
    }
  };

  const loadRun = async (id: string) => {
    try {
      const res = await fetch(`/api/backtest/${id}`);
      if (!res.ok) { toast.error('Could not load run'); return; }
      const json = await res.json();
      setResult(json.run);
      setSymbol(json.run.symbol);
      setTimeframe(json.run.timeframe);
    } catch { toast.error('Could not load run'); }
  };

  const deleteRun = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/backtest/${id}`, { method: 'DELETE' });
      setRuns((prev) => prev.filter((r) => r.id !== id));
      toast.success('Run deleted');
    } catch { toast.error('Delete failed'); }
  };

  const netPositive = (result?.netPnlPercent ?? 0) >= 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/10 border border-blue-500/20">
          <FlaskConical className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-white tracking-tight">Strategy Backtesting</h1>
          <p className="text-sm text-gray-400 mt-0.5">Walk-forward simulation of ICT setups over up to 60 days of history</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Config panel */}
        <div className="xl:col-span-1 space-y-4">
          <div className="bg-[#1A1F35]/60 backdrop-blur border border-white/5 rounded-xl p-5 space-y-5">
            <h2 className="text-sm font-display font-semibold text-white flex items-center gap-2">
              <Gauge className="w-4 h-4 text-blue-400" /> Configuration
            </h2>

            {/* Symbol */}
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Instrument</label>
              <select value={symbol} onChange={(e) => setSymbol(e.target.value)}
                className="w-full bg-[#0D1121] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-blue-500/50 outline-none">
                {INSTRUMENTS.map((i) => (
                  <option key={i.symbol} value={i.symbol}>{i.symbol.replace('=F', '')} — {i.name}</option>
                ))}
              </select>
            </div>

            {/* Timeframe */}
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Timeframe</label>
              <div className="grid grid-cols-5 gap-1.5">
                {TIMEFRAMES.map((tf) => (
                  <button key={tf} onClick={() => setTimeframe(tf)}
                    className={`py-2 rounded-lg text-xs font-medium transition-all ${
                      timeframe === tf ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-[#0D1121] text-gray-400 border border-white/5 hover:text-white'
                    }`}>{tf}</button>
                ))}
              </div>
            </div>

            {/* Days */}
            <div>
              <label className="text-xs text-gray-400 mb-1.5 flex justify-between">
                <span>Lookback window</span><span className="text-white font-mono">{days} days</span>
              </label>
              <input type="range" min={5} max={60} value={days} onChange={(e) => setDays(+e.target.value)}
                className="w-full accent-blue-500" />
            </div>

            {/* Min AI score */}
            <div>
              <label className="text-xs text-gray-400 mb-1.5 flex justify-between">
                <span>Min AI confluence score</span><span className="text-white font-mono">{minAiScore}</span>
              </label>
              <input type="range" min={0} max={90} step={5} value={minAiScore} onChange={(e) => setMinAiScore(+e.target.value)}
                className="w-full accent-blue-500" />
            </div>

            {/* Risk per trade */}
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Risk per trade (% of equity)</label>
              <input type="number" min={0.1} max={10} step={0.1} value={riskPerTrade}
                onChange={(e) => setRiskPerTrade(+e.target.value)}
                className="w-full bg-[#0D1121] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white font-mono focus:border-blue-500/50 outline-none" />
            </div>

            {/* Position size (USD) — used for the crypto liquidity estimate */}
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">
                Position size (USD)
                <span className="text-gray-600 ml-1">· liquidity estimate (crypto)</span>
              </label>
              <input type="number" min={100} max={100000000} step={100} value={intendedSizeUsd}
                onChange={(e) => setIntendedSizeUsd(+e.target.value)}
                className="w-full bg-[#0D1121] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white font-mono focus:border-blue-500/50 outline-none" />
              {isCryptoSymbol(symbol) && (
                <p className="text-[10px] text-gray-600 mt-1">
                  Used to estimate how your order size compares with historical candle volume.
                </p>
              )}
            </div>

            {/* Required confluences */}
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Required confluences (optional)</label>
              <div className="flex flex-wrap gap-1.5">
                {CONFLUENCE_OPTIONS.map((c) => (
                  <button key={c} onClick={() => toggleConfluence(c)}
                    className={`text-[10px] px-2 py-1 rounded-full border transition-all ${
                      confluences.includes(c)
                        ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                        : 'bg-[#0D1121] text-gray-500 border-white/5 hover:text-gray-300'
                    }`}>{c.replace(/_/g, ' ')}</button>
                ))}
              </div>
            </div>

            <button onClick={run} disabled={running}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-50 text-white text-sm font-semibold py-3 rounded-lg transition-all">
              {running ? <><Loader2 className="w-4 h-4 animate-spin" /> Running…</> : <><Play className="w-4 h-4" /> Run Backtest</>}
            </button>
          </div>

          {/* Saved runs */}
          <div className="bg-[#1A1F35]/60 backdrop-blur border border-white/5 rounded-xl p-5">
            <h2 className="text-sm font-display font-semibold text-white mb-3">Recent Runs</h2>
            <div className="space-y-2 max-h-72 overflow-auto">
              {runs.length === 0 && <p className="text-xs text-gray-500">No saved runs yet.</p>}
              {runs.map((r) => (
                <div key={r.id} onClick={() => loadRun(r.id)}
                  className="group flex items-center justify-between bg-[#0D1121]/60 border border-white/5 rounded-lg px-3 py-2 cursor-pointer hover:border-white/10">
                  <div className="min-w-0">
                    <p className="text-xs text-white font-mono truncate">{r.symbol.replace('=F', '')} · {r.timeframe}</p>
                    <p className="text-[10px] text-gray-500">{r.totalTrades} trades · {fmt(r.winRate, 1)}% WR</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-mono ${r.netPnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {r.netPnlPercent >= 0 ? '+' : ''}{fmt(r.netPnlPercent, 1)}%
                    </span>
                    <button onClick={(e) => deleteRun(r.id, e)} className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="xl:col-span-2 space-y-4">
          {!result ? (
            <div className="bg-[#1A1F35]/40 border border-dashed border-white/10 rounded-xl h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8">
              <FlaskConical className="w-12 h-12 text-gray-700 mb-3" />
              <p className="text-sm text-gray-400">Configure your strategy and run a backtest</p>
              <p className="text-xs text-gray-600 mt-1">Results, equity curve, and every simulated trade will appear here.</p>
            </div>
          ) : (
            <>
              {result.synthetic && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2.5 text-xs text-amber-300">
                  ⚠ Live market data was unavailable, so this run used synthetic price data. Treat results as indicative only.
                </div>
              )}
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Net Return" value={`${netPositive ? '+' : ''}${fmt(result.netPnlPercent, 1)}%`} accent={netPositive ? 'green' : 'red'} icon={netPositive ? TrendingUp : TrendingDown} />
                <StatCard label="Win Rate" value={`${fmt(result.winRate, 1)}%`} accent="blue" icon={Target} sub={`${result.wins}W / ${result.losses}L`} />
                <StatCard label="Profit Factor" value={result.profitFactor == null ? '∞' : fmt(result.profitFactor, 2)} accent="purple" icon={Activity} />
                <StatCard label="Max Drawdown" value={`-${fmt(result.maxDrawdownPercent, 1)}%`} accent="amber" icon={Percent} />
                <StatCard label="Total Trades" value={String(result.totalTrades)} accent="blue" icon={FlaskConical} />
                <StatCard label="Avg R:R" value={fmt(result.avgRR, 2)} accent="blue" icon={Gauge} />
                <StatCard label="Net R" value={`${result.netR >= 0 ? '+' : ''}${fmt(result.netR, 2)}R`} accent={result.netR >= 0 ? 'green' : 'red'} icon={Target} />
                <StatCard label="Window" value={`${result.clampedDays ?? days}d`} accent="blue" icon={Calendar} sub={result.timeframe} />
              </div>

              {/* Liquidity estimate (crypto, volume-based approximation) */}
              {result.liquidity && isCryptoSymbol(result.symbol) && (
                <div className="bg-[#1A1F35]/60 backdrop-blur border border-amber-500/15 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-display font-semibold text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-amber-400" /> Liquidity Estimate
                    </h3>
                    <span className="text-[10px] uppercase tracking-wider text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded-full">
                      Approximation
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                    <div className="bg-[#0D1121]/60 rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 mb-1">Order size</p>
                      <p className="font-mono font-semibold text-white">${fmt(result.liquidity.intendedSizeUsd, 0)}</p>
                    </div>
                    <div className="bg-[#0D1121]/60 rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 mb-1">Avg volume participation</p>
                      <p className="font-mono font-semibold text-white">
                        {result.liquidity.avgParticipationPercent == null ? '—' : `${fmt(result.liquidity.avgParticipationPercent, 2)}%`}
                      </p>
                    </div>
                    <div className="bg-[#0D1121]/60 rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 mb-1">Rating</p>
                      <p className={`font-mono font-semibold ${
                        result.liquidity.rating === 'AMPLE' ? 'text-green-400'
                          : result.liquidity.rating === 'MODERATE' ? 'text-amber-400'
                          : result.liquidity.rating === 'THIN' ? 'text-red-400' : 'text-gray-500'
                      }`}>{result.liquidity.rating ?? '—'}</p>
                    </div>
                  </div>
                  {result.liquidity.thinTradeCount > 0 && (
                    <p className="text-xs text-amber-300/90 mb-2">
                      {result.liquidity.thinTradeCount} trade{result.liquidity.thinTradeCount === 1 ? '' : 's'} would have consumed a large share of candle volume (thin liquidity).
                    </p>
                  )}
                  <p className="text-[11px] text-gray-500 leading-relaxed">{result.liquidity.note}</p>
                </div>
              )}

              {/* Equity curve */}
              <div className="bg-[#1A1F35]/60 backdrop-blur border border-white/5 rounded-xl p-5">
                <h3 className="text-sm font-display font-semibold text-white mb-4">Equity Curve <span className="text-xs text-gray-500 font-normal">(R-multiple cumulative)</span></h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={(result.equityCurve ?? []).map((p: any, i: number) => ({ i, equity: p.equity }))}>
                      <defs>
                        <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={netPositive ? '#16c784' : '#ea3943'} stopOpacity={0.4} />
                          <stop offset="100%" stopColor={netPositive ? '#16c784' : '#ea3943'} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="i" tick={{ fill: '#5b6478', fontSize: 11 }} stroke="rgba(255,255,255,0.1)" />
                      <YAxis tick={{ fill: '#5b6478', fontSize: 11 }} stroke="rgba(255,255,255,0.1)" width={40} />
                      <Tooltip contentStyle={{ background: '#0D1121', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: '#8a94a6' }} formatter={(v: any) => [fmt(v, 2) + 'R', 'Equity']} />
                      <Area type="monotone" dataKey="equity" stroke={netPositive ? '#16c784' : '#ea3943'} strokeWidth={2} fill="url(#eq)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Trades table */}
              <div className="bg-[#1A1F35]/60 backdrop-blur border border-white/5 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                  <h3 className="text-sm font-display font-semibold text-white">Simulated Trades</h3>
                  <span className="text-xs text-gray-500">{(result.trades ?? []).length} total</span>
                </div>
                <div className="overflow-auto max-h-96">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-[#0D1121]">
                      <tr className="text-gray-500 text-left">
                        <th className="px-4 py-2.5 font-medium">#</th>
                        <th className="px-4 py-2.5 font-medium">Dir</th>
                        <th className="px-4 py-2.5 font-medium">Entry</th>
                        <th className="px-4 py-2.5 font-medium">Stop</th>
                        <th className="px-4 py-2.5 font-medium">Target</th>
                        <th className="px-4 py-2.5 font-medium">Exit</th>
                        <th className="px-4 py-2.5 font-medium">R:R</th>
                        <th className="px-4 py-2.5 font-medium">Score</th>
                        <th className="px-4 py-2.5 font-medium text-right">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(result.trades ?? []).map((t: any, i: number) => (
                        <tr key={i} className="border-t border-white/5 hover:bg-white/[0.02]">
                          <td className="px-4 py-2.5 text-gray-500 font-mono">{i + 1}</td>
                          <td className="px-4 py-2.5">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${t.direction === 'LONG' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{t.direction}</span>
                          </td>
                          <td className="px-4 py-2.5 text-white font-mono">{fmt(t.entryPrice)}</td>
                          <td className="px-4 py-2.5 text-red-400/80 font-mono">{fmt(t.stopLoss)}</td>
                          <td className="px-4 py-2.5 text-green-400/80 font-mono">{fmt(t.takeProfit)}</td>
                          <td className="px-4 py-2.5 text-gray-300 font-mono">{t.exitPrice == null ? '—' : fmt(t.exitPrice)}</td>
                          <td className="px-4 py-2.5 text-blue-400 font-mono">{fmt(t.riskReward, 1)}</td>
                          <td className="px-4 py-2.5 text-gray-400 font-mono">{t.aiScore}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-semibold">
                            <span className={t.outcome === 'WIN' ? 'text-green-400' : t.outcome === 'LOSS' ? 'text-red-400' : 'text-gray-500'}>
                              {t.outcome === 'OPEN' ? 'OPEN' : `${t.rMultiple >= 0 ? '+' : ''}${fmt(t.rMultiple, 2)}R`}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {(result.trades ?? []).length === 0 && (
                        <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">No trades were triggered with these filters.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent, icon: Icon, sub }: { label: string; value: string; accent: string; icon: any; sub?: string }) {
  const colors: Record<string, string> = {
    green: 'text-green-400', red: 'text-red-400', blue: 'text-blue-400', purple: 'text-purple-400', amber: 'text-amber-400',
  };
  return (
    <div className="bg-[#1A1F35]/60 backdrop-blur border border-white/5 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-gray-500">{label}</span>
        <Icon className={`w-4 h-4 ${colors[accent]}`} />
      </div>
      <p className={`text-xl font-mono font-bold ${colors[accent]}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}
