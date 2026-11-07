import { prisma } from '@/lib/prisma';

/**
 * Learning / history store analytics.
 *
 * Computes empirical hit-rates from resolved SetupLog rows (grouped by asset
 * class, timeframe and individual confluence tag) and blends them into the raw
 * AI score using a shrinkage/confidence weight so tiny samples barely move the
 * score. Fully portable — reads only from the shared Prisma DB.
 */

// Shrinkage constant: weight = n / (n + K). Larger K -> more evidence needed
// before the empirical hit-rate meaningfully overrides the raw score.
const SHRINKAGE_K = 10;
// Minimum resolved samples before we adjust the score at all.
const MIN_SAMPLES = 5;

export type AssetClass = 'futures' | 'forex' | 'crypto';

/** Derive the asset class purely from the symbol suffix. */
export function deriveAssetClass(symbol: string): AssetClass {
  const s = (symbol ?? '').toUpperCase();
  if (s.endsWith('=X')) return 'forex';
  if (s.endsWith('=F')) return 'futures';
  return 'crypto'; // crypto spot symbols end in -USDT / USD
}

/** Map a directional bias to a LONG/SHORT direction. */
export function biasToDirection(bias: string): 'LONG' | 'SHORT' {
  return (bias ?? '').toUpperCase() === 'BEARISH' ? 'SHORT' : 'LONG';
}

export interface HitRateBucket {
  key: string;
  wins: number;
  total: number;      // resolved sample size
  hitRate: number;    // 0..1
  hitRatePercent: number; // 0..100 (rounded 1dp)
}

export interface SetupStats {
  totalResolved: number;
  totalWins: number;
  overallHitRatePercent: number;
  byAssetClass: HitRateBucket[];
  byTimeframe: HitRateBucket[];
  byConfluence: HitRateBucket[]; // sorted by hitRate desc
  topConfluences: HitRateBucket[];
  bottomConfluences: HitRateBucket[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function bucketFrom(map: Map<string, { wins: number; total: number }>): HitRateBucket[] {
  const out: HitRateBucket[] = [];
  for (const [key, v] of Array.from(map.entries())) {
    const hitRate = v.total > 0 ? v.wins / v.total : 0;
    out.push({
      key,
      wins: v.wins,
      total: v.total,
      hitRate,
      hitRatePercent: round1(hitRate * 100),
    });
  }
  return out;
}

function parseConfluences(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((c) => String(c));
  } catch {
    // Fall back to comma-separated string.
    return String(raw).split(',').map((c) => c.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Aggregate hit-rate statistics across all RESOLVED setup logs. Single query,
 * folded in JS. Buckets with a very small confluence sample can still be shown
 * (sample size is always returned so the UI can qualify the reading).
 */
export async function getSetupStats(): Promise<SetupStats> {
  const rows = await prisma.setupLog.findMany({
    where: { outcome: { in: ['WIN', 'LOSS'] } },
    select: { assetClass: true, timeframe: true, confluences: true, outcome: true },
  });

  const byAsset = new Map<string, { wins: number; total: number }>();
  const byTf = new Map<string, { wins: number; total: number }>();
  const byConf = new Map<string, { wins: number; total: number }>();

  let totalWins = 0;
  for (const r of rows) {
    const win = r.outcome === 'WIN';
    if (win) totalWins++;

    const a = byAsset.get(r.assetClass) ?? { wins: 0, total: 0 };
    a.total++; if (win) a.wins++; byAsset.set(r.assetClass, a);

    const t = byTf.get(r.timeframe) ?? { wins: 0, total: 0 };
    t.total++; if (win) t.wins++; byTf.set(r.timeframe, t);

    for (const tag of parseConfluences(r.confluences)) {
      const c = byConf.get(tag) ?? { wins: 0, total: 0 };
      c.total++; if (win) c.wins++; byConf.set(tag, c);
    }
  }

  const total = rows.length;
  const byConfluence = bucketFrom(byConf).sort((x, y) => y.hitRate - x.hitRate);
  // Only rank confluence tags that have a minimally meaningful sample.
  const rankable = byConfluence.filter((b) => b.total >= 3);

  return {
    totalResolved: total,
    totalWins,
    overallHitRatePercent: total > 0 ? round1((totalWins / total) * 100) : 0,
    byAssetClass: bucketFrom(byAsset).sort((x, y) => y.hitRate - x.hitRate),
    byTimeframe: bucketFrom(byTf).sort((x, y) => y.total - x.total),
    byConfluence,
    topConfluences: rankable.slice(0, 5),
    bottomConfluences: rankable.slice().reverse().slice(0, 5),
  };
}

export interface ScoreBasis {
  sampleSize: number;       // resolved samples matching the cohort
  matchedHitRatePercent: number | null; // empirical hit-rate of matching setups (0..100) or null
  weight: number;           // shrinkage weight applied (0..1)
  basis: 'assetClass+timeframe' | 'assetClass' | 'none';
}

export interface WeightedScoreResult {
  weightedScore: number;
  scoreBasis: ScoreBasis;
}

/**
 * Blend a fresh setup's raw AI score with the empirical hit-rate of matching
 * historical (resolved) setups. Uses a shrinkage weight n/(n+K) and only adjusts
 * once at least MIN_SAMPLES resolved matches exist. Prefers the tighter
 * assetClass+timeframe cohort, falling back to assetClass-only when that cohort
 * is too small.
 */
export async function computeWeightedScore(
  features: { assetClass: string; timeframe: string; confluences?: string[] },
  rawScore: number,
): Promise<WeightedScoreResult> {
  const raw = Number.isFinite(rawScore) ? rawScore : 0;
  const none: WeightedScoreResult = {
    weightedScore: Math.round(raw),
    scoreBasis: { sampleSize: 0, matchedHitRatePercent: null, weight: 0, basis: 'none' },
  };

  try {
    // Tight cohort: same asset class AND timeframe.
    const tightRows = await prisma.setupLog.findMany({
      where: {
        outcome: { in: ['WIN', 'LOSS'] },
        assetClass: features.assetClass,
        timeframe: features.timeframe,
      },
      select: { outcome: true },
    });

    let rows = tightRows;
    let basis: ScoreBasis['basis'] = 'assetClass+timeframe';

    if (tightRows.length < MIN_SAMPLES) {
      // Fall back to a broader asset-class cohort.
      const broadRows = await prisma.setupLog.findMany({
        where: { outcome: { in: ['WIN', 'LOSS'] }, assetClass: features.assetClass },
        select: { outcome: true },
      });
      rows = broadRows;
      basis = 'assetClass';
    }

    const n = rows.length;
    if (n < MIN_SAMPLES) return none;

    const wins = rows.filter((r) => r.outcome === 'WIN').length;
    const hitRate = wins / n;           // 0..1
    const hitRatePct = hitRate * 100;   // 0..100
    const weight = n / (n + SHRINKAGE_K);

    const blended = raw * (1 - weight) + hitRatePct * weight;
    const weightedScore = Math.max(0, Math.min(100, Math.round(blended)));

    return {
      weightedScore,
      scoreBasis: {
        sampleSize: n,
        matchedHitRatePercent: round1(hitRatePct),
        weight: Math.round(weight * 100) / 100,
        basis,
      },
    };
  } catch {
    return none;
  }
}
