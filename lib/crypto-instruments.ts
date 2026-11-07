// ---------------------------------------------------------------------------
// Crypto spot instrument metadata (single source of truth).
//
// This module has NO external imports so it can be consumed both by the Next.js
// app (webpack, "@/lib/crypto-instruments") and by the tsx seed script
// (relative "../lib/crypto-instruments") without alias/runtime issues.
//
// Feed routing (VERIFIED — see CRYPTO_FEED_REFERENCE.md, tested from this VM):
//   - OKX   : 21 coins, quote USDT, platform symbol "<COIN>-USDT"
//   - KRAKEN: 1  coin,  quote USD,  platform symbol "<COIN>USD"
// Binance is geo-blocked (HTTP 451) and is intentionally NOT used.
//
// Universe curated for ICT strategies (institutional order flow / liquidity):
// major, liquid, cleanly-priced coins only. Sub-cent memecoins that produced
// unusable (zeroed) trade setups were removed. BTC lives here (spot BTC-USDT),
// not in the futures list.
// ---------------------------------------------------------------------------

export type CryptoExchange = 'OKX' | 'KRAKEN';

export interface CryptoMeta {
  /** Base coin ticker, e.g. "DOGE". */
  coin: string;
  /** Platform symbol used in DB / URLs / charts, e.g. "DOGE-USDT" or "VETUSD". */
  symbol: string;
  /** Human-readable name. */
  name: string;
  /** Which exchange feed to route to. */
  exchange: CryptoExchange;
  /** Display tick size (not used for PnL; spot pointValue is always 1). */
  tickSize: number;
  /** Memecoin / microcap flag — surfaces a high-manipulation-risk warning. */
  lowLiquidity: boolean;
}

// OKX coins (quote = USDT). instId = "<COIN>-USDT".
const OKX: CryptoMeta[] = [
  { coin: 'BTC',   symbol: 'BTC-USDT',   name: 'Bitcoin',        exchange: 'OKX', tickSize: 1e-1, lowLiquidity: false },
  { coin: 'ETH',   symbol: 'ETH-USDT',   name: 'Ethereum',       exchange: 'OKX', tickSize: 1e-2, lowLiquidity: false },
  { coin: 'SOL',   symbol: 'SOL-USDT',   name: 'Solana',         exchange: 'OKX', tickSize: 1e-2, lowLiquidity: false },
  { coin: 'XRP',   symbol: 'XRP-USDT',   name: 'Ripple (XRP)',   exchange: 'OKX', tickSize: 1e-4, lowLiquidity: false },
  { coin: 'DOGE',  symbol: 'DOGE-USDT',  name: 'Dogecoin',       exchange: 'OKX', tickSize: 1e-5, lowLiquidity: false },
  { coin: 'ADA',   symbol: 'ADA-USDT',   name: 'Cardano',        exchange: 'OKX', tickSize: 1e-4, lowLiquidity: false },
  { coin: 'AVAX',  symbol: 'AVAX-USDT',  name: 'Avalanche',      exchange: 'OKX', tickSize: 1e-3, lowLiquidity: false },
  { coin: 'LINK',  symbol: 'LINK-USDT',  name: 'Chainlink',      exchange: 'OKX', tickSize: 1e-3, lowLiquidity: false },
  { coin: 'DOT',   symbol: 'DOT-USDT',   name: 'Polkadot',       exchange: 'OKX', tickSize: 1e-3, lowLiquidity: false },
  { coin: 'LTC',   symbol: 'LTC-USDT',   name: 'Litecoin',       exchange: 'OKX', tickSize: 1e-2, lowLiquidity: false },
  { coin: 'TRX',   symbol: 'TRX-USDT',   name: 'TRON',           exchange: 'OKX', tickSize: 1e-5, lowLiquidity: false },
  { coin: 'SUI',   symbol: 'SUI-USDT',   name: 'Sui',            exchange: 'OKX', tickSize: 1e-4, lowLiquidity: false },
  { coin: 'NEAR',  symbol: 'NEAR-USDT',  name: 'NEAR Protocol',  exchange: 'OKX', tickSize: 1e-3, lowLiquidity: false },
  { coin: 'ATOM',  symbol: 'ATOM-USDT',  name: 'Cosmos',         exchange: 'OKX', tickSize: 1e-3, lowLiquidity: false },
  { coin: 'APT',   symbol: 'APT-USDT',   name: 'Aptos',          exchange: 'OKX', tickSize: 1e-4, lowLiquidity: false },
  { coin: 'ARB',   symbol: 'ARB-USDT',   name: 'Arbitrum',       exchange: 'OKX', tickSize: 1e-4, lowLiquidity: false },
  { coin: 'XLM',   symbol: 'XLM-USDT',   name: 'Stellar',        exchange: 'OKX', tickSize: 1e-5, lowLiquidity: false },
  { coin: 'HBAR',  symbol: 'HBAR-USDT',  name: 'Hedera',         exchange: 'OKX', tickSize: 1e-5, lowLiquidity: false },
  { coin: 'ALGO',  symbol: 'ALGO-USDT',  name: 'Algorand',       exchange: 'OKX', tickSize: 1e-5, lowLiquidity: false },
  { coin: 'CRO',   symbol: 'CRO-USDT',   name: 'Cronos',         exchange: 'OKX', tickSize: 1e-5, lowLiquidity: false },
  { coin: 'FLR',   symbol: 'FLR-USDT',   name: 'Flare',          exchange: 'OKX', tickSize: 1e-5, lowLiquidity: false },
];

// Kraken coins (quote = USD). pair = "<COIN>USD".
const KRAKEN: CryptoMeta[] = [
  { coin: 'VET',   symbol: 'VETUSD',   name: 'VeChain',       exchange: 'KRAKEN', tickSize: 1e-5, lowLiquidity: false },
];

export const CRYPTO_INSTRUMENTS: CryptoMeta[] = [...OKX, ...KRAKEN];

const BY_SYMBOL: Record<string, CryptoMeta> = Object.fromEntries(
  CRYPTO_INSTRUMENTS.map((c) => [c.symbol, c]),
);

/** True if the platform symbol is one of our crypto spot instruments. */
export function isCryptoSymbol(symbol: string): boolean {
  return Object.prototype.hasOwnProperty.call(BY_SYMBOL, symbol);
}

/** Metadata for a crypto platform symbol (or undefined for futures/unknown). */
export function getCryptoMeta(symbol: string): CryptoMeta | undefined {
  return BY_SYMBOL[symbol];
}

/** True if the crypto symbol is flagged as a low-liquidity / memecoin market. */
export function isLowLiquiditySymbol(symbol: string): boolean {
  return BY_SYMBOL[symbol]?.lowLiquidity ?? false;
}
