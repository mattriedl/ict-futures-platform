'use client';

import { useEffect, useState, useCallback } from 'react';
import { Droplets, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { formatPrice } from '@/lib/format';

type Confidence = 'GOOD' | 'PARTIAL' | 'HIGH_SLIPPAGE' | 'INSUFFICIENT';

interface LiquidityData {
  supported: boolean;
  exchange?: string;
  side?: 'BUY' | 'SELL';
  intendedSize?: number;
  avgFillPrice?: number;
  slippagePercent?: number;
  fillRatio?: number;
  fullyFillable?: boolean;
  levelsWalked?: number;
  confidence?: Confidence;
  note?: string;
}

const STYLES: Record<Confidence, { label: string; cls: string }> = {
  GOOD:          { label: 'Good fill',      cls: 'bg-green-500/15 text-green-400 border-green-500/30' },
  PARTIAL:       { label: 'Some slippage',  cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  HIGH_SLIPPAGE: { label: 'High slippage',  cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
  INSUFFICIENT:  { label: 'Thin book',      cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

/**
 * Live order-book slippage badge for a crypto setup. Fetches /api/liquidity for
 * the intended size and shows a confidence rating + estimated slippage.
 * Renders nothing meaningful for non-crypto symbols (API returns supported:false).
 */
export function LiquidityBadge({
  symbol,
  side,
  size = 1,
  entry,
  stop,
  target,
  className = '',
  onResult,
}: {
  symbol: string;
  side: 'BUY' | 'SELL';
  size?: number;
  entry?: number;
  stop?: number;
  target?: number;
  className?: string;
  /** Reports the fetched result (supported flag + confidence) up to a parent. */
  onResult?: (r: { supported: boolean; confidence?: Confidence }) => void;
}) {
  const [data, setData] = useState<LiquidityData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ symbol, side, size: String(size) });
      if (entry) qs.set('entry', String(entry));
      if (stop) qs.set('stop', String(stop));
      if (target) qs.set('target', String(target));
      const res = await fetch(`/api/liquidity?${qs.toString()}`);
      const json = await res.json();
      setData(json);
      onResult?.({ supported: json?.supported !== false, confidence: json?.confidence });
    } catch {
      setData({ supported: true, note: 'Could not load live liquidity.' });
      onResult?.({ supported: true });
    } finally {
      setLoading(false);
    }
  }, [symbol, side, size, entry, stop, target, onResult]);

  useEffect(() => { load(); }, [load]);

  // Not a crypto instrument — no live book available; render nothing.
  if (data && data.supported === false) return null;

  if (loading) {
    return (
      <div className={`inline-flex items-center gap-1.5 text-[11px] text-gray-400 ${className}`}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking live liquidity…
      </div>
    );
  }

  const conf = data?.confidence;
  const style = conf ? STYLES[conf] : null;

  return (
    <div className={`rounded-lg border border-white/5 bg-[#0D1121]/60 p-3 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Droplets className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[11px] font-semibold text-white">Live Order-Book Liquidity</span>
        </div>
        <button onClick={load} className="text-gray-500 hover:text-white transition" title="Refresh">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {style && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${style.cls}`}>
            {style.label}
          </span>
          <span className="text-[11px] text-gray-300 font-mono">
            ~{(data?.slippagePercent ?? 0).toFixed(3)}% slippage
          </span>
          <span className="text-[10px] text-gray-500">
            {data?.side} {data?.intendedSize} @ ~{formatPrice(data?.avgFillPrice)}
          </span>
        </div>
      )}

      {data?.fullyFillable === false && (
        <div className="mt-2 flex items-start gap-1.5 text-[10px] text-red-300">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>Only ~{Math.round((data?.fillRatio ?? 0) * 100)}% of this size fills within the visible book.</span>
        </div>
      )}

      <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
        {data?.note} Reflects the current {data?.exchange ?? ''} order book at check time.
      </p>
    </div>
  );
}
