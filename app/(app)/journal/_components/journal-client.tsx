'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  History, Wallet, TrendingUp, TrendingDown, Target, Percent, Activity,
  Plus, RefreshCw, Settings2, X, Loader2, Award, Flame, BarChart3,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import { INSTRUMENTS, getInstrumentMeta } from '@/lib/instruments';

const fmt = (n: number | null | undefined, d = 2) =>
  (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (n: number | null | undefined) =>
  `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Tab = 'overview' | 'open' | 'history';

export function JournalClient() {
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<any>(null);
  const [account, setAccount] = useState<any>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManual, setShowManual] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sRes, aRes, tRes] = await Promise.all([
        fetch('/api/demo/stats'),
        fetch('/api/demo/account'),
        fetch('/api/demo/trades'),
      ]);
      if (sRes.ok) setStats(await sRes.json());
      if (aRes.ok) setAccount(await aRes.json());
      if (tRes.ok) setTrades((await tRes.json()).trades ?? []);
    } catch { toast.error('Failed to load journal'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openTrades = trades.filter((t) => t.status === 'OPEN');
  const closedTrades = trades.filter((t) => t.status !== 'OPEN');

  const closeTrade = async (id: string, exitPrice: number) => {
    try {
      const res = await fetch(`/api/demo/trades/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exitPrice }),
      });
      if (!res.ok) { toast.error((await res.json()).error || 'Close failed'); return; }
      toast.success('Trade closed'); load();
    } catch { toast.error('Close failed'); }
  };

  const deleteTrade = async (id: string) => {
    try {
      await fetch(`/api/demo/trades/${id}`, { method: 'DELETE' });
      toast.success('Trade deleted'); load();
    } catch { toast.error('Delete failed'); }
  };

  const s = stats?.summary;
  const netPositive = (s?.netPnl ?? 0) >= 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/20 to-blue-500/10 border border-emerald-500/20">
            <History className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-white tracking-tight">Trade Journal</h1>
            <p className="text-sm text-gray-400 mt-0.5">Paper-trading performance, statistics & learning analytics</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowManual(true)}
            className="inline-flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-all">
            <Plus className="w-4 h-4" /> New Manual Trade
          </button>
          <button onClick={() => setShowSettings(true)}
            className="inline-flex items-center gap-1.5 bg-[#1A1F35] border border-white/10 text-gray-300 hover:text-white text-sm px-3 py-2.5 rounded-lg transition-all">
            <Settings2 className="w-4 h-4" /> Account
          </button>
          <button onClick={load} className="p-2.5 bg-[#1A1F35] border border-white/10 text-gray-400 hover:text-white rounded-lg transition-all">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Account balance banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <div className={`col-span-2 bg-gradient-to-br from-[#12233b] to-[#0d1121] border border-blue-500/20 rounded-xl p-5 ${loading ? 'animate-pulse' : ''}`}>
          <div className="flex items-center gap-2 mb-1"><Wallet className="w-4 h-4 text-blue-400" /><span className="text-xs text-gray-400">Account Balance</span></div>
          <p className="text-3xl font-mono font-bold text-white">{loading ? '—' : money(account?.account?.currentBalance)}</p>
          <p className={`text-xs font-mono mt-1 ${(account?.realizedPnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {loading ? 'loading account…' : <>{(account?.realizedPnl ?? 0) >= 0 ? '+' : ''}{money(account?.realizedPnl)} realized · start {money(account?.account?.startingBalance)}</>}
          </p>
        </div>
        <StatCard label="Net P&L" value={`${netPositive ? '+' : ''}${money(s?.netPnl)}`} sub={`${s?.netPnlPercent >= 0 ? '+' : ''}${fmt(s?.netPnlPercent, 2)}%`} accent={netPositive ? 'green' : 'red'} icon={netPositive ? TrendingUp : TrendingDown} loading={loading} />
        <StatCard label="Win Rate" value={`${fmt(s?.winRate, 1)}%`} sub={`${s?.wins ?? 0}W / ${s?.losses ?? 0}L`} accent="blue" icon={Target} loading={loading} />
        <StatCard label="Profit Factor" value={s?.profitFactor == null ? '∞' : fmt(s?.profitFactor, 2)} sub={`expectancy ${money(s?.expectancy)}`} accent="purple" icon={Activity} loading={loading} />
        <StatCard label="Open / Closed" value={`${s?.openTrades ?? 0} / ${s?.closedTrades ?? 0}`} sub={`avg ${fmt(s?.avgRMultiple, 2)}R`} accent="amber" icon={BarChart3} loading={loading} />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-[#1A1F35]/60 border border-white/5 rounded-lg p-1 w-fit">
        {(['overview', 'open', 'history'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-all ${
              tab === t ? 'bg-blue-500/20 text-blue-400' : 'text-gray-400 hover:text-white'
            }`}>
            {t === 'open' ? `Open (${openTrades.length})` : t === 'history' ? `History (${closedTrades.length})` : 'Analytics'}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Analytics stats={stats} loading={loading} />}
      {tab === 'open' && <OpenTrades trades={openTrades} onClose={closeTrade} onDelete={deleteTrade} />}
      {tab === 'history' && <TradeHistory trades={closedTrades} onDelete={deleteTrade} />}

      {showManual && <ManualTradeModal onClose={() => setShowManual(false)} onSaved={() => { setShowManual(false); load(); }} />}
      {showSettings && <AccountModal account={account} onClose={() => setShowSettings(false)} onSaved={() => { setShowSettings(false); load(); }} />}
    </div>
  );
}

