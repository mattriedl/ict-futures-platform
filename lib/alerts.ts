// ---------------------------------------------------------------------------
// Setup alerts.
//
// Runs as part of the scheduled cycle (POST /api/demo/autotrade). For every user
// with alerts switched on (UserSettings.notificationsOn) it analyses that user's
// tracked instruments and raises an Alert when a setup:
//   - scores >= the user's alertMinScore (learning-weighted score), and
//   - contains at least one pattern type the user has alerts enabled for
//     (alertOnOB / alertOnFVG / alertOnLiqSweep / alertOnMSS / alertOnOTE).
// An alert for the same instrument + direction is not repeated within
// ALERT_COOLDOWN_MS. If the user enabled email alerts (and the admin's global
// switch is on and Gmail is configured) the alert is also emailed.
//
// REAL DATA ONLY: instruments whose feed returns no bars are simply skipped.
// ---------------------------------------------------------------------------

import { prisma } from '@/lib/prisma';
import { fetchMarketData } from '@/lib/market-data';
import { analyzeICT, generateTradeSetup, type TradeSetupResult } from '@/lib/ict-engine';
import { deriveAssetClass, computeWeightedScore } from '@/lib/setup-stats';
import { sendAlertEmail } from '@/lib/email';

export const ALERT_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4h per instrument+direction
const ALERT_TIMEFRAME = '15m';
const MAX_SYMBOLS_PER_USER = 20;

const TOGGLE_TO_PATTERN: Record<string, string> = {
  alertOnOB: 'ORDER_BLOCK',
  alertOnFVG: 'FVG',
  alertOnLiqSweep: 'LIQUIDITY_SWEEP',
  alertOnMSS: 'MSS_BOS',
  alertOnOTE: 'OTE',
};

type Analysis = { setup: TradeSetupResult | null; weightedScore: number | null };

export interface AlertScanResult {
  usersScanned: number;
  alertsCreated: number;
  emailsSent: number;
  details: { userId: string; symbol: string; direction: string; score: number }[];
}

export async function runAlertScan(): Promise<AlertScanResult> {
  const users = await prisma.userSettings.findMany({ where: { notificationsOn: true } });
  const result: AlertScanResult = { usersScanned: users.length, alertsCreated: 0, emailsSent: 0, details: [] };
  if (users.length === 0) return result;

  const appSettings = await prisma.appSettings.findUnique({ where: { id: 'global' } });
  const emailGloballyOn = appSettings?.emailAlertsEnabled !== false;

  // One analysis per symbol per cycle, shared by every user tracking it.
  const cache = new Map<string, Promise<Analysis>>();
  const analyse = (symbol: string): Promise<Analysis> => {
    let p = cache.get(symbol);
    if (!p) {
      p = (async (): Promise<Analysis> => {
        const bars = await fetchMarketData(symbol, ALERT_TIMEFRAME);
        if (!bars.length) return { setup: null, weightedScore: null };
        const setup = generateTradeSetup(bars, analyzeICT(bars));
        if (!setup) return { setup: null, weightedScore: null };
        let weightedScore = setup.aiScore;
        try {
          const w = await computeWeightedScore(
            { assetClass: deriveAssetClass(symbol), timeframe: ALERT_TIMEFRAME, confluences: setup.confluences },
            setup.aiScore,
          );
          weightedScore = w.weightedScore ?? setup.aiScore;
        } catch { /* keep raw */ }
        return { setup, weightedScore };
      })().catch((e) => {
        console.warn(`alerts: analysis failed for ${symbol}:`, (e as Error)?.message);
        return { setup: null, weightedScore: null };
      });
      cache.set(symbol, p);
    }
    return p;
  };

  for (const s of users) {
    const enabledPatterns = Object.entries(TOGGLE_TO_PATTERN)
      .filter(([toggle]) => (s as any)[toggle] !== false)
      .map(([, pattern]) => pattern);
    if (enabledPatterns.length === 0) continue;

    const symbols = Array.from(
      new Set((s.trackedSymbols ?? '').split(',').map((x) => x.trim()).filter(Boolean)),
    ).slice(0, MAX_SYMBOLS_PER_USER);

    for (const symbol of symbols) {
      try {
        const { setup, weightedScore } = await analyse(symbol);
        if (!setup || weightedScore == null) continue;
        if (weightedScore < (s.alertMinScore ?? 50)) continue;
        if (!setup.confluences.some((c) => enabledPatterns.includes(c))) continue;

        const direction = setup.direction; // BULLISH | BEARISH
        const type = 'SETUP';
        const instrument = await prisma.instrument.findUnique({ where: { symbol }, select: { id: true, name: true } });

        // Cooldown: one alert per user + instrument + direction per window.
        const recent = await prisma.alert.findFirst({
          where: {
            userId: s.userId,
            type,
            createdAt: { gte: new Date(Date.now() - ALERT_COOLDOWN_MS) },
            title: { startsWith: `${direction} setup on ${symbol}` },
          },
          select: { id: true },
        });
        if (recent) continue;

        const score = Math.round(weightedScore);
        const title = `${direction} setup on ${symbol} — score ${score}`;
        const message =
          `${instrument?.name ?? symbol}: ${setup.confluences.join(', ')}. ` +
          `Entry ${setup.entryPrice}, stop ${setup.stopLoss}, target ${setup.takeProfit} (R:R 1:${setup.riskReward}).`;

        await prisma.alert.create({
          data: {
            userId: s.userId,
            instrumentId: instrument?.id ?? null,
            type,
            title,
            message,
            aiScore: score,
            status: 'ACTIVE',
          },
        });
        result.alertsCreated++;
        result.details.push({ userId: s.userId, symbol, direction, score });

        if (emailGloballyOn && s.emailAlertsEnabled) {
          const user = await prisma.user.findUnique({ where: { id: s.userId }, select: { email: true } });
          const to = s.alertEmail || user?.email;
          if (to) {
            const sent = await sendAlertEmail({
              to,
              alert: {
                symbol,
                direction,
                aiScore: score,
                entryPrice: setup.entryPrice,
                stopLoss: setup.stopLoss,
                takeProfit: setup.takeProfit,
                title,
                message,
              },
            });
            if (sent.sent) result.emailsSent++;
          }
        }
      } catch (e) {
        console.warn(`alerts: ${symbol} for ${s.userId} skipped:`, (e as Error)?.message);
      }
    }
  }

  return result;
}
