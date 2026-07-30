'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, BellOff, Check, X, Eye, Filter,
  TrendingUp, TrendingDown, Clock, Zap, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';

export function AlertsClient() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'dismissed'>('all');
  const [selectedAlert, setSelectedAlert] = useState<any>(null);

  const fetchAlerts = async () => {
    try {
      const res = await fetch('/api/alerts');
      if (res.ok) {
        const data = await res.json();
        setAlerts(data?.alerts ?? []);
      }
    } catch (err: any) {
      console.error('Alerts fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, []);

  const updateAlert = async (id: string, updates: any) => {
    try {
      const res = await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
      if (res.ok) {
        toast.success('Alert updated');
        fetchAlerts();
      }
    } catch (err: any) {
      toast.error('Failed to update alert');
    }
  };

  const filteredAlerts = alerts.filter((a: any) => {
    if (filter === 'active') return a?.status === 'ACTIVE';
    if (filter === 'dismissed') return a?.status === 'DISMISSED';
    return true;
  });

  const activeCount = alerts.filter((a: any) => a?.status === 'ACTIVE')?.length ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-white tracking-tight">Alerts</h1>
          <p className="text-sm text-gray-400 mt-1">Trade setup notifications and alert history</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#1A1F35] rounded-lg p-0.5 border border-white/5">
            {(['all', 'active', 'dismissed'] as const).map((f: string) => (
              <button
                key={f}
                onClick={() => setFilter(f as any)}
                className={`px-3 py-1.5 text-xs rounded-md transition-all capitalize ${
                  filter === f ? 'bg-blue-500/20 text-blue-400' : 'text-gray-400 hover:text-white'
                }`}
              >
                {f} {f === 'active' && activeCount > 0 ? `(${activeCount})` : ''}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Alert List */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_: any, i: number) => (
            <div key={i} className="h-20 bg-[#1A1F35]/60 animate-pulse rounded-xl" />
          ))
        ) : filteredAlerts.length === 0 ? (
          <div className="bg-[#1A1F35]/60 border border-white/5 rounded-xl p-12 text-center">
            <BellOff className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No alerts to display</p>
            <p className="text-gray-600 text-xs mt-1">
              Alerts are generated automatically when high-confidence ICT setups are detected
            </p>
          </div>
        ) : (
          <AnimatePresence>
            {filteredAlerts.map((alert: any, idx: number) => (
              <motion.div
                key={alert?.id ?? idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: idx * 0.05 }}
                className={`bg-[#1A1F35]/60 border rounded-xl p-4 transition-all ${
                  alert?.status === 'ACTIVE'
                    ? 'border-blue-500/20 hover:border-blue-500/30'
                    : 'border-white/5 hover:border-white/10 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg mt-0.5 ${
                      alert?.type === 'SETUP' ? 'bg-amber-500/10' : 'bg-blue-500/10'
                    }`}>
                      {alert?.type === 'SETUP'
                        ? <Zap className="w-4 h-4 text-amber-400" />
                        : <Bell className="w-4 h-4 text-blue-400" />
                      }
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-white">{alert?.title ?? 'Alert'}</h3>
                        {alert?.aiScore && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                            (alert?.aiScore ?? 0) >= 70 ? 'bg-green-500/10 text-green-400'
                              : (alert?.aiScore ?? 0) >= 40 ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-red-500/10 text-red-400'
                          }`}>
                            Score: {alert?.aiScore}
                          </span>
                        )}
                        {alert?.instrument?.symbol && (
                          <span className="text-xs px-2 py-0.5 bg-white/5 text-gray-400 rounded-full font-mono">
                            {alert?.instrument?.symbol?.replace?.('=F', '')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 leading-relaxed">{alert?.message}</p>
                      <div className="flex items-center gap-1 mt-2">
                        <Clock className="w-3 h-3 text-gray-600" />
                        <span className="text-[10px] text-gray-600" suppressHydrationWarning>
                          {alert?.createdAt ? new Date(alert.createdAt).toLocaleString('en-US', { timeZone: 'America/New_York' }) : '--'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {alert?.status === 'ACTIVE' && (
                      <>
                        <button
                          onClick={() => updateAlert(alert?.id, { read: true })}
                          className="p-1.5 bg-white/5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                          title="Mark as read"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => updateAlert(alert?.id, { status: 'DISMISSED' })}
                          className="p-1.5 bg-white/5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-400/10 transition-all"
                          title="Dismiss"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    {alert?.status === 'DISMISSED' && (
                      <button
                        onClick={() => updateAlert(alert?.id, { status: 'ACTIVE' })}
                        className="p-1.5 bg-white/5 rounded-lg text-gray-400 hover:text-green-400 hover:bg-green-400/10 transition-all"
                        title="Reactivate"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
