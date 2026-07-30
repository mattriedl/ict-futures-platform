// Central metadata for supported futures instruments.
// pointValue = dollar value of a 1.00 move in price, per 1 contract.
// Used for demo-trade P&L when a DB Instrument row is unavailable.

export interface InstrumentMeta {
  symbol: string;
  name: string;
  exchange: string;
  category: string;
  tickSize: number;
  pointValue: number;
}

export const INSTRUMENTS: InstrumentMeta[] = [
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
  // Crypto
  { symbol: 'BTC=F', name: 'Bitcoin Futures',     exchange: 'CME',   category: 'Crypto',         tickSize: 5,     pointValue: 5 },
];

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