/* ---------------- Analytics tab ---------------- */
function Analytics({ stats, loading }: { stats: any; loading: boolean }) {
  if (loading) return <div className="h-64 bg-[#1A1F35]/40 rounded-xl animate-pulse" />;
  if (!stats || stats.summary.closedTrades === 0) {
    return (
      <div className="bg-[#1A1F35]/40 border border-dashed border-white/10 rounded-xl min-h-[300px] flex flex-col items-center justify-center text-center p-8">
        <History className="w-12 h-12 text-gray-700 mb-3" />
        <p className="text-sm text-gray-400">No closed trades yet</p>
        <p className="text-xs text-gray-600 mt-1">Track a setup from the chart or add a manual trade — analytics build automatically as trades resolve.</p>
      </div>
    );
  }
  const s = stats.summary;
  const equity = (stats.equityCurve ?? []).map((p: any, i: number) => ({ i, equity: p.equity }));
  const netPositive = (s.netPnl ?? 0) >= 0;

  return (
    <div className="space-y-4">
      {/* Extra learning stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MiniStat label="Avg Win" value={money(s.avgWin)} accent="green" />
        <MiniStat label="Avg Loss" value={money(s.avgLoss)} accent="red" />
        <MiniStat label="Avg R" value={`${fmt(s.avgRMultiple, 2)}R`} accent="blue" />
        <MiniStat label="Max Drawdown" value={`-${fmt(s.maxDrawdownPercent, 1)}%`} accent="amber" />
        <MiniStat label="Expectancy" value={money(s.expectancy)} accent="purple" />
        <MiniStat label="Streak" value={s.streakCount ? `${s.streakCount} ${s.streakType}` : '—'} accent={s.streakType === 'WIN' ? 'green' : 'red'} icon={Flame} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Equity curve */}
        <div className="lg:col-span-2 bg-[#1A1F35]/60 backdrop-blur border border-white/5 rounded-xl p-5">
          <h3 className="text-sm font-display font-semibold text-white mb-4">Equity Curve</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equity}>
                <defs>
                  <linearGradient id="jeq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={netPositive ? '#16c784' : '#ea3943'} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={netPositive ? '#16c784' : '#ea3943'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="i" tick={{ fill: '#5b6478', fontSize: 11 }} stroke="rgba(255,255,255,0.1)" />
                <YAxis tick={{ fill: '#5b6478', fontSize: 11 }} stroke="rgba(255,255,255,0.1)" width={60} domain={['auto', 'auto']} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: '#0D1121', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#8a94a6' }} formatter={(v: any) => [money(v), 'Equity']} />
                <Area type="monotone" dataKey="equity" stroke={netPositive ? '#16c784' : '#ea3943'} strokeWidth={2} fill="url(#jeq)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* R distribution */}
        <div className="bg-[#1A1F35]/60 backdrop-blur border border-white/5 rounded-xl p-5">
          <h3 className="text-sm font-display font-semibold text-white mb-4">R-Multiple Distribution</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.rDistribution ?? []} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" tick={{ fill: '#5b6478', fontSize: 11 }} stroke="rgba(255,255,255,0.1)" allowDecimals={false} />
                <YAxis type="category" dataKey="label" tick={{ fill: '#8a94a6', fontSize: 10 }} width={72} stroke="rgba(255,255,255,0.1)" />
                <Tooltip contentStyle={{ background: '#0D1121', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {(stats.rDistribution ?? []).map((d: any, i: number) => (
                    <Cell key={i} fill={d.label.includes('-') && !d.label.includes('to 1') ? '#ea3943' : i >= 3 ? '#16c784' : '#f5a623'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Breakdown tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BreakdownTable title="Performance by Instrument" rows={stats.bySymbol ?? []} keyField="symbol" />
        <BreakdownTable title="Performance by Confluence" rows={stats.byPattern ?? []} keyField="pattern" />
      </div>
    </div>
  );
}

function BreakdownTable({ title, rows, keyField }: { title: string; rows: any[]; keyField: string }) {
  return (
    <div className="bg-[#1A1F35]/60 backdrop-blur border border-white/5 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-white/5"><h3 className="text-sm font-display font-semibold text-white">{title}</h3></div>
      <div className="overflow-auto max-h-72">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[#0D1121] text-gray-500 text-left">
            <tr><th className="px-4 py-2.5 font-medium">Name</th><th className="px-4 py-2.5 font-medium">Trades</th><th className="px-4 py-2.5 font-medium">Win %</th><th className="px-4 py-2.5 font-medium text-right">P&L</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">No data yet</td></tr>}
            {rows.map((r: any) => (
              <tr key={r[keyField]} className="border-t border-white/5">
                <td className="px-4 py-2.5 text-white">{String(r[keyField]).replace(/_/g, ' ').replace('=F', '')}</td>
                <td className="px-4 py-2.5 text-gray-400 font-mono">{r.trades}</td>
                <td className="px-4 py-2.5 text-blue-400 font-mono">{fmt(r.winRate, 0)}%</td>
                <td className={`px-4 py-2.5 text-right font-mono ${r.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{r.pnl >= 0 ? '+' : ''}{money(r.pnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Open trades ---------------- */
function OpenTrades({ trades, onClose, onDelete }: { trades: any[]; onClose: (id: string, px: number) => void; onDelete: (id: string) => void }) {
  const [closing, setClosing] = useState<string | null>(null);
  const [px, setPx] = useState('');
  if (trades.length === 0) return <EmptyState label="No open trades" hint="Track an AI setup or add a manual trade to open a position." />;
  return (
    <div className="bg-[#1A1F35]/60 backdrop-blur border border-white/5 rounded-xl overflow-hidden">
      <div className="overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-[#0D1121] text-gray-500 text-left">
            <tr>
              {['Symbol', 'Dir', 'Source', 'Entry', 'Stop', 'Target', 'Size', 'R:R', 'Score', 'Opened', ''].map((h) => (
                <th key={h} className="px-4 py-2.5 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                <td className="px-4 py-3 text-white font-mono font-semibold">{t.symbol.replace('=F', '')}</td>
                <td className="px-4 py-3"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${t.direction === 'LONG' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{t.direction}</span></td>
                <td className="px-4 py-3"><span className={`text-[10px] ${t.source === 'ONE_CLICK' ? 'text-amber-400' : 'text-gray-400'}`}>{t.source === 'ONE_CLICK' ? '⚡ 1-Click' : 'Manual'}</span></td>
                <td className="px-4 py-3 text-white font-mono">{fmt(t.entryPrice)}</td>
                <td className="px-4 py-3 text-red-400/80 font-mono">{fmt(t.stopLoss)}</td>
                <td className="px-4 py-3 text-green-400/80 font-mono">{fmt(t.takeProfit)}</td>
                <td className="px-4 py-3 text-gray-300 font-mono">{fmt(t.positionSize, 0)}</td>
                <td className="px-4 py-3 text-blue-400 font-mono">{fmt(t.riskReward, 1)}</td>
                <td className="px-4 py-3 text-gray-400 font-mono">{t.aiScore ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(t.openedAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {closing === t.id ? (
                    <div className="flex items-center gap-1 justify-end">
                      <input autoFocus value={px} onChange={(e) => setPx(e.target.value)} placeholder="exit px"
                        className="w-20 bg-[#0D1121] border border-white/10 rounded px-2 py-1 text-xs text-white font-mono outline-none focus:border-blue-500/50" />
                      <button onClick={() => { const v = parseFloat(px); if (!isNaN(v)) { onClose(t.id, v); setClosing(null); setPx(''); } }}
                        className="text-green-400 hover:text-green-300 text-xs px-2">Close</button>
                      <button onClick={() => { setClosing(null); setPx(''); }} className="text-gray-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => { setClosing(t.id); setPx(String(t.entryPrice)); }} className="text-blue-400 hover:text-blue-300 text-xs">Close</button>
                      <button onClick={() => onDelete(t.id)} className="text-gray-600 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- History ---------------- */
function TradeHistory({ trades, onDelete }: { trades: any[]; onDelete: (id: string) => void }) {
  if (trades.length === 0) return <EmptyState label="No closed trades yet" hint="Closed trades and their outcomes will appear here." />;
  return (
    <div className="bg-[#1A1F35]/60 backdrop-blur border border-white/5 rounded-xl overflow-hidden">
      <div className="overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-[#0D1121] text-gray-500 text-left">
            <tr>
              {['Symbol', 'Dir', 'Entry', 'Exit', 'Size', 'Result', 'R', 'P&L', 'Closed', ''].map((h) => (
                <th key={h} className="px-4 py-2.5 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => {
              const win = (t.pnl ?? 0) > 0;
              return (
                <tr key={t.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-white font-mono font-semibold">{t.symbol.replace('=F', '')}</td>
                  <td className="px-4 py-3"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${t.direction === 'LONG' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{t.direction}</span></td>
                  <td className="px-4 py-3 text-white font-mono">{fmt(t.entryPrice)}</td>
                  <td className="px-4 py-3 text-gray-300 font-mono">{t.exitPrice == null ? '—' : fmt(t.exitPrice)}</td>
                  <td className="px-4 py-3 text-gray-300 font-mono">{fmt(t.positionSize, 0)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      t.status === 'WIN' ? 'bg-green-500/10 text-green-400' : t.status === 'LOSS' ? 'bg-red-500/10 text-red-400' : 'bg-gray-500/10 text-gray-400'
                    }`}>{t.status === 'CLOSED_MANUAL' ? 'MANUAL' : t.status}</span>
                  </td>
                  <td className={`px-4 py-3 font-mono ${(t.rMultiple ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{t.rMultiple == null ? '—' : `${t.rMultiple >= 0 ? '+' : ''}${fmt(t.rMultiple, 2)}`}</td>
                  <td className={`px-4 py-3 font-mono font-semibold ${win ? 'text-green-400' : 'text-red-400'}`}>{t.pnl == null ? '—' : `${win ? '+' : ''}${money(t.pnl)}`}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{t.closedAt ? new Date(t.closedAt).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3 text-right"><button onClick={() => onDelete(t.id)} className="text-gray-600 hover:text-red-400"><X className="w-3.5 h-3.5" /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Manual trade modal ---------------- */
function ManualTradeModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [symbol, setSymbol] = useState('ES=F');
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [entryPrice, setEntry] = useState('');
  const [stopLoss, setStop] = useState('');
  const [takeProfit, setTarget] = useState('');
  const [positionSize, setSize] = useState('1');
  const [timeframe, setTimeframe] = useState('15m');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const meta = getInstrumentMeta(symbol);
  const e = parseFloat(entryPrice), sl = parseFloat(stopLoss), tp = parseFloat(takeProfit);
  const rr = !isNaN(e) && !isNaN(sl) && !isNaN(tp) && Math.abs(e - sl) > 0
    ? Math.round((Math.abs(tp - e) / Math.abs(e - sl)) * 100) / 100 : null;
  const risk$ = !isNaN(e) && !isNaN(sl) && meta ? Math.abs(e - sl) * meta.pointValue * (parseFloat(positionSize) || 1) : null;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/demo/trades', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol, direction, entryPrice: e, stopLoss: sl, takeProfit: tp,
          positionSize: parseFloat(positionSize) || 1, timeframe, source: 'MANUAL', notes: notes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || 'Could not create trade'); return; }
      toast.success('Manual trade opened'); onSaved();
    } catch { toast.error('Request failed'); }
    finally { setSaving(false); }
  };

  return (
    <Modal title="New Manual Demo Trade" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Instrument">
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="modal-input">
              {INSTRUMENTS.map((i) => <option key={i.symbol} value={i.symbol}>{i.symbol.replace('=F', '')} — {i.name}</option>)}
            </select>
          </Field>
          <Field label="Direction">
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => setDirection('LONG')} className={`py-2.5 rounded-lg text-xs font-semibold transition-all ${direction === 'LONG' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-[#0D1121] text-gray-400 border border-white/5'}`}>LONG</button>
              <button onClick={() => setDirection('SHORT')} className={`py-2.5 rounded-lg text-xs font-semibold transition-all ${direction === 'SHORT' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-[#0D1121] text-gray-400 border border-white/5'}`}>SHORT</button>
            </div>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Entry"><input value={entryPrice} onChange={(e) => setEntry(e.target.value)} type="number" className="modal-input font-mono" placeholder="0.00" /></Field>
          <Field label="Stop Loss"><input value={stopLoss} onChange={(e) => setStop(e.target.value)} type="number" className="modal-input font-mono" placeholder="0.00" /></Field>
          <Field label="Take Profit"><input value={takeProfit} onChange={(e) => setTarget(e.target.value)} type="number" className="modal-input font-mono" placeholder="0.00" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Position size (contracts)"><input value={positionSize} onChange={(e) => setSize(e.target.value)} type="number" min="1" className="modal-input font-mono" /></Field>
          <Field label="Timeframe">
            <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="modal-input">
              {['1m', '5m', '15m', '1h', '4h', '1d'].map((tf) => <option key={tf} value={tf}>{tf}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Notes (optional)"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="modal-input resize-none" placeholder="Setup rationale, session, etc." /></Field>

        {(rr != null || risk$ != null) && (
          <div className="flex items-center gap-4 bg-[#0D1121] border border-white/5 rounded-lg px-4 py-3 text-xs">
            {rr != null && <div><span className="text-gray-500">R:R </span><span className="text-blue-400 font-mono font-semibold">{fmt(rr, 2)}</span></div>}
            {risk$ != null && <div><span className="text-gray-500">Risk </span><span className="text-red-400 font-mono font-semibold">{money(risk$)}</span></div>}
            <div className="text-gray-600">· point value {money(meta?.pointValue)}</div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white">Cancel</button>
          <button onClick={save} disabled={saving || isNaN(e) || isNaN(sl) || isNaN(tp)}
            className="inline-flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Open Trade
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Account settings modal ---------------- */
function AccountModal({ account, onClose, onSaved }: { account: any; onClose: () => void; onSaved: () => void }) {
  const [balance, setBalance] = useState(String(account?.account?.startingBalance ?? 100000));
  const [saving, setSaving] = useState(false);

  const patch = async (body: any) => {
    setSaving(true);
    try {
      const res = await fetch('/api/demo/account', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { toast.error((await res.json()).error || 'Update failed'); return; }
      toast.success('Account updated'); onSaved();
    } catch { toast.error('Request failed'); }
    finally { setSaving(false); }
  };

  return (
    <Modal title="Demo Account Settings" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Starting balance ($)">
          <input value={balance} onChange={(e) => setBalance(e.target.value)} type="number" className="modal-input font-mono" />
          <p className="text-[11px] text-gray-500 mt-1">Editing the starting balance recomputes your current balance as starting + realized P&L.</p>
        </Field>
        <div className="flex flex-col gap-2 pt-2">
          <button onClick={() => patch({ startingBalance: parseFloat(balance) })} disabled={saving}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg">Save Starting Balance</button>
          <button onClick={() => { if (confirm('Reset the demo account? This deletes ALL demo trades and restores the balance.')) patch({ reset: true, startingBalance: parseFloat(balance) }); }}
            disabled={saving} className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-sm font-semibold py-2.5 rounded-lg">Reset Account (delete all trades)</button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Shared primitives ---------------- */
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-[#12172a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h3 className="text-sm font-display font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </motion.div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-gray-400 mb-1.5 block">{label}</label>{children}</div>;
}

function EmptyState({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="bg-[#1A1F35]/40 border border-dashed border-white/10 rounded-xl min-h-[240px] flex flex-col items-center justify-center text-center p-8">
      <Award className="w-12 h-12 text-gray-700 mb-3" />
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-xs text-gray-600 mt-1">{hint}</p>
    </div>
  );
}

function StatCard({ label, value, sub, accent, icon: Icon, loading }: any) {
  const colors: Record<string, string> = { green: 'text-green-400', red: 'text-red-400', blue: 'text-blue-400', purple: 'text-purple-400', amber: 'text-amber-400' };
  return (
    <div className={`bg-[#1A1F35]/60 backdrop-blur border border-white/5 rounded-xl p-4 ${loading ? 'animate-pulse' : ''}`}>
      <div className="flex items-center justify-between mb-2"><span className="text-[11px] text-gray-500">{label}</span><Icon className={`w-4 h-4 ${colors[accent]}`} /></div>
      <p className={`text-lg font-mono font-bold ${colors[accent]}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function MiniStat({ label, value, accent, icon: Icon }: any) {
  const colors: Record<string, string> = { green: 'text-green-400', red: 'text-red-400', blue: 'text-blue-400', purple: 'text-purple-400', amber: 'text-amber-400' };
  return (
    <div className="bg-[#1A1F35]/60 backdrop-blur border border-white/5 rounded-xl p-4">
      <div className="flex items-center gap-1.5 mb-1">{Icon && <Icon className={`w-3.5 h-3.5 ${colors[accent]}`} />}<span className="text-[11px] text-gray-500">{label}</span></div>
      <p className={`text-base font-mono font-bold ${colors[accent]}`}>{value}</p>
    </div>
  );
}
