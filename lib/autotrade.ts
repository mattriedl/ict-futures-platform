// ---------------------------------------------------------------------------
// Automated trading ("autotrader").
//
// On a schedule the app:
//   1. activatePendingTrades() — flips PENDING limit orders to OPEN once live
//      price reaches their entry, and auto-cancels expired ones.
//   2. evaluateOpenTrades()    — (called by the API route) resolves OPEN trades
//      against real forward bars (win/loss) — existing engine, synthetic-safe.
//   3. runAutoTrade(userId)    — scans every instrument's ICT analysis and, for
//      any setup scoring >= the user's threshold, opens a trade IMMEDIATELY at
//      market (status OPEN) — exactly like the one-click button — sized at the
//      1%-risk rule and capped so it never exceeds available bankroll (crypto is
//      1x leverage => full notional must fit).
//
// EXECUTION MODEL (important): auto-trades open at market the moment a fresh
// high-score setup is found, NOT as passive limit orders that wait for price to
// retrace to the entry. The passive-limit design filled every order while price
// was moving INTO the entry (i.e. straight toward the nearby stop), which
// produced a 100% stop-out rate. Immediate execution mirrors the one-click /
// manual flow that wins. activatePendingTrades() is retained only to drain any
// legacy PENDING orders (it activates or expires them); no new PENDING orders
// are created.
//
// Only real data is ever used (fetchLiveQuote / fetchMarketData); trades never
// resolve against synthetic bars.
// ---------------------------------------------------------------------------

import { prisma } from '@/lib/prisma';
import { fetchMarketData } from '@/lib/market-data';
import { analyzeICT, scoreConfluence, generateTradeSetup } from '@/lib/ict-engine';
import { deriveAssetClass, biasToDirection, computeWeightedScore } from '@/lib/setup-stats';
import { fetchLiveQuote } from '@/lib/live-quote';
import { getPointValue } from '@/lib/instruments';
import { getLeverageForSymbol, computeRequiredMargin } from '@/lib/margin';
import { getOrCreateDemoAccount, getDrawdownStatus } from '@/lib/demo-trades';

// Legacy pending orders self-cancel quickly if their entry is never reached so
// stale, expired-analysis limit orders don't linger (new orders open at market).
export const AUTOTRADE_PENDING_TTL_MS = 2 * 60 * 60 * 1000; // 2h

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

function isHardBlocked(dd: { enforceDrawdown: boolean; dailyBreached: boolean; overallBreached: boolean }) {
  return dd.enforceDrawdown && (dd.dailyBreached || dd.overallBreached);
}

// ---------------------------------------------------------------------------
// 1) Activate / expire pending limit orders.
// ---------------------------------------------------------------------------
export async function activatePendingTrades(
  userId?: string,
): Promise<{ activated: number; cancelled: number }> {
  const pending = await prisma.demoTrade.findMany({
    where: { status: 'PENDING', ...(userId ? { userId } : {}) },
    include: { instrument: true },
  });
  if (pending.length === 0) return { activated: 0, cancelled: 0 };

  let activated = 0;
  let cancelled = 0;

  // Cache per-user settings/drawdown so we don't refetch for every trade.
  const settingsCache = new Map<string, any>();
  const ddCache = new Map<string, boolean>();

  for (const trade of pending) {
    try {
      // Expiry check first (no live data needed).
      if (trade.expiresAt && Date.now() > new Date(trade.expiresAt).getTime()) {
        const res = await prisma.demoTrade.updateMany({
          where: { id: trade.id, status: 'PENDING' },
          data: {
            status: 'CANCELLED',
            closedAt: new Date(),
            notes: (trade.notes ? trade.notes + ' ' : '') + 'Auto-cancelled: entry not reached before expiry.',
          },
        });
        if (res.count === 1) cancelled++;
        continue;
      }

      const quote = await fetchLiveQuote(trade.symbol);
      if (!quote || quote.stale || quote.price == null) continue; // retry next tick
      const livePrice = quote.price;

      const triggered =
        (trade.pendingApproach === 'FALL' && livePrice <= trade.entryPrice) ||
        (trade.pendingApproach === 'RISE' && livePrice >= trade.entryPrice);
      if (!triggered) continue;

      // Load (cached) settings + drawdown for this user.
      let settings = settingsCache.get(trade.userId);
      if (settings === undefined) {
        settings = await prisma.userSettings.findUnique({ where: { userId: trade.userId } });
        settingsCache.set(trade.userId, settings);
      }
      let blocked = ddCache.get(trade.userId);
      if (blocked === undefined) {
        const dd = await getDrawdownStatus(trade.userId);
        blocked = isHardBlocked(dd);
        ddCache.set(trade.userId, blocked);
      }
      if (blocked) continue; // don't open new exposure while hard-blocked; stays PENDING

      // Recompute required margin at activation.
      const leverage = getLeverageForSymbol(trade.symbol, settings);
      const requiredMargin = computeRequiredMargin(
        trade.symbol,
        trade.entryPrice,
        trade.positionSize,
        leverage,
        (trade as any).instrument?.pointValue,
      );

      const account = await getOrCreateDemoAccount(trade.userId);
      const openMarginAgg = await prisma.demoTrade.aggregate({
        where: { userId: trade.userId, status: 'OPEN' },
        _sum: { margin: true },
      });
      const usedMargin = openMarginAgg._sum.margin ?? 0;
      const availableBalance = account.currentBalance - usedMargin;

      if (requiredMargin > availableBalance + 1e-6) continue; // can't afford yet; stays PENDING

      const res = await prisma.demoTrade.updateMany({
        where: { id: trade.id, status: 'PENDING' },
        data: {
          status: 'OPEN',
          openedAt: new Date(),
          margin: round2(requiredMargin),
          notes: (trade.notes ? trade.notes + ' ' : '') + `Activated @ ${livePrice} (entry ${trade.entryPrice}).`,
        },
      });
      if (res.count === 1) activated++;
    } catch (err) {
      console.warn(`activatePendingTrades: ${trade.symbol} skipped:`, (err as Error)?.message);
    }
  }

  return { activated, cancelled };
}

