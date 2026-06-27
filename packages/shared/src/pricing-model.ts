// The resale-price predictor (Phase 2) — the centerpiece. A real gradient-boosted
// regressor predicts the RESALE RATIO (clearing price ÷ original retail) from named
// condition/age/demand features, so the prediction is ANCHORED to the item's original
// Amazon listing price recorded in its provenance chain — a base reference only the
// platform that logged the first sale can supply. `clearingCents = ratio × retail`.
//
// Design rule intact: the model PREDICTS a ratio + an interval; the deterministic
// pricing policy (in apps/api) still owns the final number (floor/ceiling/rounding).
// Trained on a SEEDED SYNTHETIC dataset now; the same PriceModel interface is
// satisfied by a hosted SageMaker model in production. Deterministic + reproducible.

import type { ConditionGrade } from './common.js';
import type { DemandLevel, SellThroughPoint } from './pricing.js';
import { trainGbdt, type GbdtModel } from './ml/gbdt.js';
import { gradeToOrdinal } from './features.js';

/** Named feature inputs the model reads (the production Feature Store row). */
export interface PriceFeatures {
  gradeOrdinal: number; // 0 (poor) … 4 (new)
  maxSeverity: number; // worst issue severity 0..2
  severeCount: number; // # of severe issues
  completeness: number; // 0..1 (box / accessories / manual present)
  ageYears: number; // model age since first sale
  demandOrdinal: number; // 0 (low) / 1 / 2 (high)
  authenticityConfidence: number; // 0..1
}

/** Model output — a ratio band, never a bare point. */
export interface RatioPrediction {
  ratio: number;
  ratioLow: number;
  ratioHigh: number;
}

export interface PriceModel {
  predictRatio(features: PriceFeatures): RatioPrediction;
  /** Conformal band half-width (ratio space) — calibrated for ~80% coverage. */
  intervalHalfWidth: number;
}

// Fixed feature order the GBDT consumes (normalized to keep splits well-scaled).
function featureRow(f: PriceFeatures): number[] {
  return [
    f.gradeOrdinal / 4,
    f.maxSeverity / 2,
    Math.min(f.severeCount, 3) / 3,
    f.completeness,
    Math.min(f.ageYears, 8) / 8,
    f.demandOrdinal / 2,
    f.authenticityConfidence,
  ];
}

// --- Synthetic data-generating process --------------------------------------
// The "true" ratio depends on MORE than grade+demand (age, severity, completeness,
// authenticity) — exactly the signals the old grade-factor baseline ignores — so a
// model that reads them genuinely beats the baseline. Seeded → reproducible.

const GRADE_BY_ORDINAL: readonly ConditionGrade[] = ['poor', 'fair', 'good', 'like-new', 'new'];
const DEMAND_BY_ORDINAL: readonly DemandLevel[] = ['low', 'medium', 'high'];
const GRADE_RATIO: Record<ConditionGrade, number> = {
  poor: 0.22,
  fair: 0.4,
  good: 0.55,
  'like-new': 0.7,
  new: 0.82,
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export interface SyntheticRow {
  features: PriceFeatures;
  grade: ConditionGrade;
  demand: DemandLevel;
  trueRatio: number;
}

/** Generate N labelled rows from the seeded DGP. */
export function generateDataset(n = 480, seed = 1234): SyntheticRow[] {
  const rnd = mulberry32(seed);
  const rows: SyntheticRow[] = [];
  for (let i = 0; i < n; i += 1) {
    const gradeOrdinal = Math.floor(rnd() * 5);
    const demandOrdinal = Math.floor(rnd() * 3);
    const grade = GRADE_BY_ORDINAL[gradeOrdinal]!;
    const demand = DEMAND_BY_ORDINAL[demandOrdinal]!;
    const maxSeverity = gradeOrdinal <= 1 ? 1 + Math.floor(rnd() * 2) : Math.floor(rnd() * 3);
    const severeCount = maxSeverity === 2 ? Math.floor(rnd() * 3) : 0;
    const completeness = 0.5 + rnd() * 0.5; // 0.5..1.0
    const ageYears = rnd() * 6; // 0..6 yrs
    const authenticityConfidence = 0.7 + rnd() * 0.3; // 0.7..1.0

    const completenessMult = 0.88 + completeness * 0.17; // 0.88..1.05
    const demandMult = 0.93 + demandOrdinal * 0.075; // 0.93/1.005/1.08
    const authMult = authenticityConfidence < 0.8 ? 0.85 : 1;
    const noise = (rnd() - 0.5) * 0.05; // ±2.5%

    const ratio = clamp(
      GRADE_RATIO[grade] *
        (1 - 0.1 * (maxSeverity / 2)) *
        (1 - 0.05 * Math.min(severeCount, 3)) *
        completenessMult *
        (1 - 0.04 * ageYears) *
        demandMult *
        authMult +
        noise,
      0.05,
      0.95,
    );

    rows.push({
      features: { gradeOrdinal, maxSeverity, severeCount, completeness, ageYears, demandOrdinal, authenticityConfidence },
      grade,
      demand,
      trueRatio: ratio,
    });
  }
  return rows;
}

/** Deterministic 80/20 split by index (reproducible). */
export function trainTestSplit(rows: SyntheticRow[]): { train: SyntheticRow[]; test: SyntheticRow[] } {
  const train: SyntheticRow[] = [];
  const test: SyntheticRow[] = [];
  rows.forEach((r, i) => (i % 5 === 0 ? test : train).push(r));
  return { train, test };
}

/** Empirical quantile (linear, clamped) of a numeric array. */
function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * (sorted.length + 1)) - 1));
  return sorted[idx]!;
}

