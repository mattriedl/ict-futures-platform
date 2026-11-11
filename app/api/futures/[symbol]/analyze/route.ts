export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/authz';
import { decodeSymbol } from '@/lib/symbols';
import { prisma } from '@/lib/prisma';
import { getSessionInfo } from '@/lib/yahoo-finance';
import { fetchMarketData } from '@/lib/market-data';
import { analyzeICT, scoreConfluence, generateTradeSetup } from '@/lib/ict-engine';
import { deriveAssetClass, biasToDirection, computeWeightedScore } from '@/lib/setup-stats';
import { fetchLiveQuote } from '@/lib/live-quote';

export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } }
) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const userId = auth.user.id;
  try {
    const symbol    = decodeSymbol(params?.symbol);
    const timeframe = request.nextUrl.searchParams.get('timeframe') ?? '15m';

    const bars      = await fetchMarketData(symbol, timeframe);
    const unavailable = bars.length === 0;
    const patterns  = analyzeICT(bars);
    const confluence = scoreConfluence(patterns, bars);
    const setup     = generateTradeSetup(bars, patterns);
    const sessionInfo = getSessionInfo();

    const lastBar = bars?.[bars.length - 1];

    // Reported current price should match the live, timeframe-independent header
    // quote. Best-effort: fall back to the last candle close on any failure.
    let currentPrice = lastBar?.close ?? 0;
    try {
      const liveQuote = await fetchLiveQuote(symbol);
      if (liveQuote && !liveQuote.stale && liveQuote.price != null) {
        currentPrice = liveQuote.price;
      }
    } catch {
      // keep candle-derived fallback
    }

    // Bias from higher-timeframe structure (see lib/ict-engine/ict-score.ts).
    const bias = confluence.bias;

    // Pattern breakdown by type
    const patternBreakdown: Record<string, number> = {};
    for (const p of patterns) {
      patternBreakdown[p.type] = (patternBreakdown[p.type] ?? 0) + 1;
    }

    // Learning store: enrich the setup with a learning-adjusted (weighted) score
    // and log it for later outcome linkage. Both are best-effort and never break
    // the analyze response.
    let enrichedSetup: any = setup;
    if (setup && typeof setup.aiScore === 'number' && setup.aiScore >= 20) {
      const assetClass = deriveAssetClass(symbol);
      const direction  = biasToDirection(setup.direction ?? bias);
      const confluences: string[] = Array.isArray(setup.confluences) ? setup.confluences : [];

      // Weighted score (blends raw aiScore with empirical hit-rate of matches).
      let weighted;
      try {
        weighted = await computeWeightedScore({ assetClass, timeframe, confluences }, setup.aiScore);
      } catch {
        weighted = { weightedScore: Math.round(setup.aiScore), scoreBasis: { sampleSize: 0, matchedHitRatePercent: null, weight: 0, basis: 'none' as const } };
      }
      enrichedSetup = {
        ...setup,
        weightedScore: weighted.weightedScore,
        scoreBasis: weighted.scoreBasis,
      };

      // Best-effort log with light dedupe (skip if a matching un-resolved setup
      // was logged for the same symbol+timeframe+bias in the last 15 minutes).
      try {
        const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
        const recent = await prisma.setupLog.findFirst({
          where: {
            symbol,
            timeframe,
            bias,
            outcome: null,
            detectedAt: { gte: fifteenMinAgo },
            userId,
          },
          select: { id: true },
        });
        if (!recent) {
          await prisma.setupLog.create({
            data: {
              userId,
              symbol,
              assetClass,
              timeframe,
              bias,
              direction,
              aiScore: setup.aiScore,
              confluences: JSON.stringify(confluences),
              entryPrice: setup.entryPrice ?? null,
              stopLoss: setup.stopLoss ?? null,
              takeProfit: setup.takeProfit ?? null,
            },
          });
        }
      } catch (logErr) {
        console.error('SetupLog write skipped:', (logErr as Error)?.message);
      }
    }

    return NextResponse.json({
      symbol,
      timeframe,
      unavailable,
      currentPrice:     currentPrice,
      patterns,
      confluence,
      setup: enrichedSetup,
      bias,
      session:          sessionInfo,
      patternsCount:    patterns.length,
      patternBreakdown,
      timestamp:        Date.now(),
    });
  } catch (error: any) {
    console.error('Analysis error:', error);
    return NextResponse.json({ error: error?.message ?? 'Analysis failed' }, { status: 500 });
  }
}
