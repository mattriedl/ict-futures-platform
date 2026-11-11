'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings, Bell, Clock, Palette, Save, CheckCircle, Shield, Gauge } from 'lucide-react';
import { toast } from 'sonner';
import { INSTRUMENTS, INSTRUMENT_CATEGORIES } from '@/lib/instruments';

export function SettingsClient() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          setSettings(data?.settings ?? {});
        }
      } catch (err: any) {
        console.error('Settings fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.settings) setSettings(json.settings);
        toast.success('Settings saved successfully');
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? 'Failed to save settings');
      }
    } catch (err: any) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-48 bg-white/5 animate-pulse rounded-lg" />
        <div className="h-64 bg-white/5 animate-pulse rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-display font-bold text-white tracking-tight">Settings</h1>
        <p className="text-sm text-gray-400 mt-1">Configure your trading platform preferences</p>
      </div>

      {/* Refresh Interval */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#1A1F35]/60 border border-white/5 rounded-xl p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-display font-semibold text-white">Data Refresh</h2>
        </div>
        <div className="space-y-3">
          <label className="text-sm text-gray-400">Refresh Interval</label>
          <div className="flex gap-2">
            {[{ val: 60, label: '1 min' }, { val: 300, label: '5 min' }, { val: 900, label: '15 min' }].map((opt: any) => (
              <button
                key={opt.val}
                onClick={() => setSettings((prev: any) => ({ ...(prev ?? {}), refreshInterval: opt.val }))}
                className={`px-4 py-2 rounded-lg text-sm transition-all ${
                  (settings?.refreshInterval ?? 60) === opt.val
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-white/5 text-gray-400 border border-white/5 hover:border-white/10'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Notifications */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-[#1A1F35]/60 border border-white/5 rounded-xl p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-display font-semibold text-white">Notifications</h2>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="text-sm text-gray-300">Generate setup alerts</span>
              <p className="text-xs text-gray-500 mt-0.5">Checked on each scheduled cycle for your tracked instruments.</p>
            </div>
            <button
              onClick={() => setSettings((prev: any) => ({ ...(prev ?? {}), notificationsOn: !(prev?.notificationsOn ?? true) }))}
              className={`relative w-11 h-6 shrink-0 rounded-full transition-colors ${
                settings?.notificationsOn ? 'bg-blue-500' : 'bg-gray-600'
              }`}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                settings?.notificationsOn ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="text-sm text-gray-300">Email me new alerts</span>
              <p className="text-xs text-gray-500 mt-0.5">Requires the server&apos;s Gmail settings and the admin email switch.</p>
            </div>
            <button
              onClick={() => setSettings((prev: any) => ({ ...(prev ?? {}), emailAlertsEnabled: !(prev?.emailAlertsEnabled ?? false) }))}
              className={`relative w-11 h-6 shrink-0 rounded-full transition-colors ${
                settings?.emailAlertsEnabled ? 'bg-blue-500' : 'bg-gray-600'
              }`}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                settings?.emailAlertsEnabled ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>

          {settings?.emailAlertsEnabled && (
            <div>
              <label className="text-sm text-gray-400 mb-2 block">Send alerts to (blank = your login email)</label>
              <input
                type="email"
                value={settings?.alertEmail ?? ''}
                onChange={(e) => setSettings((prev: any) => ({ ...(prev ?? {}), alertEmail: e.target.value }))}
                placeholder="you@example.com"
                className="w-full bg-[#0A0E1A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
              />
            </div>
          )}

          <div>
            <label className="text-sm text-gray-400 mb-2 block">Minimum AI Score for Alerts</label>
            <input
              type="range"
              min={20}
              max={90}
              step={5}
              value={settings?.alertMinScore ?? 50}
              onChange={(e) => setSettings((prev: any) => ({ ...(prev ?? {}), alertMinScore: parseInt(e.target.value) }))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>20</span>
              <span className="text-blue-400 font-mono">{settings?.alertMinScore ?? 50}</span>
              <span>90</span>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-sm text-gray-400">Alert on Pattern Types</label>
            {[
              { key: 'alertOnOB', label: 'Order Blocks' },
              { key: 'alertOnFVG', label: 'Fair Value Gaps' },
              { key: 'alertOnLiqSweep', label: 'Liquidity Sweeps' },
              { key: 'alertOnMSS', label: 'Market Structure Shifts' },
              { key: 'alertOnOTE', label: 'Optimal Trade Entry' },
            ].map((item: any) => (
              <div key={item.key} className="flex items-center justify-between">
                <span className="text-sm text-gray-300">{item.label}</span>
                <button
                  onClick={() => setSettings((prev: any) => ({ ...(prev ?? {}), [item.key]: !(prev?.[item.key] ?? true) }))}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    (settings?.[item.key] ?? true) ? 'bg-blue-500' : 'bg-gray-600'
                  }`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                    (settings?.[item.key] ?? true) ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Tracked Instruments */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-[#1A1F35]/60 border border-white/5 rounded-xl p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-display font-semibold text-white">Tracked Instruments</h2>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Shown on the dashboard and scanned for alerts (up to 20).
        </p>
        <div className="space-y-4">
          {INSTRUMENT_CATEGORIES.map((cat) => (
            <div key={cat}>
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">{cat}</div>
              <div className="flex flex-wrap gap-2">
                {INSTRUMENTS.filter((i) => i.category === cat).map((inst) => {
                  const sym = inst.symbol;
                  const current = (settings?.trackedSymbols ?? '').split(',').filter(Boolean);
                  const tracked = current.includes(sym);
                  return (
                    <button
                      key={sym}
                      title={inst.name}
                      onClick={() => {
                        if (!tracked && current.length >= 20) {
                          toast.error('You can track up to 20 instruments.');
                          return;
                        }
                        const updated = tracked ? current.filter((s: string) => s !== sym) : [...current, sym];
                        setSettings((prev: any) => ({ ...(prev ?? {}), trackedSymbols: updated.join(',') }));
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                        tracked
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'bg-white/5 text-gray-500 border border-white/5 hover:border-white/10'
                      }`}
                    >
                      {sym.replace('=F', '').replace('=X', '')}
                      {tracked && <CheckCircle className="w-3 h-3 inline ml-1.5" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Prop-Firm Risk Controls */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-[#1A1F35]/60 border border-white/5 rounded-xl p-5"
      >
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-5 h-5 text-green-400" />
          <h2 className="text-lg font-display font-semibold text-white">Prop-Firm Risk Controls</h2>
        </div>
        <p className="text-xs text-gray-500 mb-5">
          Size positions by risk and cap losses like a funded/prop-firm account. Limits are measured on your demo account.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              key: 'riskPercent',
              label: 'Risk per trade (%)',
              def: 1, min: 0.1, max: 10, step: 0.1,
              hint: 'Account % risked per auto-sized trade (0.1–10)',
            },
            {
              key: 'maxDailyLossPercent',
              label: 'Max daily loss (%)',
              def: 4, min: 1, max: 20, step: 0.5,
              hint: 'Daily realized-loss cap since UTC midnight (1–20)',
            },
            {
              key: 'maxOverallDrawdownPercent',
              label: 'Max overall drawdown (%)',
              def: 6, min: 1, max: 50, step: 0.5,
              hint: 'Drawdown from your peak balance (1–50)',
            },
          ].map((f: any) => (
            <div key={f.key}>
              <label className="text-sm text-gray-400 mb-2 block">{f.label}</label>
              <input
                type="number"
                min={f.min}
                max={f.max}
                step={f.step}
                value={settings?.[f.key] ?? f.def}
                onChange={(e) => {
                  const raw = parseFloat(e.target.value);
                  setSettings((prev: any) => ({ ...(prev ?? {}), [f.key]: Number.isNaN(raw) ? f.def : raw }));
                }}
                onBlur={(e) => {
                  let v = parseFloat(e.target.value);
                  if (Number.isNaN(v)) v = f.def;
                  v = Math.min(f.max, Math.max(f.min, v));
                  setSettings((prev: any) => ({ ...(prev ?? {}), [f.key]: v }));
                }}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500/50"
              />
              <p className="text-[11px] text-gray-600 mt-1">{f.hint}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/5">
          <div>
            <span className="text-sm text-gray-300">Enforce drawdown limits</span>
            <p className="text-[11px] text-gray-600 mt-0.5">Block new trades when the daily-loss or overall-drawdown limit is breached.</p>
          </div>
          <button
            onClick={() => setSettings((prev: any) => ({ ...(prev ?? {}), enforceDrawdown: !(prev?.enforceDrawdown ?? false) }))}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
              settings?.enforceDrawdown ? 'bg-green-500' : 'bg-gray-600'
            }`}
          >
            <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
              settings?.enforceDrawdown ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        </div>
      </motion.div>

      {/* Leverage */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="bg-[#1A1F35]/60 border border-white/5 rounded-xl p-5"
      >
        <div className="flex items-center gap-2 mb-1">
          <Gauge className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-display font-semibold text-white">Leverage</h2>
        </div>
        <p className="text-xs text-gray-500 mb-5">
          Per-asset-class leverage used to reserve margin when a demo trade opens. Higher leverage reserves less margin
          per position. Margin is reserved, not deducted — your available balance is your account balance minus the margin
          held by open trades.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              key: 'leverageCrypto',
              label: 'Crypto leverage (x)',
              def: 1, min: 1, max: 5, step: 1,
              hint: 'Applied to crypto symbols (1–5)',
            },
            {
              key: 'leverageForex',
              label: 'Forex leverage (x)',
              def: 30, min: 1, max: 100, step: 1,
              hint: 'Applied to FX pairs (1–100)',
            },
            {
              key: 'leverageFutures',
              label: 'Futures leverage (x)',
              def: 10, min: 1, max: 50, step: 1,
              hint: 'Applied to futures contracts (1–50)',
            },
          ].map((f: any) => (
            <div key={f.key}>
              <label className="text-sm text-gray-400 mb-2 block">{f.label}</label>
              <input
                type="number"
                min={f.min}
                max={f.max}
                step={f.step}
                value={settings?.[f.key] ?? f.def}
                onChange={(e) => {
                  const raw = parseFloat(e.target.value);
                  setSettings((prev: any) => ({ ...(prev ?? {}), [f.key]: Number.isNaN(raw) ? f.def : raw }));
                }}
                onBlur={(e) => {
                  let v = parseFloat(e.target.value);
                  if (Number.isNaN(v)) v = f.def;
                  v = Math.min(f.max, Math.max(f.min, v));
                  setSettings((prev: any) => ({ ...(prev ?? {}), [f.key]: v }));
                }}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500/50"
              />
              <p className="text-[11px] text-gray-600 mt-1">{f.hint}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Automated Trading */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-[#1A1F35]/60 border border-white/5 rounded-xl p-5"
      >
        <div className="flex items-center gap-2 mb-1">
          <Gauge className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-display font-semibold text-white">Automated Trading</h2>
        </div>
        <p className="text-xs text-gray-500 mb-5">
          When enabled, the app scans every active instrument every 5 minutes. For a setup scoring at or above the threshold below, it opens a demo trade at the live price, but only while the setup is still tradeable (price between entry and target, at least 1:1 reward left), so setups that already played out are skipped. Trades use your risk-per-trade setting and available balance.
        </p>

        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-sm text-white">Enable automated trading</div>
            <div className="text-[11px] text-gray-600">Runs every 5 minutes; opens trades at the live price.</div>
          </div>
          <button
            type="button"
            onClick={() => setSettings((prev: any) => ({ ...(prev ?? {}), autoTradeEnabled: !(prev?.autoTradeEnabled ?? false) }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings?.autoTradeEnabled ? 'bg-emerald-500' : 'bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings?.autoTradeEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="max-w-xs">
          <label className="text-sm text-gray-400 mb-2 block">Minimum score to auto-trade (0–100)</label>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={settings?.autoTradeMinScore ?? 70}
            onChange={(e) => {
              const raw = parseFloat(e.target.value);
              setSettings((prev: any) => ({ ...(prev ?? {}), autoTradeMinScore: Number.isNaN(raw) ? 75 : raw }));
            }}
            onBlur={(e) => {
              let v = parseFloat(e.target.value);
              if (Number.isNaN(v)) v = 75;
              v = Math.min(100, Math.max(0, v));
              setSettings((prev: any) => ({ ...(prev ?? {}), autoTradeMinScore: v }));
            }}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-emerald-500/50"
          />
          <p className="text-[11px] text-gray-600 mt-1">Only setups scoring at or above this value are traded (default 70; see the backtest notes in the docs).</p>
        </div>
      </motion.div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-medium transition-all shadow-lg shadow-blue-500/20"
      >
        <Save className="w-5 h-5" />
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
}
