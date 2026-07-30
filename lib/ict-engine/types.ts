export interface OHLCVBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ICTPattern {
  type: string;
  direction: 'BULLISH' | 'BEARISH';
  priceLevel: number;
  upperBound?: number;
  lowerBound?: number;
  confidence: number;
  description: string;
  startIndex: number;
  endIndex: number;
}

export interface TradeSetupResult {
  direction: 'BULLISH' | 'BEARISH';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  aiScore: number;
  confluences: string[];
  explanation: string;
}

export interface ConfluenceScore {
  score: number;
  factors: { name: string; weight: number; met: boolean }[];
}
