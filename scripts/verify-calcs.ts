/* Standalone verification of trade math & backtest integrity. */
import { computeTradePnl } from '../lib/demo-trades';
import { runBacktest } from '../lib/backtest';

let pass = 0, fail = 0;
function check(name: string, got: any, want: any, tol = 0.01) {
  const ok = typeof want === 'number' ? Math.abs(got - want) <= tol : got === want;
  if (ok) { pass++; console.log(`  ✔ ${name}: ${got}`); }
  else { fail++; console.log(`  �’ ${name}: got ${got}, expected ${want}`); }
}

console.log('\n== computeTradePnl ==');
// ES=F pointValue 50. LONG entry 5000, stop 4990 (risk 10 pts), exit at target 5020 (+20 pts) => +2R
// pnl = 20 * 50 * 1 = 1000
{
  const r = computeTradePnl({ direction: 'LONG', entryPrice: 5000, stopLoss: 4990, positionSize: 1, symbol: 'ES=F' }, 5020);
  check('LONG win pnl $', r.pnl, 1000);
  check('LONG win rMultiple', r.rMultiple, 2);
}
// LONG loss: exit at stop 4990 => -10 pts => pnl -500 => -1R
{
  const r = computeTradePnl({ direction: 'LONG', entryPrice: 5000, stopLoss: 4990, positionSize: 1, symbol: 'ES=F' }, 4990);
  check('LONG loss pnl $', r.pnl, -500);
  check('LONG loss rMultiple', r.rMultiple, -1);
}
// SHORT win: entry 5000 stop 5010 (risk 10) exit 4980 (+20 in favor) => +2R, 2 contracts => pnl 20*50*2=2000
{
  const r = computeTradePnl({ direction: 'SHORT', entryPrice: 5000, stopLoss: 5010, positionSize: 2, symbol: 'ES=F' }, 4980);
  check('SHORT win pnl $ (2 contracts)', r.pnl, 2000);
  check('SHORT win rMultiple', r.rMultiple, 2);
}
// CL=F pointValue 1000. LONG entry 80 stop 79 (risk 1) exit 82 (+2) => +2R, pnl 2*1000=2000
{
  const r = computeTradePnl({ direction: 'LONG', entryPrice: 80, stopLoss: 79, positionSize: 1, symbol: 'CL=F' }, 82);
  check('CL LONG pnl $', r.pnl, 2000);
  check('CL LONG rMultiple', r.rMultiple, 2);
}

(async () => {
  console.log('\n== runBacktest integrity (synthetic fallback allowed) ==');
  const res = await runBacktest({ symbol: 'ES=F', timeframe: '15m', days: 60, requiredConfluences: [], minAiScore: 0, riskPerTrade: 1 });
  check('wins + losses <= totalTrades', res.wins + res.losses <= res.totalTrades, true);
  check('winRate in [0,100]', res.winRate >= 0 && res.winRate <= 100, true);
  check('equityCurve non-empty', res.equityCurve.length > 0, true);
  check('maxDrawdown >= 0', res.maxDrawdownPercent >= 0, true);
  // netR should equal sum of trade rMultiples (closed) within tolerance
  const sumR = res.trades.filter(t => t.outcome !== 'OPEN').reduce((s, t) => s + t.rMultiple, 0);
  check('netR == sum(rMultiples)', res.netR, Math.round(sumR * 100) / 100, 0.05);
  // winRate == wins/(wins+losses)*100
  const wr = (res.wins + res.losses) > 0 ? (res.wins / (res.wins + res.losses)) * 100 : 0;
  check('winRate == wins/(wins+losses)', res.winRate, Math.round(wr * 100) / 100, 0.1);
  console.log(`  (info) totalTrades=${res.totalTrades} wins=${res.wins} losses=${res.losses} synthetic=${res.synthetic} clampedDays=${res.clampedDays}`);

  console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==\n`);
  process.exit(fail > 0 ? 1 : 0);
})();
