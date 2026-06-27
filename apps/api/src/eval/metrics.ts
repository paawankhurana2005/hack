// Pure metric functions over the synthetic seed. Each calls the REAL deterministic
// engine it measures — no logic is duplicated here, so the numbers reflect shipped
// behavior. Later phases (ML pricing, risk classifier) plug into the same functions.

import {
  ABSTAIN_THRESHOLD,
  CONFIDENCE_TEMPERATURE,
  assessDrift,
  auc,
  buildCorpus,
  calibrateConfidence,
  decideRoute,
  evByPath,
  flywheelStats,
  generateDataset,
  generateRiskDataset,
  getPriceModel,
  gradeToOrdinal,
  isGrounded,
  predictReturnProb,
  retrieve,
  sampleChains,
  trainTestSplit,
  trainTestSplitRisk,
  type FlywheelStats,
  type RufusContext,
} from '@reloop/shared';
import { aggregate } from '../services/grading/grading-service.js';
import { clampRetail, resalePolicy } from '../services/pricing/pricing-service.js';
import { computeRouting } from '../lib/routing-engine.js';
import {
  CALIBRATION_CASES,
  GRADING_CASES,
  PRICING_CASES,
  ROUTING_CASES,
  ROUTING_EV_CASES,
  type CalibrationPoint,
  type GradingCase,
  type PricingCase,
  type RoutingCase,
} from './seed.js';

export interface GradingMetrics {
  n: number;
  exactAccuracy: number; // 0..1
  within1Accuracy: number; // 0..1 (off-by-one grade still "close")
  abstentionRate: number; // 0..1 (share flagged for human review)
}

export interface PricingMetrics {
  n: number;
  maeRupees: number; // mean absolute error vs true resale price
  mapePct: number; // mean absolute percentage error
  intervalCoverage: string; // n/a until Phase 2 ships prediction intervals
}

export interface RoutingMetrics {
  n: number;
  accuracy: number; // 0..1 conformance to the labelled policy
  mismatches: { id: string; expected: string; got: string }[];
}

export interface RoutingEvMetrics {
  n: number;
  optimality: number; // share where the engine picked the argmax-EV viable path
  distinctPaths: number; // how many different paths the EV layer chose (variety)
  chosen: string[]; // the path chosen per case (shows EV actually varies)
}

export interface CalibrationMetrics {
  n: number;
  temperature: number; // the pinned T used in production (shared)
  gridBestTemperature: number; // T that minimizes ECE on this seed
  eceBefore: number; // expected calibration error, raw
  eceAfter: number; // ECE after temperature scaling with the pinned T
  brierBefore: number;
  brierAfter: number;
}

export interface PricingModelMetrics {
  n: number; // held-out test rows
  // MAE in "percentage points of original retail" (ratio MAE × 100).
  modelMaePp: number;
  baselineMaePp: number; // the grade-factor policy on the same test set
  improvementPct: number; // how much the model beats the baseline
  intervalCoverage: number; // share of true ratios inside the predicted band
  nominalCoverage: number; // the band's target (≈0.80)
}

export interface ReturnRiskMetrics {
  n: number; // held-out test rows
  auc: number; // logistic-regression classifier AUC
  baselineAuc: number; // category-prior-only AUC (what the model must beat)
}

export interface RufusGroundingMetrics {
  checks: number;
  passed: number; // grounded answer accepted + hallucinated answer rejected
}

export interface DriftMetrics {
  psiStable: number; // PSI on an unchanged distribution (≈0)
  actionStable: string; // → continue
  psiShifted: number; // PSI on a shifted distribution (high)
  actionShifted: string; // → fallback
}

