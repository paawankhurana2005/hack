// Feature store contract — the typed home for every signal an ML model reads.
// No magic numbers downstream: pricing (Phase 2) and return-risk (Phase 4) read
// NAMED features from here, each tagged with where it came from. Unknown features
// are explicitly `null` (never a silent 0), so "we don't have this signal yet" is
// distinguishable from "this signal is zero". Pure + dependency-free → identical on
// client and server, and maps to SageMaker Feature Store when hosted.

import type { ConditionGrade } from './common.js';
import type { GradingResult } from './grading.js';
import type { DemandLevel } from './pricing.js';
import type { ItemCategory } from './sell.js';
import type { ProvenanceChain } from './provenance.js';
import { cumulativeImpact } from './provenance.js';
import { severityToOrdinal } from './grading-rubric.js';

/** Where a feature originates — drives lineage + which subsystem owns it. */
export type FeatureSource = 'model' | 'provenance' | 'catalog' | 'market' | 'derived';

/** A missing signal is null, not 0. */
export type FeatureValue = number | null;

/** The named feature set. Phases 2/4 EXTEND this; they don't replace it. */
export interface FeatureVector {
  // --- model (perception) ---
  gradeOrdinal: FeatureValue; // 0 (poor) … 4 (new)
  gradeConfidence: FeatureValue; // 0..1 (calibrated when available)
  detectedIssueCount: FeatureValue;
  maxIssueSeverity: FeatureValue; // worst structured-issue severity ordinal (0..2)
  severeIssueCount: FeatureValue; // # of 'severe' structured issues
  photoQualityScore: FeatureValue; // 0..1 mean capture quality
  photoCount: FeatureValue; // angles captured (completeness signal)
  authenticityConfidence: FeatureValue; // 0..1, from the reference diff
  // --- provenance (the Amazon moat: what we recorded at first sale + each life) ---
  lives: FeatureValue; // distinct owners so far (>=1)
  priorGradeCount: FeatureValue; // how many times graded before
  // --- catalog ---
  categoryEmbodiedCo2Kg: FeatureValue;
  // --- market ---
  demandOrdinal: FeatureValue; // 0 (low) / 1 (medium) / 2 (high)
  nearbyBuyers: FeatureValue;
  // --- derived ---
  daysSincePurchase: FeatureValue;
}

export interface FeatureSpec {
  source: FeatureSource;
  description: string;
}

/** The registry: lineage + docs for every feature. Keyed to FeatureVector. */
export const FEATURE_SPECS: Record<keyof FeatureVector, FeatureSpec> = {
  gradeOrdinal: { source: 'model', description: 'Condition grade as an ordinal (poor=0 … new=4).' },
  gradeConfidence: { source: 'model', description: 'Calibrated confidence in the grade, 0..1.' },
  detectedIssueCount: { source: 'model', description: 'Number of distinct issues detected across angles.' },
  maxIssueSeverity: { source: 'model', description: 'Worst structured-issue severity (minor=0/moderate=1/severe=2).' },
  severeIssueCount: { source: 'model', description: 'Count of severe structured issues.' },
  photoQualityScore: { source: 'model', description: 'Mean capture quality across photos, 0..1.' },
  photoCount: { source: 'model', description: 'Number of angles captured (completeness).' },
  authenticityConfidence: { source: 'model', description: 'Confidence the item matches its original listing.' },
  lives: { source: 'provenance', description: 'Distinct owners the physical item has had (>=1).' },
  priorGradeCount: { source: 'provenance', description: 'How many times the item was graded before this one.' },
  categoryEmbodiedCo2Kg: { source: 'catalog', description: 'Per-category embodied carbon baseline (kg CO2e).' },
  demandOrdinal: { source: 'market', description: 'Local resale demand as an ordinal (low=0/med=1/high=2).' },
  nearbyBuyers: { source: 'market', description: 'Verified nearby buyers for this category.' },
  daysSincePurchase: { source: 'derived', description: 'Days between first purchase and now.' },
};

// Shared encodings (kept here so model + eval agree on the numbers).
const GRADE_ORDINAL: Record<ConditionGrade, number> = {
  poor: 0,
  fair: 1,
  good: 2,
  'like-new': 3,
  new: 4,
};
const DEMAND_ORDINAL: Record<DemandLevel, number> = { low: 0, medium: 1, high: 2 };

// Per-category embodied-carbon baseline — mirrors impact.ts (the catalog source of
// truth for carbon). Duplicated as a plain map to keep features.ts dependency-light.
const CATEGORY_CO2_KG: Record<ItemCategory, number> = {
  electronics: 25,
  home: 15,
  fashion: 8,
  sports: 6,
  toys: 4,
  books: 1,
  other: 5,
};

export function gradeToOrdinal(grade: ConditionGrade): number {
  return GRADE_ORDINAL[grade];
}

/** Inputs available today. Everything is optional — absent → null features. */
export interface FeatureInput {
  category?: ItemCategory;
  grading?: Pick<
    GradingResult,
    'grade' | 'confidence' | 'detectedIssues' | 'referenceComparison' | 'structuredIssues' | 'qualityScore' | 'photoUrls'
  >;
  demand?: DemandLevel;
  nearbyBuyers?: number;
  chain?: ProvenanceChain;
  purchaseDate?: string; // ISO
  now?: string; // ISO; defaults to current time
}

function daysBetween(fromIso: string, toIso: string): number | null {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

/**
 * Assemble a FeatureVector from whatever signals exist now. The single place
 * features are plumbed — downstream models never hand-roll feature extraction.
 */
export function buildFeatureVector(input: FeatureInput): FeatureVector {
  const { grading, chain } = input;
  const priorGradeCount = chain
    ? chain.events.filter((e) => e.type === 'graded').length
    : null;
  const structured = grading?.structuredIssues;
  const maxIssueSeverity = structured?.length
    ? Math.max(...structured.map((i) => severityToOrdinal(i.severity)))
    : null;
  const severeIssueCount = structured ? structured.filter((i) => i.severity === 'severe').length : null;

  return {
    gradeOrdinal: grading ? GRADE_ORDINAL[grading.grade] : null,
    gradeConfidence: grading ? grading.confidence : null,
    detectedIssueCount: grading ? grading.detectedIssues.length : null,
    maxIssueSeverity,
    severeIssueCount,
    photoQualityScore: grading?.qualityScore ?? null,
    photoCount: grading?.photoUrls?.length ?? null,
    authenticityConfidence: grading?.referenceComparison?.authenticityConfidence ?? null,
    lives: chain ? cumulativeImpact(chain).lives : null,
    priorGradeCount,
    categoryEmbodiedCo2Kg: input.category ? CATEGORY_CO2_KG[input.category] : null,
    demandOrdinal: input.demand ? DEMAND_ORDINAL[input.demand] : null,
    nearbyBuyers: input.nearbyBuyers ?? null,
    daysSincePurchase: input.purchaseDate
      ? daysBetween(input.purchaseDate, input.now ?? new Date().toISOString())
      : null,
  };
}
