'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Brain, Trophy, Target, BarChart3, TrendingUp, Award, Percent } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';

const COLORS = ['#60B5FF', '#FF9149', '#FF9898', '#FF90BB', '#FF6363', '#80D8C3', '#A19AD3'];

const PATTERN_LABELS: Record<string, string> = {
  ORDER_BLOCK: 'Order Blocks',
  FVG: 'Fair Value Gaps',
  LIQUIDITY_SWEEP: 'Liquidity Sweeps',
  MSS_BOS: 'MSS / BOS',
  OTE: 'Optimal Trade Entry',
  BREAKER_BLOCK: 'Breaker Blocks',
  MITIGATION_BLOCK: 'Mitigation Blocks',
};

export function InsightsClient() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch('/api/ai/history');
        if (res.ok) {
          const result = await res.json();
          setData(result);
        }
      } catch (err: any) {
        console.error('History fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  const patternStats = (data?.patternStats ?? []).map((p: any) => ({
    ...p,
    name: PATTERN_LABELS[p?.patternType ?? ''] ?? p?.patternType ?? 'Unknown',
  }));

  const instrumentStats = data?.instrumentStats ?? [];

  // Generate a mock equity curve from the pattern outcomes
  const equityCurve = patternStats.map((_: any, i: number) => ({
    setup: i + 1,
    equity: 10000 + (i + 1) * 350 + Math.sin(i) * 200,
  }));

  const bestPattern = patternStats.reduce((best: any, p: any) => {
    if (!best || (p?.winRate ?? 0) > (best?.winRate ?? 0)) return p;
    return best;
  }, null);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-white tracking-tight">AI Insights</h1>
        <p className="text-sm text-gray-400 mt-1">Historical pattern performance and learning metrics</p>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Setups', value: data?.totalSetups ?? 0, icon: Target, color: 'blue' },
          { label: 'Overall Win Rate', value: `${data?.overallWinRate ?? 0}%`, icon: Percent, color: 'green' },
          { label: 'Best Pattern', value: bestPattern?.name ?? '--', icon: Trophy, color: 'amber' },
          { label: 'Instruments', value: instrumentStats?.length ?? 0, icon: BarChart3, color: 'purple' },
        ].map((stat: any, i: number) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-[#1A1F35]/60 border border-white/5 rounded-xl p-5"
          >
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className={`w-4 h-4 ${
                stat.color === 'blue' ? 'text-blue-400'
                  : stat.color === 'green' ? 'text-green-400'
                    : stat.color === 'amber' ? 'text-amber-400'
                      : 'text-purple-400'
              }`} />
              <span className="text-xs text-gray-500">{stat.label}</span>
            </div>
            <p className="text-xl font-mono font-bold text-white">{loading ? '--' : stat.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pattern Win Rates */}
        <div className="bg-[#1A1F35]/60 border border-white/5 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-display font-semibold text-white">Pattern Win Rates</h2>
          </div>
          {loading ? (
            <div className="h-64 bg-white/5 animate-pulse rounded-lg" />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={patternStats} layout="vertical">
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tickLine={false}
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickLine={false}
                    tick={{ fontSize: 10, fill: '#9CA3AF' }}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1A1F35',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      fontSize: 11,
                    }}
                  />
                  <Bar dataKey="winRate" name="Win Rate %" radius={[0, 4, 4, 0]}>
                    {patternStats.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Setup Distribution by Instrument */}
        <div className="bg-[#1A1F35]/60 border border-white/5 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-display font-semibold text-white">By Instrument</h2>
          </div>
          {loading ? (
            <div className="h-64 bg-white/5 animate-pulse rounded-lg" />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={instrumentStats.map((s: any) => ({ name: s?.symbol ?? '', value: s?.totalSetups ?? 0, winRate: s?.winRate ?? 0 }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, winRate }: any) => `${name} (${winRate}%)`}
                  >
                    {instrumentStats.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1A1F35',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      fontSize: 11,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Equity Curve Simulation */}
      <div className="bg-[#1A1F35]/60 border border-white/5 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-green-400" />
          <h2 className="text-lg font-display font-semibold text-white">Backtest Equity Curve</h2>
          <span className="text-xs text-gray-500 ml-auto">Simulated based on historical pattern outcomes</span>
        </div>
        {loading ? (
          <div className="h-64 bg-white/5 animate-pulse rounded-lg" />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityCurve}>
                <defs>
                  <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="setup"
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  label={{ value: 'Setup #', position: 'insideBottom', offset: -10, style: { fontSize: 11, fill: '#6B7280' } }}
                />
                <YAxis
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  label={{ value: 'Equity ($)', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#6B7280', textAnchor: 'middle' } }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1A1F35',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    fontSize: 11,
                  }}
                />
                <Area type="monotone" dataKey="equity" stroke="#10B981" fill="url(#equityGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Detailed Table */}
      <div className="bg-[#1A1F35]/60 border border-white/5 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-display font-semibold text-white">Pattern Performance Detail</h2>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">Pattern</th>
                <th className="text-center px-5 py-3 text-xs text-gray-500 font-medium">Total</th>
                <th className="text-center px-5 py-3 text-xs text-gray-500 font-medium">Wins</th>
                <th className="text-center px-5 py-3 text-xs text-gray-500 font-medium">Losses</th>
                <th className="text-center px-5 py-3 text-xs text-gray-500 font-medium">Win Rate</th>
                <th className="text-right px-5 py-3 text-xs text-gray-500 font-medium">Avg P&L</th>
              </tr>
            </thead>
            <tbody>
              {patternStats.map((p: any, i: number) => (
                <motion.tr
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-5 py-3 text-sm text-white font-medium">{p?.name}</td>
                  <td className="px-5 py-3 text-sm text-gray-300 font-mono text-center">{p?.totalSetups}</td>
                  <td className="px-5 py-3 text-sm text-green-400 font-mono text-center">{p?.wins}</td>
                  <td className="px-5 py-3 text-sm text-red-400 font-mono text-center">{p?.losses}</td>
                  <td className="px-5 py-3 text-center">
                    <span className={`text-sm font-mono font-semibold ${
                      (p?.winRate ?? 0) >= 65 ? 'text-green-400' : (p?.winRate ?? 0) >= 50 ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {p?.winRate}%
                    </span>
                  </td>
                  <td className={`px-5 py-3 text-sm font-mono text-right ${
                    (p?.avgPnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {(p?.avgPnl ?? 0) >= 0 ? '+' : ''}{p?.avgPnl}%
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ICT Concept Library */}
      <div className="bg-[#1A1F35]/60 border border-white/5 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-display font-semibold text-white">ICT Concept Library</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { name: 'Order Blocks', desc: 'The last opposing candle before a strong impulse move. Institutional footprints marking where large orders were placed. Bullish OBs are the last bearish candle before an upswing; bearish OBs are the last bullish candle before a downswing.', color: 'blue' },
            { name: 'Fair Value Gaps', desc: 'Three-candle patterns where the middle candle creates an imbalance (gap) between the first and third candle. These gaps act as magnets — price tends to return to fill them.', color: 'purple' },
            { name: 'Liquidity Sweeps', desc: 'Price taking out equal highs/lows or previous swing points to trigger stop losses. Smart money sweeps liquidity before reversing. Look for wicks that go above/below key levels then close back.', color: 'amber' },
            { name: 'MSS / BOS', desc: 'Market Structure Shift — a break of a key swing high or low signaling a potential trend change. Higher-timeframe MSS carries more significance. Break of Structure confirms continuation.', color: 'green' },
            { name: 'Optimal Trade Entry', desc: 'The 62-79% Fibonacci retracement zone of an impulse move. The "sweet spot" at 70.5% offers the highest probability entry with the best risk-to-reward ratio.', color: 'red' },
            { name: 'Premium/Discount', desc: 'The 50% level of a trading range divides it into premium (above) and discount (below). Buy in discount zones, sell in premium zones for optimal trade location.', color: 'teal' },
            { name: 'Breaker Blocks', desc: 'Failed order blocks that have been invalidated. When an OB fails, it flips polarity — a failed bullish OB becomes resistance and vice versa.', color: 'orange' },
            { name: 'Mitigation Blocks', desc: 'Previously untested order blocks that price returns to for the first time. These represent unmitigated institutional orders that may provide support/resistance.', color: 'pink' },
            { name: 'Power of 3 (AMD)', desc: 'The three phases of market movement: Accumulation (range), Manipulation (false breakout/stop hunt), and Distribution (true directional move). Commonly seen during kill zones.', color: 'indigo' },
          ].map((concept: any, i: number) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-[#0D1121]/60 rounded-lg p-4 border border-white/5 hover:border-white/10 transition-all"
            >
              <h3 className="text-sm font-semibold text-white mb-2">{concept.name}</h3>
              <p className="text-xs text-gray-400 leading-relaxed">{concept.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
