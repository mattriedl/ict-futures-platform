/**
 * Score calibration: backtest several markets with NO score filter and report
 * win rate / average R by score bucket and by scoring factor. Use it before and
 * after any change to lib/ict-engine (see docs/08 §2a) to pick thresholds.
 *
 *   NODE_USE_ENV_PROXY=1 npx tsx --tsconfig tsconfig.json scripts/score-calibration.ts [out.json]
 */
import { runBacktest } from '../lib/backtest';
import { writeFileSync } from 'fs';

const RUNS: [string, string, number][] = [
  ['ES=F', '15m', 45], ['NQ=F', '15m', 45], ['CL=F', '15m', 45], ['GC=F', '15m', 45],
  ['EURUSD=X', '15m', 45], ['GBPJPY=X', '15m', 45], ['BTC-USDT', '1h', 50], ['ETH-USDT', '1h', 50],
];
type Row = { symbol: string; score: number; win: boolean; r: number; f: string[] };
const fmt = (rows: Row[]) =>
  rows.length
    ? `${String(rows.length).padStart(5)} trades  win ${(100 * rows.filter((x) => x.win).length / rows.length).toFixed(1).padStart(5)}%  avg ${(rows.reduce((s, x) => s + x.r, 0) / rows.length >= 0 ? '+' : '')}${(rows.reduce((s, x) => s + x.r, 0) / rows.length).toFixed(2)}R`
    : '    0 trades';

(async () => {
  const rows: Row[] = [];
  for (const [symbol, timeframe, days] of RUNS) {
    try {
      const r = await runBacktest({ symbol, timeframe, days, requiredConfluences: [], minAiScore: 0, riskPerTrade: 1 });
      for (const t of r.trades) {
        if (t.outcome !== 'OPEN') rows.push({ symbol, score: t.aiScore, win: t.outcome === 'WIN', r: t.rMultiple, f: t.factorsMet ?? [] });
      }
      console.log(`${symbol.padEnd(9)} ${timeframe.padEnd(4)} ${fmt(rows.filter((x) => x.symbol === symbol))}`);
    } catch (e) {
      console.log(`${symbol.padEnd(9)} ERROR ${(e as Error).message}`);
    }
  }
  console.log('\nBy score:');
  const edges = [0, 40, 50, 60, 70, 80, 101];
  for (let i = 0; i < edges.length - 1; i++) {
    console.log(`  ${String(edges[i]).padStart(3)}-${String(Math.min(edges[i + 1] - 1, 100)).padEnd(3)} ${fmt(rows.filter((x) => x.score >= edges[i] && x.score < edges[i + 1]))}`);
  }
  console.log('Cumulative:');
  for (const th of [40, 50, 60, 65, 70, 75, 80]) console.log(`  >= ${th}   ${fmt(rows.filter((x) => x.score >= th))}`);
  console.log('By factor (met | not met):');
  for (const n of Array.from(new Set(rows.flatMap((x) => x.f))).sort()) {
    console.log(`  ${n.padEnd(36)} ${fmt(rows.filter((x) => x.f.includes(n)))}  |  ${fmt(rows.filter((x) => !x.f.includes(n)))}`);
  }
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(rows));
})();
