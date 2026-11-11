// Is a setup still tradeable at the live price? Same rules the autotrader and
// one-click use: price on the target side of the entry, before the target, not
// through the stop, with at least 1:1 reward:risk remaining.

export type SetupLiveStatus = 'FRESH' | 'TARGET_HIT' | 'STOPPED' | 'PAST_ENTRY' | 'LOW_RR' | 'NO_QUOTE';

export const SETUP_STATUS_LABEL: Record<SetupLiveStatus, string> = {
  FRESH: 'Tradeable now',
  TARGET_HIT: 'Played out — target already reached',
  STOPPED: 'Invalidated — price is through the stop',
  PAST_ENTRY: 'Price moved past the entry toward the stop',
  LOW_RR: 'Less than 1:1 reward left at the current price',
  NO_QUOTE: 'Live price unavailable',
};

export function setupLiveStatus(
  setup: { direction: string; entryPrice: number; stopLoss: number; takeProfit: number },
  live: number | null | undefined,
): SetupLiveStatus {
  if (live == null || !Number.isFinite(live)) return 'NO_QUOTE';
  const long = setup.direction === 'BULLISH' || setup.direction === 'LONG';
  const { entryPrice: entry, stopLoss: stop, takeProfit: tp } = setup;
  if (long ? live >= tp : live <= tp) return 'TARGET_HIT';
  if (long ? live <= stop : live >= stop) return 'STOPPED';
  if (long ? live <= entry : live >= entry) return 'PAST_ENTRY';
  const reward = Math.abs(tp - live);
  const risk = Math.abs(live - stop);
  if (risk <= 0 || reward < risk) return 'LOW_RR';
  return 'FRESH';
}
