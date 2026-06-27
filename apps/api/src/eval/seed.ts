// SYNTHETIC, hand-labelled seed data for the offline eval harness. These are NOT
// real measurements — they are plausible, deterministic fixtures with ground-truth
// labels so we can baseline the deterministic decision layers (grading aggregation,
// the resale-price policy, the routing rules) and prove later ML phases beat them.
// Every metric derived from this set is reported labelled "(synthetic seed, N=…)".
//
// Production training path: replace these fixtures with labelled rows harvested from
// the provenance flywheel (each graded/sold/routed event is a labelled example) and
// run the same metric functions — the contract stays identical.

import type { ConditionGrade, DemandLevel, ReturnRoutingDecision, RoutingEvProfile } from '@reloop/shared';
import type { VlmAssessment } from '../services/grading/types.js';
import type { RoutingInputs } from '../lib/routing-engine.js';

// --- Grading: per-angle assessments + the true overall grade -----------------
// The worst-angle rule means the truth is the lowest-severity angle.
export interface GradingCase {
  id: string;
  angles: VlmAssessment[];
  truth: ConditionGrade;
}

function a(grade: ConditionGrade, confidence: number, issues: string[] = []): VlmAssessment {
  return {
    grade,
    confidence,
    detectedIssues: issues,
    structuredIssues: issues.map((type) => ({ type, severity: 'moderate' as const, region: 'unspecified' })),
    photoQuality: 'clear',
    summary: `${grade} angle`,
  };
}

export const GRADING_CASES: GradingCase[] = [
  { id: 'g1', angles: [a('new', 0.9), a('new', 0.88)], truth: 'new' },
  { id: 'g2', angles: [a('new', 0.8), a('like-new', 0.7)], truth: 'like-new' },
  { id: 'g3', angles: [a('like-new', 0.75), a('good', 0.7, ['light scuff'])], truth: 'good' },
  { id: 'g4', angles: [a('good', 0.7), a('good', 0.72), a('fair', 0.6, ['scratch'])], truth: 'fair' },
  { id: 'g5', angles: [a('fair', 0.6, ['crack']), a('poor', 0.7, ['deep crack'])], truth: 'poor' },
  { id: 'g6', angles: [a('new', 0.92)], truth: 'new' },
  { id: 'g7', angles: [a('good', 0.68), a('good', 0.66)], truth: 'good' },
  { id: 'g8', angles: [a('like-new', 0.8), a('like-new', 0.78), a('good', 0.7)], truth: 'good' },
  { id: 'g9', angles: [a('fair', 0.55, ['stain']), a('fair', 0.58)], truth: 'fair' },
  { id: 'g10', angles: [a('poor', 0.75, ['shattered'])], truth: 'poor' },
  // Low-confidence: the aggregate sits below the abstain threshold → expect abstain.
  { id: 'g11', angles: [a('fair', 0.4), a('good', 0.45)], truth: 'fair' },
  { id: 'g12', angles: [a('good', 0.5), a('like-new', 0.48)], truth: 'good' },
];

// --- Calibration: (raw confidence, was-correct) pairs ------------------------
// SYNTHETIC, deliberately OVER-confident (typical of raw VLM scores): high-confidence
// predictions are right less often than the score implies, so temperature scaling
// (T>1) should reduce calibration error. Re-fit on real grading outcomes in prod.
export interface CalibrationPoint {
  confidence: number;
  correct: boolean;
}

export const CALIBRATION_CASES: CalibrationPoint[] = [
  // ~0.9 bucket → actually right ~80% (mild over-confidence)
  { confidence: 0.92, correct: true },
  { confidence: 0.9, correct: true },
  { confidence: 0.91, correct: true },
  { confidence: 0.9, correct: true },
  { confidence: 0.93, correct: false },
  // ~0.8 bucket → ~67%
  { confidence: 0.82, correct: true },
  { confidence: 0.8, correct: true },
  { confidence: 0.81, correct: false },
  { confidence: 0.8, correct: true },
  { confidence: 0.82, correct: false },
  { confidence: 0.8, correct: true },
  // ~0.7 bucket → ~57%
  { confidence: 0.72, correct: true },
  { confidence: 0.7, correct: false },
  { confidence: 0.71, correct: true },
  { confidence: 0.7, correct: false },
  { confidence: 0.7, correct: true },
  { confidence: 0.72, correct: true },
  // ~0.6 bucket → ~50%
  { confidence: 0.62, correct: true },
  { confidence: 0.6, correct: false },
  { confidence: 0.61, correct: false },
  { confidence: 0.6, correct: true },
  // low bucket → mostly wrong (model is unsure and usually right to be)
  { confidence: 0.45, correct: false },
  { confidence: 0.5, correct: true },
];

