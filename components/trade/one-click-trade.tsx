'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Zap, Loader2, Check, AlertTriangle } from 'lucide-react';
import { isCryptoSymbol } from '@/lib/crypto-instruments';
import { LiquidityBadge } from '@/components/trade/liquidity-badge';

type Confidence = 'GOOD' | 'PARTIAL' | 'HIGH_SLIPPAGE' | 'INSUFFICIENT';

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
  const [liqConfidence, setLiqConfidence] = useState<Confidence | null>(null);

  const crypto = isCryptoSymbol(setup.symbol);
  const side: 'BUY' | 'SELL' = toLongShort(setup.direction) === 'LONG' ? 'BUY' : 'SELL';
  const risky = liqConfidence === 'HIGH_SLIPPAGE' || liqConfidence === 'INSUFFICIENT';

  const onLiqResult = useCallback((r: { supported: boolean; confidence?: Confidence }) => {
    setLiqConfidence(r.supported ? (r.confidence ?? null) : null);
  }, []);

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
          // Auto risk-based sizing: the server sizes the position from the
          // account's risk-per-trade setting so every one-click trade risks a
          // consistent fraction of the balance regardless of asset class.
          autoSize: true,
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

  const trackBtn = (
    <button
      onClick={track}
      disabled={state === 'loading'}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold px-3 py-2 transition-all disabled:opacity-60 ${
        state === 'done'
          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
          : risky
            ? 'bg-gradient-to-r from-amber-500/90 to-red-500/90 hover:from-amber-400 hover:to-red-400 text-white ring-1 ring-red-400/40'
            : 'bg-gradient-to-r from-amber-500/90 to-orange-500/90 hover:from-amber-400 hover:to-orange-400 text-white'
      } ${className}`}
    >
      {state === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : state === 'done' ? <><Check className="w-3.5 h-3.5" /> Tracked</>
        : <><Zap className="w-3.5 h-3.5" /> One-Click Track</>}
    </button>
  );

  // Non-crypto (CME futures): unchanged — just the button.
  if (!crypto) return trackBtn;

  // Crypto: surface the live order-book slippage/confidence inline so the user
  // sees fill quality for their intended size before committing.
  return (
    <div className="space-y-2">
      {trackBtn}
      {risky && (
        <div className="flex items-start gap-1.5 text-[10px] text-amber-300">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            {liqConfidence === 'INSUFFICIENT'
              ? 'The visible order book may not fully absorb this size. Tracking is still allowed (demo) — consider a smaller size.'
              : 'Live book shows high expected slippage for this size. Tracking is still allowed (demo) — treat the fill price as indicative.'}
          </span>
        </div>
      )}
      <LiquidityBadge
        symbol={setup.symbol}
        side={side}
        size={size}
        entry={setup.entryPrice}
        stop={setup.stopLoss}
        target={setup.takeProfit}
        onResult={onLiqResult}
      />
    </div>
  );
}
