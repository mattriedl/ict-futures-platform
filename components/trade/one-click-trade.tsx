'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Zap, Loader2, Check } from 'lucide-react';

export interface OneClickSetup {
  symbol: string;
  direction: 'BULLISH' | 'BEARISH' | 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward?: number;
  aiScore?: number | null;
  confluences?: string[];
  timeframe?: string;
}

function toLongShort(d: string): 'LONG' | 'SHORT' {
  return d === 'BULLISH' || d === 'LONG' ? 'LONG' : 'SHORT';
}

/**
 * One-click "Track this setup" button. Logs the AI-generated setup as an OPEN
 * demo trade that the platform then auto-evaluates to WIN/LOSS.
 */
export function OneClickTrade({ setup, size = 1, className = '' }: { setup: OneClickSetup; size?: number; className?: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');

  const track = async () => {
    if (state !== 'idle') return;
    setState('loading');
    try {
      const res = await fetch('/api/demo/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: setup.symbol,
          direction: toLongShort(setup.direction),
          entryPrice: setup.entryPrice,
          stopLoss: setup.stopLoss,
          takeProfit: setup.takeProfit,
          positionSize: size,
          timeframe: setup.timeframe ?? '15m',
          source: 'ONE_CLICK',
          aiScore: setup.aiScore ?? null,
          confluences: setup.confluences ?? [],
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Could not track setup');
        setState('idle');
        return;
      }
      toast.success('Setup tracked as a demo trade — view it in your Trade Journal.');
      setState('done');
      setTimeout(() => setState('idle'), 2500);
    } catch {
      toast.error('Request failed');
      setState('idle');
    }
  };

  return (
    <button
      onClick={track}
      disabled={state === 'loading'}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold px-3 py-2 transition-all disabled:opacity-60 ${
        state === 'done'
          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
          : 'bg-gradient-to-r from-amber-500/90 to-orange-500/90 hover:from-amber-400 hover:to-orange-400 text-white'
      } ${className}`}
    >
      {state === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : state === 'done' ? <><Check className="w-3.5 h-3.5" /> Tracked</>
        : <><Zap className="w-3.5 h-3.5" /> One-Click Track</>}
    </button>
  );
}
