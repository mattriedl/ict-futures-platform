// Central metadata for supported futures instruments.
// pointValue = dollar value of a 1.00 move in price, per 1 contract.
// Used for demo-trade P&L when a DB Instrument row is unavailable.

import { CRYPTO_INSTRUMENTS } from './crypto-instruments';

export interface InstrumentMeta {
  symbol: string;
  name: string;
  exchange: string;
  category: string;
  tickSize: number;
  pointValue: number;
}

const FUTURES_INSTRUMENTS: InstrumentMeta[] = [
  // Equity Indices
  { symbol: 'ES=F',  name: 'E-mini S&P 500',      exchange: 'CME',   category: 'Equity Indices', tickSize: 0.25,  pointValue: 50 },
  { symbol: 'NQ=F',  name: 'E-mini Nasdaq 100',   exchange: 'CME',   category: 'Equity Indices', tickSize: 0.25,  pointValue: 20 },
  { symbol: 'YM=F',  name: 'E-mini Dow',          exchange: 'CBOT',  category: 'Equity Indices', tickSize: 1,     pointValue: 5 },
  { symbol: 'RTY=F', name: 'E-mini Russell 2000', exchange: 'CME',   category: 'Equity Indices', tickSize: 0.1,   pointValue: 50 },
  // Micros
  { symbol: 'MES=F', name: 'Micro E-mini S&P 500',exchange: 'CME',   category: 'Micros',         tickSize: 0.25,  pointValue: 5 },
  { symbol: 'MNQ=F', name: 'Micro E-mini Nasdaq', exchange: 'CME',   category: 'Micros',         tickSize: 0.25,  pointValue: 2 },
  // Energy
  { symbol: 'CL=F',  name: 'Crude Oil WTI',       exchange: 'NYMEX', category: 'Energy',         tickSize: 0.01,  pointValue: 1000 },
  { symbol: 'NG=F',  name: 'Natural Gas',         exchange: 'NYMEX', category: 'Energy',         tickSize: 0.001, pointValue: 10000 },
  // Metals
  { symbol: 'GC=F',  name: 'Gold',                exchange: 'COMEX', category: 'Metals',         tickSize: 0.10,  pointValue: 100 },
  { symbol: 'SI=F',  name: 'Silver',              exchange: 'COMEX', category: 'Metals',         tickSize: 0.005, pointValue: 5000 },
  // Bonds
  { symbol: 'ZB=F',  name: '30-Year T-Bond',      exchange: 'CBOT',  category: 'Bonds',          tickSize: 0.03125, pointValue: 1000 },
  { symbol: 'ZN=F',  name: '10-Year T-Note',      exchange: 'CBOT',  category: 'Bonds',          tickSize: 0.015625, pointValue: 1000 },
  // Agriculture
  { symbol: 'ZC=F',  name: 'Corn',                exchange: 'CBOT',  category: 'Agriculture',    tickSize: 0.25,  pointValue: 50 },
  { symbol: 'ZS=F',  name: 'Soybeans',            exchange: 'CBOT',  category: 'Agriculture',    tickSize: 0.25,  pointValue: 50 },
  // Bitcoin is provided as spot BTC-USDT in the crypto universe (see CRYPTO_META below),
  // not as a CME future — moved per product decision so all crypto lives in one category.
];

// Crypto spot instruments (OKX / Kraken) — pointValue = 1 (1 coin = 1 unit).
const CRYPTO_META: InstrumentMeta[] = CRYPTO_INSTRUMENTS.map((c) => ({
  symbol: c.symbol,
  name: `${c.name} (Crypto)`,
  exchange: c.exchange,
  category: 'Crypto (Spot)',
  tickSize: c.tickSize,
  pointValue: 1,
}));

