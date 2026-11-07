// ---------------------------------------------------------------------------
// Shared adaptive price formatting.
//
// Prices span many orders of magnitude across the supported markets — index
// futures in the thousands, FX to 5 decimals, and micro-cap crypto below one
// cent. A fixed toFixed(2) either loses all precision on small coins
// (0.00000123 -> "0.00") or shows noise on large values. formatPrice adapts the
// number of decimals to the magnitude of the value so every market renders
// meaningfully.
//
// NOTE: this is for PRICE values only (entry/SL/TP/exit/current price). P&L,
// percentages and currency balances keep their own fixed 2-decimal formatting.
// ---------------------------------------------------------------------------

export interface FormatPriceOptions {
  /** Force grouping separators (thousands). Default false. */
  grouping?: boolean;
  /** Hard cap on decimals for very small numbers. Default 10. */
  maxDecimals?: number;
}

/** Decide how many decimals a price should render with, based on magnitude. */
export function priceDecimalPlaces(value: number, maxDecimals = 10): number {
  const abs = Math.abs(value);
  if (!isFinite(abs) || abs === 0) return 2;
  if (abs >= 1000) return 2;
  if (abs >= 1) return 4; // trailing zeros trimmed to min 2 by caller
  if (abs >= 0.01) return 4;
  // value < 0.01: count leading zeros after the decimal point and show enough
  // significant digits (leadingZeros + 4) so sub-cent coins render fully.
  // e.g. 0.00000123 -> 5 leading zeros -> 9 decimals -> "0.000001230"
  const leadingZeros = Math.floor(-Math.log10(abs)) - 1;
  return Math.min(leadingZeros + 4, maxDecimals);
}

/**
 * Format a price value with adaptive decimal precision.
 * Handles null/undefined/NaN/0 gracefully (returns "0.00" for 0, "—" for
 * null/undefined/non-finite).
 */
export function formatPrice(
  value: number | null | undefined,
  opts: FormatPriceOptions = {},
): string {
  if (value == null || !isFinite(value as number)) return '—';
  const num = value as number;
  if (num === 0) return '0.00';

  const maxDecimals = opts.maxDecimals ?? 10;
  const decimals = priceDecimalPlaces(num, maxDecimals);

  let str: string;
  const abs = Math.abs(num);
  if (abs >= 1 && abs < 1000) {
    // up to 4 decimals, trim trailing zeros but keep at least 2
    str = num.toFixed(decimals);
    str = str.replace(/(\.\d{2}\d*?)0+$/, '$1'); // trim beyond 2dp
    str = str.replace(/(\.\d*[1-9])0+$/, '$1');
  } else {
    str = num.toFixed(decimals);
  }

  if (opts.grouping) {
    const [intPart, decPart] = str.split('.');
    const grouped = Number(intPart).toLocaleString('en-US');
    str = decPart != null ? `${grouped}.${decPart}` : grouped;
  }

  return str;
}

/** Format a price change/delta with an explicit +/- sign. */
export function formatSignedPrice(
  value: number | null | undefined,
  opts: FormatPriceOptions = {},
): string {
  if (value == null || !isFinite(value as number)) return '—';
  const num = value as number;
  const sign = num > 0 ? '+' : num < 0 ? '-' : '';
  return `${sign}${formatPrice(Math.abs(num), opts)}`;
}
