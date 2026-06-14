// Return-prevention contracts ("predict the return before it happens").
// The 4th pillar: at the point of purchase, predict how likely a specific
// product VARIANT (e.g. a shoe size) is to be returned, and nudge the shopper
// toward a safer choice. A return that never happens is the best outcome —
// no doorstep grading, no routing, no warehouse, no carbon.
//
// Types only — single source of truth in @reloop/shared. The prediction itself
// is glass-box (a deterministic model over historical return data); this file
// just describes its shape.

/** How risky a variant is to be returned. Drives the panel's tone. */
export type ReturnRiskLevel = 'low' | 'moderate' | 'high';

/** A single reason returns happen for a variant, as a share of all its returns. */
export interface ReturnReasonShare {
  reason: string;
  /** 0..1 — share of this variant's returns attributed to `reason`. */
  share: number;
}

/** A safer variant the shopper should consider instead. */
export interface ReturnRiskRecommendation {
  variantLabel: string;
  /** 0..1 — the recommended variant's own return rate. */
  returnRate: number;
  /** Plain-language reason to switch (e.g. "most who returned size 8 re-bought this"). */
  rationale: string;
}

/** Predicted return risk for one product variant, surfaced before purchase. */
export interface ReturnRiskPrediction {
  /** Human label for the variant this prediction is about, e.g. "Size 8". */
  variantLabel: string;
  riskLevel: ReturnRiskLevel;
  /** 0..1 — predicted probability this variant is returned. */
  returnRate: number;
  /** 0..1 — model confidence, driven by how much history backs the prediction. */
  confidence: number;
  /** Why returns happen for this variant, largest share first. */
  reasons: ReturnReasonShare[];
  /** Present only when a meaningfully safer variant exists. */
  recommendation?: ReturnRiskRecommendation;
}