// ---------------------------------------------------------------------------
// 3) Scan all instruments for a user and place pending auto-trades.
// ---------------------------------------------------------------------------
export async function runAutoTrade(
  userId: string,
): Promise<{ created: number; scanned: number; skipped: number; details: any[]; diagnostics: any[] }> {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  if (!settings?.autoTradeEnabled) {
    return { created: 0, scanned: 0, skipped: 0, details: [{ note: 'autoTradeEnabled=false' }], diagnostics: [] };
  }

  const minScore = settings.autoTradeMinScore ?? 75;
  const riskPercent = settings.riskPercent ?? 1;
  const timeframe = '15m';

  const account = await getOrCreateDemoAccount(userId);

  const dd = await getDrawdownStatus(userId);
  if (isHardBlocked(dd)) {
    return { created: 0, scanned: 0, skipped: 0, details: [{ note: 'drawdown hard-block active' }], diagnostics: [] };
  }

  // Running available-balance tally so multiple pending orders placed in one
  // scan collectively respect the bankroll.
  const openMarginAgg = await prisma.demoTrade.aggregate({
    where: { userId, status: 'OPEN' },
    _sum: { margin: true },
  });
  let availableBalance = account.currentBalance - (openMarginAgg._sum.margin ?? 0);

  const instruments = await prisma.instrument.findMany({ where: { active: true } });

  let created = 0;
  let scanned = 0;
  let skipped = 0;
  const details: any[] = [];
  // Diagnostics: records WHY a candidate that produced a valid setup was not
  // traded (e.g. weighted score below threshold), so scans are auditable.
  const diagnostics: any[] = [];

  for (const instrument of instruments) {
    const symbol = instrument.symbol;
    scanned++;
    try {
      // Dedupe: skip if an OPEN or PENDING trade already exists for this symbol.
      const existing = await prisma.demoTrade.findFirst({
        where: { userId, symbol, status: { in: ['OPEN', 'PENDING'] } },
        select: { id: true },
      });
      if (existing) { skipped++; continue; }

      const bars = await fetchMarketData(symbol, timeframe);
      if (!bars?.length) { skipped++; continue; }

      const patterns = analyzeICT(bars);
      const setup = generateTradeSetup(bars, patterns);
      if (!setup) { skipped++; continue; }

      const assetClass = deriveAssetClass(symbol);
      let score = setup.aiScore;
      try {
        const weighted = await computeWeightedScore(
          { assetClass, timeframe, confluences: setup.confluences },
          setup.aiScore,
        );
        score = weighted.weightedScore ?? setup.aiScore;
      } catch { /* keep raw score */ }

      if (score < minScore) {
        skipped++;
        diagnostics.push({ symbol, rawScore: Math.round(setup.aiScore), weightedScore: Math.round(score), minScore, reason: 'weighted-score-below-threshold' });
        continue;
      }

      const direction = biasToDirection(setup.direction);
      const setupEntry = setup.entryPrice;
      const stop = setup.stopLoss;
      const tp = setup.takeProfit;

      // Validate finite, positive, correctly ordered.
      const finiteOk = [setupEntry, stop, tp].every((v) => Number.isFinite(v) && v > 0);
      const orderOk =
        direction === 'LONG' ? stop < setupEntry && setupEntry < tp : tp < setupEntry && setupEntry < stop;
      if (!finiteOk || !orderOk) { skipped++; diagnostics.push({ symbol, weightedScore: Math.round(score), reason: 'invalid-price-levels' }); continue; }

      // --- LIVE-QUOTE FRESHNESS GATE ----------------------------------------
      // WHY: the hourly scan books setups computed from bar data, but by the time
      // the scan fires the live price may already have run through the entry
      // toward the (nearby) stop. Opening at the stale entry level then evaluates
      // forward straight into that stop — the exact-stop losses we observed. A
      // human pressing one-click only acts when the setup is still fresh on the
      // live chart, so we mirror that: fetch the live price and only open when it
      // still sits on the correct side of the setup (between entry and target),
      // then fill at the realistic live price rather than the stale limit level.
      const quote = await fetchLiveQuote(symbol);
      if (quote.price == null || quote.stale) {
        skipped++;
        diagnostics.push({ symbol, weightedScore: Math.round(score), reason: 'no-live-quote' });
        continue;
      }
      const live = quote.price;
      // LONG is fresh only while entry < live < tp (pullback held, price moving
      // toward target — never while live has fallen to/through entry toward stop).
      // SHORT is fresh only while tp < live < entry.
      const fresh =
        direction === 'LONG'
          ? live > setupEntry && live < tp
          : live < setupEntry && live > tp;
      if (!fresh) {
        skipped++;
        const reason =
          (direction === 'LONG' ? live <= setupEntry : live >= setupEntry)
            ? 'entry-breached-toward-stop'
            : 'target-already-hit';
        diagnostics.push({ symbol, weightedScore: Math.round(score), setupEntry, live: round4(live), reason });
        continue;
      }
      // Require the live fill to still offer a worthwhile reward: at least a
      // 1:1 remaining R:R (reward from live→target vs risk from live→stop).
      // Booking at the live price degrades the original R:R; without this guard
      // a price that has drifted right up to the target would open with almost
      // no upside left but the full downside to the stop still open.
      const rewardRemaining = Math.abs(tp - live);
      const riskAtFill = Math.abs(live - stop);
      if (riskAtFill <= 0 || rewardRemaining < riskAtFill) {
        skipped++;
        diagnostics.push({ symbol, weightedScore: Math.round(score), setupEntry, live: round4(live), reason: 'insufficient-remaining-rr' });
        continue;
      }
      // Fill at the live price; stop/tp levels are unchanged. Ordering still
      // holds (stop < live < tp for LONG, tp < live < stop for SHORT).
      const entry = round4(live);

      // --- Sizing: 1%-risk rule (same formula as manual trade route) ---------
      const pointValue = getPointValue(symbol, instrument.pointValue);
      const perUnitRisk = Math.abs(entry - stop) * pointValue;
      if (perUnitRisk <= 0) { skipped++; continue; }
      const riskAmount = account.currentBalance * (riskPercent / 100);
      let positionSize = round4(riskAmount / perUnitRisk);
      if (positionSize <= 0) positionSize = 0.0001;

      // --- No-over-bankroll cap ---------------------------------------------
      const leverage = getLeverageForSymbol(symbol, settings);
      let requiredMargin = computeRequiredMargin(symbol, entry, positionSize, leverage, instrument.pointValue);
      if (requiredMargin > availableBalance) {
        const scale = (availableBalance / requiredMargin) * 0.99;
        positionSize = round4(positionSize * scale);
        requiredMargin = computeRequiredMargin(symbol, entry, positionSize, leverage, instrument.pointValue);
      }
      if (positionSize <= 0 || requiredMargin > availableBalance + 1e-6) { skipped++; diagnostics.push({ symbol, weightedScore: Math.round(score), reason: 'insufficient-bankroll' }); continue; }

      // Reserve this trade's margin against the running tally so a later
      // instrument in this same scan won't over-commit the bankroll.
      availableBalance -= requiredMargin;

      // Execute IMMEDIATELY at the analysis entry — exactly like the one-click
      // button, which is the behaviour that consistently wins.
      //
      // WHY: the old design staged a passive PENDING limit order and waited for
      // price to drift INTO the entry. For an ICT LONG the entry sits below
      // price, so the order only ever filled while price was FALLING through it
      // — i.e. with momentum running straight at the (nearby) stop — and for a
      // SHORT it filled while price was RISING into the stop. The result was a
      // 100% stop-out rate (every closed auto-trade exited exactly at its stop).
      // Opening at market now, while the setup is fresh and confirmed, gives the
      // trade the same head-start the one-click/manual trades get and removes the
      // "catching a falling knife" fill. Margin is reserved immediately, just
      // like a one-click trade.
      await prisma.demoTrade.create({
        data: {
          userId,
          instrumentId: instrument.id,
          symbol,
          direction,
          source: 'AUTO',
          entryPrice: entry,
          stopLoss: stop,
          takeProfit: tp,
          positionSize,
          margin: round2(requiredMargin),
          riskReward: setup.riskReward,
          aiScore: score,
          confluences: JSON.stringify(setup.confluences),
          timeframe,
          status: 'OPEN',
          notes: `Auto-generated (score ${Math.round(score)}). Filled at live price ${entry} (setup entry ${setupEntry}); setup was still fresh.`,
        },
      });
      created++;
      details.push({ symbol, direction, score: Math.round(score), entry, stop, tp, positionSize });
    } catch (err) {
      skipped++;
      console.warn(`runAutoTrade: ${symbol} skipped:`, (err as Error)?.message);
    }
  }

  return { created, scanned, skipped, details, diagnostics };
}