// ---------------------------------------------------------------------------
// FOREX (spot FX) — data via Yahoo Finance using the "<BASE><QUOTE>=X" format
// (e.g. EURUSD=X, GBPJPY=X, EURGBP=X). Same data source/path as the futures.
//
// tickSize: standard pip/point resolution — JPY-quoted pairs quote to 3 dp so a
//   point is 0.001; all other pairs quote to 5 dp so a point is 0.00001.
// pointValue: MICRO-LOT convention for demo P&L. 1 "contract" = 1 micro lot =
//   1,000 units of the base currency, so a full 1.00 move in the pair is worth
//   1,000 in the QUOTE currency. We use pointValue = 1000 for every pair. (The
//   previous standard-lot value of 100,000 inflated FX P&L by 100x relative to
//   the futures/crypto position sizing; micro-lot keeps demo risk realistic.)
//   This is an approximation for demo purposes only: it is denominated in the
//   quote currency and is NOT converted back to USD for cross pairs.
// ---------------------------------------------------------------------------
const CURRENCY_NAMES: Record<string, string> = {
  USD: 'US Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  JPY: 'Japanese Yen',
  CHF: 'Swiss Franc',
  AUD: 'Australian Dollar',
  CAD: 'Canadian Dollar',
  NZD: 'New Zealand Dollar',
};

// 7 majors + 21 crosses = 28 pairs, expressed as [base, quote].
const FOREX_PAIRS: [string, string][] = [
  // Majors
  ['EUR', 'USD'], ['GBP', 'USD'], ['USD', 'JPY'], ['USD', 'CHF'],
  ['AUD', 'USD'], ['USD', 'CAD'], ['NZD', 'USD'],
  // Crosses
  ['EUR', 'GBP'], ['EUR', 'JPY'], ['EUR', 'CHF'], ['EUR', 'AUD'], ['EUR', 'CAD'], ['EUR', 'NZD'],
  ['GBP', 'JPY'], ['GBP', 'CHF'], ['GBP', 'AUD'], ['GBP', 'CAD'], ['GBP', 'NZD'],
  ['AUD', 'JPY'], ['AUD', 'CHF'], ['AUD', 'CAD'], ['AUD', 'NZD'],
  ['CAD', 'JPY'], ['CAD', 'CHF'], ['CHF', 'JPY'],
  ['NZD', 'JPY'], ['NZD', 'CHF'], ['NZD', 'CAD'],
];

export const FOREX_INSTRUMENTS: InstrumentMeta[] = FOREX_PAIRS.map(([base, quote]) => ({
  symbol: `${base}${quote}=X`,
  name: `${base}/${quote} — ${CURRENCY_NAMES[base]} / ${CURRENCY_NAMES[quote]}`,
  exchange: 'FX',
  category: 'Forex',
  tickSize: quote === 'JPY' ? 0.001 : 0.00001,
  pointValue: 1000, // micro-lot (see note above); was 100000 (standard lot)
}));

export const INSTRUMENTS: InstrumentMeta[] = [...FUTURES_INSTRUMENTS, ...CRYPTO_META, ...FOREX_INSTRUMENTS];

/** True if the symbol is a spot FX pair (Yahoo "=X" format, in our FX set). */
export function isForexSymbol(symbol: string): boolean {
  return FOREX_INSTRUMENTS.some((f) => f.symbol === symbol);
}

const BY_SYMBOL: Record<string, InstrumentMeta> = Object.fromEntries(
  INSTRUMENTS.map((i) => [i.symbol, i]),
);

export function getInstrumentMeta(symbol: string): InstrumentMeta | undefined {
  return BY_SYMBOL[symbol];
}

/** Dollar value of a full 1.00 price move for one contract. Falls back to 1. */
export function getPointValue(symbol: string, dbPointValue?: number | null): number {
  if (dbPointValue && dbPointValue > 0) return dbPointValue;
  return BY_SYMBOL[symbol]?.pointValue ?? 1;
}

export const INSTRUMENT_CATEGORIES = Array.from(new Set(INSTRUMENTS.map((i) => i.category)));
