// Return-risk classifier (Phase 4) — the 4th pillar, "predict the return before it
// happens". A real logistic-regression model predicts P(return) for a specific
// product VARIANT from named features; a deterministic policy turns that probability
// + a reason distribution into the ReturnRiskPrediction the UI already renders, and
// into the specific nudge. Model predicts; logic acts. Trained on a seeded synthetic
// dataset now; same interface as a hosted SageMaker/Personalize model in prod.

import type { ItemCategory } from './sell.js';
import type { ReturnReasonShare, ReturnRiskLevel } from './prevention.js';
import { trainLogReg, type LogRegModel } from './ml/logreg.js';

// Per-category baseline return propensity (catalog/Personalize prior in prod).
const CATEGORY_RETURN_PRIOR: Record<ItemCategory, number> = {
  fashion: 0.24,
  sports: 0.16,
  electronics: 0.1,
  toys: 0.1,
  home: 0.08,
  other: 0.1,
  books: 0.05,
};

/** Named features the classifier reads (the production Feature Store row). */
export interface RiskFeatures {
  categoryPrior: number; // 0..1 baseline return rate for the category
  sized: number; // 1 if a fashion/footwear sized variant, else 0
  sizeExtremity: number; // 0 (median size) … 1 (smallest/largest offered)
  belowMedianSize: number; // 1 if this size is below the median (drives "runs small")
  priceBandNorm: number; // 0..1 normalized price (higher → more deliberation/returns)
  ratingDeficit: number; // (5 - rating)/5, 0..1
  userReturnPropensity: number; // the SIGNED-IN user's own past return rate (privacy-safe)
}

export interface RiskInput {
  category: ItemCategory;
  sizeIndex?: number; // position in the size list (0-based)
  sizeCount?: number; // number of sizes offered
  priceCents: number;
  rating: number; // 0..5
  ratingCount: number;
  userReturnRate?: number; // 0..1, defaults to a neutral prior
}

const NEUTRAL_USER_RETURN = 0.15;
const PRICE_BAND_MAX_CENTS = 5_000_000; // ₹50k reference (linear normalization)

export function featuresFor(input: RiskInput): RiskFeatures {
  const sized = input.sizeIndex !== undefined && input.sizeCount && input.sizeCount > 1 ? 1 : 0;
  let sizeExtremity = 0;
  let belowMedianSize = 0;
  if (sized && input.sizeCount && input.sizeIndex !== undefined) {
    const mid = (input.sizeCount - 1) / 2;
    sizeExtremity = mid > 0 ? Math.abs(input.sizeIndex - mid) / mid : 0;
    belowMedianSize = input.sizeIndex < mid ? 1 : 0;
  }
  return {
    categoryPrior: CATEGORY_RETURN_PRIOR[input.category],
    sized,
    sizeExtremity,
    belowMedianSize,
    priceBandNorm: Math.min(1, input.priceCents / PRICE_BAND_MAX_CENTS),
    ratingDeficit: Math.max(0, (5 - input.rating) / 5),
    userReturnPropensity: input.userReturnRate ?? NEUTRAL_USER_RETURN,
  };
}

// Feature order the logreg consumes.
function featureRow(f: RiskFeatures): number[] {
  return [
    f.categoryPrior,
    f.sized * f.sizeExtremity, // extremity only matters for sized items
    f.priceBandNorm,
    f.ratingDeficit,
    f.userReturnPropensity,
  ];
}

// --- Seeded synthetic data-generating process --------------------------------
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

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

const CATEGORIES: readonly ItemCategory[] = ['fashion', 'sports', 'electronics', 'toys', 'home', 'other', 'books'];

export interface RiskRow {
  features: RiskFeatures;
  returned: 0 | 1;
}

/** Generate labelled rows from the seeded DGP (the "true" return process). */
export function generateRiskDataset(n = 600, seed = 7): RiskRow[] {
  const rnd = mulberry32(seed);
  const rows: RiskRow[] = [];
  for (let i = 0; i < n; i += 1) {
    const category = CATEGORIES[Math.floor(rnd() * CATEGORIES.length)]!;
    const sizeCount = category === 'fashion' || category === 'sports' ? 4 + Math.floor(rnd() * 4) : 1;
    const sizeIndex = sizeCount > 1 ? Math.floor(rnd() * sizeCount) : undefined;
    const features = featuresFor({
      category,
      sizeIndex,
      sizeCount,
      priceCents: Math.round((500 + rnd() * 4_000_00) * 100),
      rating: 3 + rnd() * 2,
      ratingCount: Math.round(5 + rnd() * 5000),
      userReturnRate: Math.max(0, Math.min(0.6, 0.15 + (rnd() - 0.5) * 0.4)),
    });
    // True logit — what actually drives returns (the model must recover this).
    // Calibrated so typical return rates are realistic (~8–15%, extremes ~30–50%).
    const logit =
      -3.2 +
      2.0 * features.categoryPrior +
      2.6 * features.sized * features.sizeExtremity +
      1.0 * features.ratingDeficit +
      0.6 * features.priceBandNorm +
      1.6 * (features.userReturnPropensity - NEUTRAL_USER_RETURN);
    const p = sigmoid(logit);
    rows.push({ features, returned: rnd() < p ? 1 : 0 });
  }
  return rows;
}

export function trainTestSplitRisk(rows: RiskRow[]): { train: RiskRow[]; test: RiskRow[] } {
  const train: RiskRow[] = [];
  const test: RiskRow[] = [];
  rows.forEach((r, i) => (i % 5 === 0 ? test : train).push(r));
  return { train, test };
}

let cached: LogRegModel | null = null;
export function getRiskModel(): LogRegModel {
  if (!cached) {
    const { train } = trainTestSplitRisk(generateRiskDataset());
    cached = trainLogReg(train.map((r) => featureRow(r.features)), train.map((r) => r.returned));
  }
  return cached;
}

/** P(return) for a variant from its features. */
export function predictReturnProb(features: RiskFeatures): number {
  return getRiskModel().predict(featureRow(features));
}

/** Map a probability to the UI risk band. */
export function riskLevelFor(prob: number): ReturnRiskLevel {
  if (prob >= 0.3) return 'high';
  if (prob >= 0.15) return 'moderate';
  return 'low';
}

/** Confidence grows with how much history backs the prediction. */
export function confidenceFor(ratingCount: number): number {
  return Math.min(0.95, 0.55 + Math.log10(1 + ratingCount) / 10);
}

/** Deterministic reason split (glass-box) from the features, largest share first. */
export function reasonDistribution(f: RiskFeatures): ReturnReasonShare[] {
  const weights: Record<string, number> = {};
  if (f.sized) {
    const fitWeight = 0.4 + 0.5 * f.sizeExtremity;
    if (f.belowMedianSize) weights['Runs small'] = fitWeight;
    else weights['Runs large'] = fitWeight;
    weights['Wrong fit'] = 0.3;
  }
  weights['Quality / defect'] = 0.15 + 0.6 * f.ratingDeficit;
  weights['Changed mind'] = 0.2 + 0.4 * f.priceBandNorm;

  const total = Object.values(weights).reduce((s, w) => s + w, 0) || 1;
  return Object.entries(weights)
    .map(([reason, w]) => ({ reason, share: w / total }))
    .sort((a, b) => b.share - a.share);
}