// --- Pricing: retail + condition + demand vs a true market resale price -------
export interface PricingCase {
  id: string;
  retailCents: number;
  grade: ConditionGrade;
  demand: DemandLevel;
  truthResaleCents: number; // independently-set plausible market clearing price
}

export const PRICING_CASES: PricingCase[] = [
  { id: 'p1', retailCents: 1_000_000, grade: 'new', demand: 'high', truthResaleCents: 860_000 },
  { id: 'p2', retailCents: 1_000_000, grade: 'like-new', demand: 'medium', truthResaleCents: 720_000 },
  { id: 'p3', retailCents: 500_000, grade: 'good', demand: 'medium', truthResaleCents: 290_000 },
  { id: 'p4', retailCents: 500_000, grade: 'fair', demand: 'low', truthResaleCents: 160_000 },
  { id: 'p5', retailCents: 200_000, grade: 'poor', demand: 'low', truthResaleCents: 40_000 },
  { id: 'p6', retailCents: 1_200_000, grade: 'good', demand: 'high', truthResaleCents: 760_000 },
  { id: 'p7', retailCents: 300_000, grade: 'like-new', demand: 'low', truthResaleCents: 185_000 },
  { id: 'p8', retailCents: 800_000, grade: 'fair', demand: 'medium', truthResaleCents: 300_000 },
  { id: 'p9', retailCents: 60_000, grade: 'good', demand: 'medium', truthResaleCents: 33_000 },
  { id: 'p10', retailCents: 2_500_000, grade: 'new', demand: 'medium', truthResaleCents: 1_950_000 },
];

// --- Routing HARD constraints: engine inputs vs the forced (safety/legal) path --
// These are the rules that must NEVER be optimized away. Accuracy here measures
// conformance: the hard ladder still forces exactly these paths.
export interface RoutingCase {
  id: string;
  inputs: RoutingInputs;
  truth: ReturnRoutingDecision['decision'];
}

function ri(over: Partial<RoutingInputs>): RoutingInputs {
  return {
    grade: 'A',
    reason: 'changed_mind',
    sku: 'B09XXXXXXX',
    sellerType: '1P',
    authenticityMatch: true,
    functionallyVerifiable: true,
    ...over,
  };
}

export const ROUTING_CASES: RoutingCase[] = [
  { id: 'r1', inputs: ri({ sellerType: '3P' }), truth: 'return_to_seller' },
  { id: 'r2', inputs: ri({ reason: 'counterfeit' }), truth: 'return_to_seller' },
  { id: 'r3', inputs: ri({ reason: 'not_as_described' }), truth: 'return_to_seller' },
  { id: 'r4', inputs: ri({ reason: 'wrong_item' }), truth: 'warehouse' },
  { id: 'r5', inputs: ri({ authenticityMatch: false }), truth: 'warehouse' },
  { id: 'r6', inputs: ri({ grade: 'Salvage' }), truth: 'recycle' },
  { id: 'r7', inputs: ri({ grade: null }), truth: 'recycle' },
  { id: 'r8', inputs: ri({ reason: 'arrived_damaged' }), truth: 'recycle' },
];

// --- Routing EV optimality: viable profiles (no hard rule) → argmax-EV path ------
// For these, there is no single "right" label; the engine must pick the path with
// the maximum expected value. The metric recomputes the argmax independently and
// checks the engine agrees — and that the chosen path actually VARIES with economics.
function ev(over: Partial<RoutingEvProfile>): RoutingEvProfile {
  return {
    grade: 'B',
    reason: 'changed_mind',
    sellerType: '1P',
    sellerOptedIn: true,
    authenticityMatch: true,
    functionallyVerifiable: true,
    clearingPriceCents: 300_000,
    localHandlingCents: 40_000,
    nearbyBuyers: 6,
    radiusKm: 4,
    warehouseDistanceKm: 580,
    ...over,
  };
}

export const ROUTING_EV_CASES: RoutingEvProfile[] = [
  ev({ grade: 'A', clearingPriceCents: 800_000, nearbyBuyers: 8 }), // near-new + demand → local_resale
  ev({ grade: 'B', clearingPriceCents: 300_000, nearbyBuyers: 6 }), // solid → local_resale
  ev({ grade: 'C', clearingPriceCents: 200_000, nearbyBuyers: 8, functionallyVerifiable: false }), // worn + demand → refurbish beats as-is
  ev({ grade: 'B', clearingPriceCents: 40_000, nearbyBuyers: 2 }), // low value → donate
  ev({ grade: 'B', clearingPriceCents: 15_000, nearbyBuyers: 1 }), // very low → donate/recycle
  ev({ grade: 'A', clearingPriceCents: 500_000, nearbyBuyers: 0 }), // no buyers → warehouse/recovery
];
