// Smart Routing / Intelligent Bridge — "the brain".
// A deterministic, explainable decision over {value, local cost, demand, carbon}.
// Stub contract for the scaffold; the rules engine arrives in a later spec.

import type { ID, Money } from './common.js';

export type RoutingPath =
  | 'local-resale'
  | 'refurbish'
  | 'donate'
  | 'recycle'
  | 'warehouse';

/** One input the glass-box rules considered, surfaced for explanation. */
export interface RoutingFactor {
  label: string; // e.g. "Nearby demand"
  value: string; // human-readable, e.g. "High"
  weight: number; // 0..1 contribution to the decision
}

export interface RoutingDecision {
  id: ID;
  productId: ID;
  chosenPath: RoutingPath;
  /** LLM-narrated explanation; logic decides, the LLM narrates. */
  rationale: string;
  factors: RoutingFactor[];
  estimatedValue: Money;
  carbonSavedKg: number;
  /** ISO 8601 timestamp. */
  decidedAt: string;
}