function buildModel(train: SyntheticRow[]): PriceModel {
  // Split train into a FIT set (model) and a CALIBRATION set (interval). The band
  // is the 80th-percentile absolute residual on held-out calibration data
  // (split-conformal prediction) — so ~80% coverage holds by construction, instead
  // of the optimistic band you'd get from in-sample (training) residuals.
  const fit = train.filter((_, i) => i % 5 !== 0);
  const cal = train.filter((_, i) => i % 5 === 0);

  const X = fit.map((r) => featureRow(r.features));
  const y = fit.map((r) => r.trueRatio);
  const gbdt: GbdtModel = trainGbdt(X, y);

  const calResiduals = cal.map((r) => Math.abs(r.trueRatio - gbdt.predict(featureRow(r.features))));
  const intervalHalfWidth = quantile(calResiduals, 0.8);

  return {
    intervalHalfWidth,
    predictRatio(features: PriceFeatures): RatioPrediction {
      const ratio = clamp(gbdt.predict(featureRow(features)), 0.05, 0.95);
      return {
        ratio,
        ratioLow: clamp(ratio - intervalHalfWidth, 0.03, 0.95),
        ratioHigh: clamp(ratio + intervalHalfWidth, 0.05, 0.97),
      };
    },
  };
}

// Train once, lazily (so importing this in the web bundle costs nothing until used).
let cached: PriceModel | null = null;
export function getPriceModel(): PriceModel {
  if (!cached) cached = buildModel(trainTestSplit(generateDataset()).train);
  return cached;
}

/** Build PriceFeatures from grade/demand ordinals + optional condition signals. */
export function priceFeaturesFrom(input: {
  gradeOrdinal: number;
  demandOrdinal: number;
  maxSeverity?: number;
  severeCount?: number;
  completeness?: number;
  ageYears?: number;
  authenticityConfidence?: number;
}): PriceFeatures {
  return {
    gradeOrdinal: input.gradeOrdinal,
    demandOrdinal: input.demandOrdinal,
    maxSeverity: input.maxSeverity ?? 0,
    severeCount: input.severeCount ?? 0,
    completeness: input.completeness ?? 0.9,
    ageYears: input.ageYears ?? 1,
    authenticityConfidence: input.authenticityConfidence ?? 0.95,
  };
}

export { gradeToOrdinal };

// --- Sell-through curve (deterministic price ↔ time-to-sell) ------------------

const DEMAND_LIQUIDITY: Record<DemandLevel, number> = { low: 0.6, medium: 1, high: 1.5 };
const BASE_DAYS = 8; // days to sell at the clearing price under medium demand
const PRICE_ELASTICITY = 3; // how sharply days rise as price exceeds clearing

/** Expected days-to-sell at `priceCents` given the model's clearing price + demand. */
export function expectedDaysToSell(priceCents: number, clearingCents: number, demand: DemandLevel): number {
  const rel = clearingCents > 0 ? priceCents / clearingCents : 1;
  const days = (BASE_DAYS / DEMAND_LIQUIDITY[demand]) * rel ** PRICE_ELASTICITY;
  return Math.max(1, Math.round(days));
}

/** Three price points around the clearing price, each with days + 30-day sell-through. */
export function sellThroughCurve(
  clearingCents: number,
  demand: DemandLevel,
  round: (cents: number) => number,
): SellThroughPoint[] {
  const points: { label: SellThroughPoint['label']; mult: number }[] = [
    { label: 'aggressive', mult: 0.9 },
    { label: 'recommended', mult: 1.0 },
    { label: 'patient', mult: 1.12 },
  ];
  return points.map(({ label, mult }) => {
    const priceCents = round(clearingCents * mult);
    const expectedDays = expectedDaysToSell(priceCents, clearingCents, demand);
    return {
      label,
      priceCents,
      expectedDays,
      sellThroughProb: Math.round((1 - Math.exp(-30 / expectedDays)) * 100) / 100,
    };
  });
}
