// Rufus — Amazon's shopping assistant, made Health-Card-aware. It answers a
// shopper's questions about ONE specific second-life item using only the facts on
// that item's Product Health Card. LLM phrases the answer; a deterministic
// fallback guarantees a useful reply offline.

import type { ConditionGrade } from './common.js';

/** Everything Rufus is allowed to reason about — drawn from the Health Card. */
export interface RufusContext {
  title: string;
  category: string;
  grade: ConditionGrade;
  confidence: number;
  summary: string;
  detectedIssues: string[];
  authenticityVerified: boolean;
  listingPriceInr: number;
  originalPriceInr?: number;
  co2SavedKg?: number;
  ecoCredits?: number;
  sellerName?: string;
  specs?: Record<string, string>;
  /** Prior turns in this conversation — retrievable context for follow-ups (RAG). */
  priorQa?: { q: string; a: string }[];
}

export interface RufusRequest {
  question: string;
  context: RufusContext;
}

export interface RufusResponse {
  text: string;
}
