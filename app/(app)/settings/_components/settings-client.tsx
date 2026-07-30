'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings, Bell, Clock, Palette, Save, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

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
        toast.success('Settings saved successfully');
      } else {
        toast.error('Failed to save settings');
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
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300">Enable Browser Notifications</span>
            <button
              onClick={() => setSettings((prev: any) => ({ ...(prev ?? {}), notificationsOn: !(prev?.notificationsOn ?? true) }))}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                settings?.notificationsOn ? 'bg-blue-500' : 'bg-gray-600'
              }`}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                settings?.notificationsOn ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>

          <div>
            <label className="text-sm text-gray-400 mb-2 block">Minimum AI Score for Alerts</label>
            <input
              type="range"
              min={20}
              max={90}
              step={5}
              value={settings?.alertMinScore ?? 60}
              onChange={(e) => setSettings((prev: any) => ({ ...(prev ?? {}), alertMinScore: parseInt(e.target.value) }))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>20</span>
              <span className="text-blue-400 font-mono">{settings?.alertMinScore ?? 60}</span>
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
        <div className="flex flex-wrap gap-2">
          {['ES=F', 'NQ=F', 'CL=F', 'GC=F'].map((sym: string) => {
            const tracked = (settings?.trackedSymbols ?? '').split(',').includes(sym);
            return (
              <button
                key={sym}
                onClick={() => {
                  const current = (settings?.trackedSymbols ?? '').split(',').filter(Boolean);
                  const updated = tracked
                    ? current.filter((s: string) => s !== sym)
                    : [...current, sym];
                  setSettings((prev: any) => ({ ...(prev ?? {}), trackedSymbols: updated.join(',') }));
                }}
                className={`px-4 py-2 rounded-lg text-sm font-mono transition-all ${
                  tracked
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-white/5 text-gray-500 border border-white/5 hover:border-white/10'
                }`}
              >
                {sym.replace('=F', '')}
                {tracked && <CheckCircle className="w-3.5 h-3.5 inline ml-2" />}
              </button>
            );
          })}
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
