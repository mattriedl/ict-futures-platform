/**
 * Route params for symbols such as "NQ=F" or "EURUSD=X" can arrive
 * percent-encoded ("NQ%3DF"). Decode once, safely, and trim.
 */
export function decodeSymbol(raw: string | undefined | null): string {
  const s = raw ?? '';
  try {
    return decodeURIComponent(s).trim();
  } catch {
    return s.trim();
  }
}