export interface EvalReport {
  generatedAt: string;
  dataset: 'synthetic-seed';
  grading: GradingMetrics;
  calibration: CalibrationMetrics;
  pricing: PricingMetrics;
  pricingModel: PricingModelMetrics;
  routing: RoutingMetrics;
  routingEv: RoutingEvMetrics;
  returnRisk: ReturnRiskMetrics;
  flywheel: FlywheelStats;
  rufusGrounding: RufusGroundingMetrics;
  drift: DriftMetrics;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

export function gradingMetrics(cases: GradingCase[] = GRADING_CASES): GradingMetrics {
  let exact = 0;
  let within1 = 0;
  let abstained = 0;
  for (const c of cases) {
    const merged = aggregate(c.angles);
    // Abstain on the CALIBRATED confidence — same policy the service ships.
    if (calibrateConfidence(merged.confidence) < ABSTAIN_THRESHOLD) abstained += 1;
    if (merged.grade === c.truth) exact += 1;
    if (Math.abs(gradeToOrdinal(merged.grade) - gradeToOrdinal(c.truth)) <= 1) within1 += 1;
  }
  const n = cases.length;
  return {
    n,
    exactAccuracy: exact / n,
    within1Accuracy: within1 / n,
    abstentionRate: abstained / n,
  };
}

/** Expected Calibration Error over equal-width confidence bins. */
function ece(points: CalibrationPoint[], bins = 5): number {
  const total = points.length;
  if (total === 0) return 0;
  let err = 0;
  for (let b = 0; b < bins; b += 1) {
    const lo = b / bins;
    const hi = (b + 1) / bins;
    const inBin = points.filter((p) => p.confidence > lo && p.confidence <= hi);
    if (inBin.length === 0) continue;
    const meanConf = mean(inBin.map((p) => p.confidence));
    const acc = inBin.filter((p) => p.correct).length / inBin.length;
    err += (inBin.length / total) * Math.abs(meanConf - acc);
  }
  return err;
}

function brier(points: CalibrationPoint[]): number {
  return mean(points.map((p) => (p.confidence - (p.correct ? 1 : 0)) ** 2));
}

function scale(points: CalibrationPoint[], t: number): CalibrationPoint[] {
  return points.map((p) => ({ confidence: calibrateConfidence(p.confidence, t), correct: p.correct }));
}

export function calibrationMetrics(points: CalibrationPoint[] = CALIBRATION_CASES): CalibrationMetrics {
  // Grid-search the temperature that minimizes ECE on the seed (how the pinned
  // CONFIDENCE_TEMPERATURE was chosen; re-run on real data in prod).
  let gridBestTemperature = 1;
  let bestEce = Infinity;
  for (let t = 0.5; t <= 3.0 + 1e-9; t += 0.1) {
    const e = ece(scale(points, t));
    if (e < bestEce) {
      bestEce = e;
      gridBestTemperature = Math.round(t * 10) / 10;
    }
  }
  const calibrated = scale(points, CONFIDENCE_TEMPERATURE);
  return {
    n: points.length,
    temperature: CONFIDENCE_TEMPERATURE,
    gridBestTemperature,
    eceBefore: ece(points),
    eceAfter: ece(calibrated),
    brierBefore: brier(points),
    brierAfter: brier(calibrated),
  };
}

export function pricingMetrics(cases: PricingCase[] = PRICING_CASES): PricingMetrics {
  const absErr: number[] = [];
  const pctErr: number[] = [];
  for (const c of cases) {
    const { suggestedCents } = resalePolicy(clampRetail(c.retailCents), c.grade, c.demand);
    const err = Math.abs(suggestedCents - c.truthResaleCents);
    absErr.push(err);
    pctErr.push(err / c.truthResaleCents);
  }
  return {
    n: cases.length,
    maeRupees: Math.round(mean(absErr) / 100),
    mapePct: Math.round(mean(pctErr) * 1000) / 10,
    intervalCoverage: 'n/a until Phase 2',
  };
}

/** GBDT resale-ratio predictor vs the grade-factor baseline, on a held-out split. */
export function pricingModelMetrics(): PricingModelMetrics {
  const { test } = trainTestSplit(generateDataset());
  const model = getPriceModel(); // trained on the disjoint train split
  const modelErr: number[] = [];
  const baseErr: number[] = [];
  let covered = 0;
  for (const r of test) {
    const pred = model.predictRatio(r.features);
    modelErr.push(Math.abs(pred.ratio - r.trueRatio));
    // Baseline ratio = the grade-factor policy (retail-independent → use ₹1L probe).
    const baseRatio = resalePolicy(100_000, r.grade, r.demand).factor;
    baseErr.push(Math.abs(baseRatio - r.trueRatio));
    if (r.trueRatio >= pred.ratioLow && r.trueRatio <= pred.ratioHigh) covered += 1;
  }
  const modelMae = mean(modelErr);
  const baselineMae = mean(baseErr);
  return {
    n: test.length,
    modelMaePp: Math.round(modelMae * 1000) / 10,
    baselineMaePp: Math.round(baselineMae * 1000) / 10,
    improvementPct: Math.round(((baselineMae - modelMae) / baselineMae) * 1000) / 10,
    intervalCoverage: Math.round((covered / test.length) * 1000) / 1000,
    nominalCoverage: 0.8,
  };
}

export function routingMetrics(cases: RoutingCase[] = ROUTING_CASES): RoutingMetrics {
  let correct = 0;
  const mismatches: { id: string; expected: string; got: string }[] = [];
  for (const c of cases) {
    const got = computeRouting(c.inputs).decision;
    if (got === c.truth) correct += 1;
    else mismatches.push({ id: c.id, expected: c.truth, got });
  }
  return { n: cases.length, accuracy: correct / cases.length, mismatches };
}

/** EV optimality: the engine must pick the argmax-EV viable path (recomputed here
 *  independently), and the chosen path must actually vary with the economics. */
export function routingEvMetrics(): RoutingEvMetrics {
  let optimal = 0;
  const chosen: string[] = [];
  for (const profile of ROUTING_EV_CASES) {
    const decided = decideRoute(profile).decision;
    chosen.push(decided);
    const viable = evByPath(profile).filter((e) => e.viable);
    const argmax = viable.reduce((acc, e) => (e.evCents > acc.evCents ? e : acc));
    if (decided === argmax.path) optimal += 1;
  }
  return {
    n: ROUTING_EV_CASES.length,
    optimality: optimal / ROUTING_EV_CASES.length,
    distinctPaths: new Set(chosen).size,
    chosen,
  };
}

/** Return-risk classifier AUC on a held-out split vs a category-prior baseline. */
export function returnRiskMetrics(): ReturnRiskMetrics {
  const { test } = trainTestSplitRisk(generateRiskDataset());
  const labels = test.map((r) => r.returned);
  const scores = test.map((r) => predictReturnProb(r.features)); // model (trained on train)
  const baseline = test.map((r) => r.features.categoryPrior); // prior-only
  return {
    n: test.length,
    auc: Math.round(auc(scores, labels) * 1000) / 1000,
    baselineAuc: Math.round(auc(baseline, labels) * 1000) / 1000,
  };
}

/** Flywheel yield: labelled training rows the provenance chains produce. */
export function flywheelMetrics(): FlywheelStats {
  return flywheelStats(sampleChains());
}

/** Rufus grounding: a grounded answer must pass, a hallucinated one must be rejected. */
export function rufusGroundingMetrics(): RufusGroundingMetrics {
  const ctx: RufusContext = {
    title: 'Sony WH-1000XM5',
    category: 'electronics',
    grade: 'good',
    confidence: 0.8,
    summary: 'Light wear, fully functional.',
    detectedIssues: ['ear-pad wear'],
    authenticityVerified: true,
    listingPriceInr: 12000,
    originalPriceInr: 24990,
  };
  const facts = retrieve('why is it cheaper than new?', buildCorpus(ctx))
    .map((c) => c.text)
    .join('\n');
  const grounded = isGrounded('It is ₹12,000 — about 52% off ₹24,990 new.', facts); // all numbers backed
  const hallucinated = isGrounded('It has 99 hours of battery life.', facts); // 99 not in context
  let passed = 0;
  if (grounded) passed += 1; // accepted a supported answer
  if (!hallucinated) passed += 1; // rejected a fabricated number
  return { checks: 2, passed };
}

/** Drift watchdog: a stable distribution must say "continue", a shifted one "fallback". */
export function driftMetrics(): DriftMetrics {
  const ref = Array.from({ length: 200 }, (_, i) => (i % 100) / 100);
  const stable = Array.from({ length: 200 }, (_, i) => (i % 100) / 100);
  const shifted = ref.map((x) => Math.min(1, x + 0.4));
  const a = assessDrift(ref, stable);
  const b = assessDrift(ref, shifted);
  return { psiStable: a.psi, actionStable: a.action, psiShifted: b.psi, actionShifted: b.action };
}

export function runEval(): EvalReport {
  return {
    generatedAt: new Date().toISOString(),
    dataset: 'synthetic-seed',
    grading: gradingMetrics(),
    calibration: calibrationMetrics(),
    pricing: pricingMetrics(),
    pricingModel: pricingModelMetrics(),
    routing: routingMetrics(),
    routingEv: routingEvMetrics(),
    returnRisk: returnRiskMetrics(),
    flywheel: flywheelMetrics(),
    rufusGrounding: rufusGroundingMetrics(),
    drift: driftMetrics(),
  };
}
