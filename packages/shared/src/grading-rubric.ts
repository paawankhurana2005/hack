// Category-conditioned grading rubric + confidence calibration (Phase 1). All pure
// + deterministic so the SAME definitions drive the prompt (api), the aggregation
// (api), and the eval harness — no drift. The model perceives; these rules shape
// and calibrate what it returns. A screen scratch on a phone is not a scuff on a pan,
// so the defect taxonomy and the regions the model is told to inspect are per-category.

import type { IssueSeverity, PhotoQuality } from './grading.js';
import type { ItemCategory } from './sell.js';

/** Severity as an ordinal — feeds deterministic "keep the worst" aggregation. */
export const SEVERITY_ORDINAL: Record<IssueSeverity, number> = {
  minor: 0,
  moderate: 1,
  severe: 2,
};

export function severityToOrdinal(s: IssueSeverity): number {
  return SEVERITY_ORDINAL[s];
}

/** Per-category defect taxonomy + the regions the model should inspect. */
export interface CategoryRubric {
  /** Defect types the model should classify into (free text allowed, but steer here). */
  issueTypes: string[];
  /** Coarse zones to localize a defect to. */
  regions: string[];
}

export const CATEGORY_RUBRIC: Record<ItemCategory, CategoryRubric> = {
  electronics: {
    issueTypes: ['screen scratch', 'dent', 'port damage', 'battery wear', 'missing accessory', 'discoloration'],
    regions: ['screen', 'back', 'edges', 'ports', 'buttons'],
  },
  fashion: {
    issueTypes: ['stain', 'tear', 'pilling', 'fading', 'missing button', 'stretched fabric', 'sole wear'],
    regions: ['front', 'back', 'collar', 'cuffs', 'seams', 'sole'],
  },
  home: {
    issueTypes: ['crack', 'chip', 'scratch', 'rust', 'discoloration', 'missing part'],
    regions: ['body', 'base', 'handle', 'lid', 'interior'],
  },
  sports: {
    issueTypes: ['scuff', 'crack', 'worn grip', 'deflation', 'frayed strap', 'rust'],
    regions: ['body', 'grip', 'straps', 'surface', 'joints'],
  },
  toys: {
    issueTypes: ['missing part', 'crack', 'fading', 'broken mechanism', 'stain'],
    regions: ['body', 'limbs', 'accessories', 'packaging'],
  },
  books: {
    issueTypes: ['bent pages', 'spine crease', 'highlighting', 'water damage', 'torn cover'],
    regions: ['cover', 'spine', 'pages', 'corners'],
  },
  other: {
    issueTypes: ['scratch', 'crack', 'wear', 'discoloration', 'missing part'],
    regions: ['front', 'back', 'edges', 'surface'],
  },
};

export function rubricFor(category: ItemCategory): CategoryRubric {
  return CATEGORY_RUBRIC[category];
}

// --- Confidence calibration --------------------------------------------------
// Raw VLM confidence is over-confident. Temperature scaling on the logit pulls it
// toward a calibrated probability. T > 1 softens (reduces over-confidence). The
// default T is FIT ON THE SYNTHETIC SEED by the eval harness (grid search over ECE)
// and pinned here; re-fit it on real labelled data in production without changing
// any call site.

/** Fitted on the synthetic calibration seed by grid-searching ECE (see eval —
 *  grid-best ≈ 1.9). Re-fit on real grading outcomes in production. */
export const CONFIDENCE_TEMPERATURE = 1.9;

/** Below this CALIBRATED confidence, abstain → flag for human review (Phase 6 HITL). */
export const ABSTAIN_THRESHOLD = 0.55;

const EPS = 1e-6;

/** Temperature-scale a probability in [0,1]. T=1 is identity; T>1 softens. */
export function calibrateConfidence(p: number, temperature = CONFIDENCE_TEMPERATURE): number {
  const clamped = Math.min(1 - EPS, Math.max(EPS, p));
  const logit = Math.log(clamped / (1 - clamped));
  const scaled = logit / temperature;
  return 1 / (1 + Math.exp(-scaled));
}

/** Abstain decision over a calibrated confidence. */
export function needsReview(calibratedConfidence: number): boolean {
  return calibratedConfidence < ABSTAIN_THRESHOLD;
}

// --- Photo quality -----------------------------------------------------------

/** Map a reported capture quality to a 0..1 score (clear is best). */
export const PHOTO_QUALITY_SCORE: Record<PhotoQuality, number> = {
  clear: 1,
  blurry: 0.4,
  dark: 0.4,
  occluded: 0.3,
};

export function photoQualityScore(q: PhotoQuality): number {
  return PHOTO_QUALITY_SCORE[q];
}
