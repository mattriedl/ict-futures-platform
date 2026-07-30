'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Shield, Users, Sliders, LineChart, Trash2, Plus, Loader2,
  ShieldCheck, ShieldOff, Save, X, Database, Bell, FlaskConical, Zap,
} from 'lucide-react';

type Tab = 'overview' | 'users' | 'instruments' | 'settings';
const money = (n: number) => `$${(n ?? 0).toLocaleString('en-US')}`;

export function AdminClient() {
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/10 border border-purple-500/20">
          <Shield className="w-6 h-6 text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-white tracking-tight">Admin Console</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage users, instruments, and platform settings</p>
        </div>
      </div>

      <div className="flex items-center gap-1 bg-[#1A1F35]/60 border border-white/5 rounded-lg p-1 w-fit">
        {([['overview', 'Overview', LineChart], ['users', 'Users', Users], ['instruments', 'Instruments', Database], ['settings', 'Settings', Sliders]] as const).map(([t, label, Icon]) => (
          <button key={t} onClick={() => setTab(t as Tab)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t ? 'bg-purple-500/20 text-purple-300' : 'text-gray-400 hover:text-white'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview />}
      {tab === 'users' && <UsersPanel />}
      {tab === 'instruments' && <InstrumentsPanel />}
      {tab === 'settings' && <SettingsPanel />}
    </div>
  );
}

/* ---------------- Overview ---------------- */
function Overview() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { fetch('/api/admin/stats').then((r) => r.json()).then(setData).catch(() => {}); }, []);
  const s = data?.stats;
  const cards = [
    { label: 'Total Users', value: s?.totalUsers, icon: Users, accent: 'blue' },
    { label: 'Admins', value: s?.totalAdmins, icon: ShieldCheck, accent: 'purple' },
    { label: 'Instruments', value: `${s?.activeInstruments ?? 0}/${s?.totalInstruments ?? 0}`, icon: Database, accent: 'green' },
    { label: 'Demo Trades', value: s?.totalTrades, icon: LineChart, accent: 'amber' },
    { label: 'Open Trades', value: s?.openTrades, icon: Zap, accent: 'amber' },
    { label: 'Alerts', value: s?.totalAlerts, icon: Bell, accent: 'blue' },
    { label: 'Backtests', value: s?.totalBacktests, icon: FlaskConical, accent: 'purple' },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {cards.map((c) => {
          const colors: Record<string, string> = { blue: 'text-blue-400', purple: 'text-purple-400', green: 'text-green-400', amber: 'text-amber-400' };
          return (
            <div key={c.label} className="bg-[#1A1F35]/60 backdrop-blur border border-white/5 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2"><span className="text-[11px] text-gray-500">{c.label}</span><c.icon className={`w-4 h-4 ${colors[c.accent]}`} /></div>
              <p className={`text-2xl font-mono font-bold ${colors[c.accent]}`}>{c.value ?? '—'}</p>
            </div>
          );
        })}
      </div>
      <div className="bg-[#1A1F35]/60 backdrop-blur border border-white/5 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/5"><h3 className="text-sm font-display font-semibold text-white">Recent Signups</h3></div>
        <table className="w-full text-xs">
          <thead className="bg-[#0D1121] text-gray-500 text-left"><tr><th className="px-4 py-2.5 font-medium">Name</th><th className="px-4 py-2.5 font-medium">Email</th><th className="px-4 py-2.5 font-medium">Role</th><th className="px-4 py-2.5 font-medium">Joined</th></tr></thead>
          <tbody>
            {(data?.recentUsers ?? []).map((u: any) => (
              <tr key={u.id} className="border-t border-white/5">
                <td className="px-4 py-2.5 text-white">{u.name || '—'}</td>
                <td className="px-4 py-2.5 text-gray-400">{u.email}</td>
                <td className="px-4 py-2.5"><RoleBadge role={u.role} /></td>
                <td className="px-4 py-2.5 text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Users ---------------- */
function UsersPanel() {
  const [users, setUsers] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => { fetch('/api/admin/users').then((r) => r.json()).then((d) => setUsers(d.users ?? [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const setRole = async (id: string, role: string) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
      if (!res.ok) { toast.error((await res.json()).error || 'Failed'); return; }
      toast.success('Role updated'); load();
    } catch { toast.error('Failed'); } finally { setBusy(null); }
  };
  const del = async (id: string) => {
    if (!confirm('Delete this user and all their data? This cannot be undone.')) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      if (!res.ok) { toast.error((await res.json()).error || 'Failed'); return; }
      toast.success('User deleted'); load();
    } catch { toast.error('Failed'); } finally { setBusy(null); }
  };

  return (
    <div className="bg-[#1A1F35]/60 backdrop-blur border border-white/5 rounded-xl overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-[#0D1121] text-gray-500 text-left"><tr>
          <th className="px-4 py-2.5 font-medium">Name</th><th className="px-4 py-2.5 font-medium">Email</th>
          <th className="px-4 py-2.5 font-medium">Role</th><th className="px-4 py-2.5 font-medium">Activity</th>
          <th className="px-4 py-2.5 font-medium text-right">Actions</th>
        </tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-white/5 hover:bg-white/[0.02]">
              <td className="px-4 py-3 text-white">{u.name || '—'}</td>
              <td className="px-4 py-3 text-gray-400">{u.email}</td>
              <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
              <td className="px-4 py-3 text-gray-500">{u._count?.demoTrades ?? 0} trades · {u._count?.alerts ?? 0} alerts</td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center gap-2 justify-end">
                  {u.role === 'ADMIN' ? (
                    <button onClick={() => setRole(u.id, 'USER')} disabled={busy === u.id} className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 disabled:opacity-50"><ShieldOff className="w-3.5 h-3.5" /> Demote</button>
                  ) : (
                    <button onClick={() => setRole(u.id, 'ADMIN')} disabled={busy === u.id} className="inline-flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 disabled:opacity-50"><ShieldCheck className="w-3.5 h-3.5" /> Make Admin</button>
                  )}
                  <button onClick={() => del(u.id)} disabled={busy === u.id} className="text-gray-600 hover:text-red-400 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Instruments ---------------- */
function InstrumentsPanel() {
  const [items, setItems] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ symbol: '', name: '', exchange: 'CME', tickSize: '0.25', pointValue: '50' });
  const load = useCallback(() => { fetch('/api/admin/instruments').then((r) => r.json()).then((d) => setItems(d.instruments ?? [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (id: string, active: boolean) => {
    await fetch('/api/admin/instruments', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, active }) });
    load();
  };
  const del = async (id: string) => {
    if (!confirm('Delete this instrument?')) return;
    await fetch(`/api/admin/instruments?id=${id}`, { method: 'DELETE' });
    toast.success('Instrument deleted'); load();
  };
  const add = async () => {
    const res = await fetch('/api/admin/instruments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: form.symbol, name: form.name, exchange: form.exchange, tickSize: parseFloat(form.tickSize), pointValue: parseFloat(form.pointValue) }),
    });
    if (!res.ok) { toast.error((await res.json()).error || 'Failed'); return; }
    toast.success('Instrument added'); setAdding(false);
    setForm({ symbol: '', name: '', exchange: 'CME', tickSize: '0.25', pointValue: '50' }); load();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 text-sm px-3 py-2 rounded-lg">
          {adding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {adding ? 'Cancel' : 'Add Instrument'}
        </button>
      </div>
      {adding && (
        <div className="bg-[#1A1F35]/60 border border-white/5 rounded-xl p-4 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div><label className="text-[11px] text-gray-400 block mb-1">Symbol</label><input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} placeholder="ES=F" className="modal-input font-mono" /></div>
          <div><label className="text-[11px] text-gray-400 block mb-1">Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="E-mini S&P" className="modal-input" /></div>
          <div><label className="text-[11px] text-gray-400 block mb-1">Exchange</label><input value={form.exchange} onChange={(e) => setForm({ ...form, exchange: e.target.value })} className="modal-input" /></div>
          <div><label className="text-[11px] text-gray-400 block mb-1">Tick Size</label><input value={form.tickSize} onChange={(e) => setForm({ ...form, tickSize: e.target.value })} type="number" className="modal-input font-mono" /></div>
          <div className="flex gap-2">
            <div className="flex-1"><label className="text-[11px] text-gray-400 block mb-1">Point Value</label><input value={form.pointValue} onChange={(e) => setForm({ ...form, pointValue: e.target.value })} type="number" className="modal-input font-mono" /></div>
            <button onClick={add} className="bg-blue-600 hover:bg-blue-500 text-white px-3 rounded-lg self-end h-[42px]"><Save className="w-4 h-4" /></button>
          </div>
        </div>
      )}
      <div className="bg-[#1A1F35]/60 backdrop-blur border border-white/5 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-[#0D1121] text-gray-500 text-left"><tr>
            <th className="px-4 py-2.5 font-medium">Symbol</th><th className="px-4 py-2.5 font-medium">Name</th><th className="px-4 py-2.5 font-medium">Exchange</th>
            <th className="px-4 py-2.5 font-medium">Tick</th><th className="px-4 py-2.5 font-medium">Point $</th><th className="px-4 py-2.5 font-medium">Status</th><th className="px-4 py-2.5 font-medium text-right">Actions</th>
          </tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                <td className="px-4 py-3 text-white font-mono font-semibold">{i.symbol}</td>
                <td className="px-4 py-3 text-gray-300">{i.name}</td>
                <td className="px-4 py-3 text-gray-500">{i.exchange}</td>
                <td className="px-4 py-3 text-gray-400 font-mono">{i.tickSize}</td>
                <td className="px-4 py-3 text-gray-400 font-mono">{money(i.pointValue)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => toggle(i.id, !i.active)} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${i.active ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-500'}`}>{i.active ? 'Active' : 'Inactive'}</button>
                </td>
                <td className="px-4 py-3 text-right"><button onClick={() => del(i.id)} className="text-gray-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Settings ---------------- */
function SettingsPanel() {
  const [settings, setSettings] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { fetch('/api/admin/settings').then((r) => r.json()).then((d) => setSettings(d.settings)).catch(() => {}); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      if (!res.ok) { toast.error('Save failed'); return; }
      setSettings((await res.json()).settings); toast.success('Settings saved');
    } catch { toast.error('Save failed'); } finally { setSaving(false); }
  };

  if (!settings) return <div className="h-48 bg-[#1A1F35]/40 rounded-xl animate-pulse" />;
  const toggles = [
    { key: 'registrationOpen', label: 'Allow new user registration', desc: 'When off, the signup page rejects new accounts.' },
    { key: 'backtestingEnabled', label: 'Enable backtesting', desc: 'Master switch for the backtesting engine.' },
    { key: 'oneClickTradingEnabled', label: 'Enable one-click trade tracking', desc: 'Allow users to track AI setups as demo trades.' },
    { key: 'emailAlertsEnabled', label: 'Enable email alerts (global)', desc: 'Global kill-switch for all alert emails.' },
  ];

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-[#1A1F35]/60 backdrop-blur border border-white/5 rounded-xl p-5 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="text-xs text-gray-400 block mb-1.5">Site name</label><input value={settings.siteName} onChange={(e) => setSettings({ ...settings, siteName: e.target.value })} className="modal-input" /></div>
          <div><label className="text-xs text-gray-400 block mb-1.5">Default demo starting balance ($)</label><input type="number" value={settings.defaultStartingBalance} onChange={(e) => setSettings({ ...settings, defaultStartingBalance: parseFloat(e.target.value) })} className="modal-input font-mono" /></div>
        </div>
        <div className="space-y-3 pt-2 border-t border-white/5">
          {toggles.map((t) => (
            <div key={t.key} className="flex items-center justify-between gap-4">
              <div><p className="text-sm text-white">{t.label}</p><p className="text-[11px] text-gray-500">{t.desc}</p></div>
              <button onClick={() => setSettings({ ...settings, [t.key]: !settings[t.key] })}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${settings[t.key] ? 'bg-blue-500' : 'bg-gray-600'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings[t.key] ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-2">
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-blue-500 hover:from-purple-500 hover:to-blue-400 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Settings
          </button>
        </div>
      </div>
      <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-4 text-xs text-amber-300/80">
        <p className="font-semibold text-amber-300 mb-1">Email delivery</p>
        Alert emails send from the configured Gmail account only when a Google <strong>App Password</strong> is set in the server environment (<code className="text-amber-200">GMAIL_APP_PASSWORD</code>). Until then, emails are skipped safely.
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${role === 'ADMIN' ? 'bg-purple-500/15 text-purple-300' : 'bg-gray-500/10 text-gray-400'}`}>{role}</span>;
}
