// Return flow — contracts for the 5-step return experience.
// These are distinct from the scaffold-era GradingResult/RoutingDecision (sell flow).

import type { ConditionGrade } from './common.js';
import type { RoutingFactor } from './routing.js';

export type ReturnReason =
  | 'didnt_fit'
  | 'changed_mind'
  | 'duplicate_gift'
  | 'defective'
  | 'stopped_working'
  | 'arrived_damaged'
  | 'wrong_item'
  | 'counterfeit'
  | 'not_as_described';

export interface ReturnGradingResult {
  grade: 'A' | 'B' | 'C' | 'Salvage' | null; // null = unresolved (warehouse fallback)
  confidence: number; // 0–1
  defects: string[];
  authenticityMatch: boolean;
  wardrobingFlag: boolean;
  functionallyVerifiable: boolean;
  rawReason: ReturnReason;
  /** The trained grader's raw continuous condition score, 0 (destroyed)..1 (new).
   *  Absent when the hosted-VLM fallback graded instead — it emits no score. */
  conditionScore?: number;
  /** One-line plain-English condition summary from the model. */
  summary?: string;
  /** Spec 016: factory seal / packaging intact — gates the restock path. */
  packagingSealed?: boolean;
  // Spec 025: angle-aware capture. A required angle missing (or low confidence)
  // routes the item to in-person verification instead of a confident grade.
  needsReview?: boolean;
  /** Human labels of required angles that weren't photographed. */
  missingAngles?: string[];
  /** Closed-loop asks (e.g. "Add a Sole photo") when photos can't fully grade. */
  captureGuidance?: string[];
}

export type Grade = 'A' | 'B' | 'C' | 'Salvage';

/**
 * Spec 023: bridges the Sell flow's ConditionGrade (new|like-new|good|fair|poor,
 * what the trained CV grader and VlmProvider produce) onto the Return flow's
 * Grade (A|B|C|Salvage, what the routing engine expects). The two flows never
 * shared a grading provider before this spec.
 */
export function conditionGradeToReturnGrade(g: ConditionGrade): Grade {
  if (g === 'new' || g === 'like-new') return 'A';
  if (g === 'good') return 'B';
  if (g === 'fair') return 'C';
  return 'Salvage'; // poor
}

/**
 * Spec 016.1: defect vocabulary for defect-level refurb economics. Free-text
 * grader defects are mapped onto these tags (see `tagDefects` in
 * liquidation-lot.ts); each tag carries a repair cost + grade delta in the
 * engine's DEFECT_REPAIR_TABLE ("missing charger: ₹300, B→A").
 */
export type DefectTag =
  | 'missing_charger'
  | 'missing_cable'
  | 'scratched_screen'
  | 'scuffed_body'
  | 'worn_packaging'
  | 'missing_manual'
  | 'dead_battery'
  | 'missing_accessory';

/**
 * Spec 016: grading as a distribution over grades (sums to 1), not a point label.
 * Routes differ in error sensitivity — restock is brutally sensitive to a wrong A,
 * donation barely cares — so the engine takes the full posterior.
 */
export type GradePosterior = Record<Grade, number>;

export interface ReturnRoutingDecision {
  decision:
    | 'restock'
    | 'local_resale'
    | 'refurbish'
    | 'liquidate' // spec 016.1: hub-staged manifested pallet (first-class path)
    | 'donate'
    | 'recycle'
    | 'warehouse'
    | 'return_to_seller'
    | 'returnless_refund'; // spec 016.1: every route loses money → refund, item stays
  reasoning: string;
  co2SavedKg: number;
  dwellBudgetHours: number;
  /** Spec 016: how long this decision stays valid before checkpoint re-evaluation. */
  ttlHours?: number;
  sellerType: '1P' | '3P';
  fallbackChain: ReturnRoutingDecision['decision'][];
  // Economic margins — present for local_resale and refurbish
  warehouseMargin?: number; // net recovery via warehouse (often negative for cheap items)
  localMargin?: number;     // net recovery via local route
  // Buyer-matching data — present for local_resale
  nearbyBuyers?: number;          // verified buyers found within radiusKm
  radiusKm?: number;              // search radius used
  warehouseDistanceKm?: number;   // distance to nearest warehouse (shows what we avoided)
  // Phase 3: per-path expected-value breakdown (the glass-box optimization).
  evBreakdown?: RoutingEvBreakdown;
  // Spec 015: EcoCredits earned for a 1P item diverted from the warehouse, capped
  // by Amazon's own captured EV delta (see carbon-vouchers.ts). Undefined for
  // 3P/warehouse/return_to_seller — no Amazon-owned counterfactual to fund against.
  voucherEcoCredits?: number;
  voucherFactors?: RoutingFactor[];
  // Spec 023: illustrative coordinates for the Intelligent Bridge map — present
  // for local_resale|refurbish|donate|recycle|liquidate. Does NOT change any
  // EV/economics number above; purely a visualization of the existing decision.
  origin?: { lat: number; lng: number };
  destination?: { lat: number; lng: number; label: string };
}

/** A single path's expected value + signed term contributions (paise). */
export interface RoutingPathEv {
  path: ReturnRoutingDecision['decision'];
  evCents: number;
  viable: boolean;
  terms: { label: string; valueCents: number }[];
  /** Spec 016: why the path was gated out (e.g. confidence below the route's θ). */
  gateReason?: string;
}

/** The EV optimization, surfaced for on-screen explanation. */
export interface RoutingEvBreakdown {
  /** Set when a hard constraint forced the path (EV skipped). */
  hardRule?: string;
  chosen: ReturnRoutingDecision['decision'];
  paths: RoutingPathEv[];
}

export interface RoutingInput {
  grade: Grade | null;
  confidence: number;
  reason: ReturnReason;
  authenticityMatch: boolean;
  functionallyVerifiable: boolean;
  sellerType: '1P' | '3P';
  sellerOptedIn: boolean;
  failsHardGate: boolean;
  // Economic fields
  originalPrice: number;
  residualValue: number;
  warehouseCost: number;
  localHandlingCost: number;
  fixCost: number;
  valueUplift: number;
  nearbyBuyers: number;
  radiusKm: number;
}

export interface RoutingNarrationInput {
  decision: ReturnRoutingDecision['decision'];
  originalPrice: number;
  residualValue: number;
  warehouseCost: number;
  localHandlingCost: number;
  warehouseMargin: number;
  localMargin: number;
  nearbyBuyers: number;
  radiusKm: number;
  co2SavedKg: number;
  grade: Grade | null;
}

export interface ReturnHandoffDetails {
  method: 'locker' | 'agent_pickup' | 'hub_dropoff';
  locationName: string;
  locationAddress: string;
  qrCode: string;
  confirmationId: string;
  scheduledAt?: string; // ISO date string
  note?: string; // fallback reason (e.g. "No lockers available nearby")
}

export interface ReturnFlowState {
  orderId: string;
  reason: ReturnReason;
  photos: string[]; // object URLs
  gradingResult?: ReturnGradingResult;
  routingDecision?: ReturnRoutingDecision;
  handoff?: ReturnHandoffDetails;
  currentStep: 1 | 2 | 3 | 4 | 5;
}

export type GradingScenario =
  | 'high_confidence'
  | 'low_confidence'
  | 'auth_mismatch'
  | 'wardrobing'
  | 'unverifiable';

export type RoutingScenario =
  | 'restock'
  | 'local_resale'
  | 'refurbish'
  | 'liquidate'
  | 'donate'
  | 'recycle'
  | 'warehouse'
  | 'return_to_seller'
  | 'returnless_refund';

export type HandoffScenario = 'locker' | 'agent_pickup' | 'hub_dropoff' | 'no_locker' | 'locker_full';

export interface MockOrder {
  orderId: string;
  productName: string;
  imageUrl: string;
  orderDate: string; // ISO date string
  priceCents: number;
  currency: string;
  sku: string;
  // Drives the doorstep-capture angle spec (spec 025). Widened beyond the
  // original three so footwear gets sole/top/heel and home goods get
  // overall/surface/base (see grading-capture.toGradingCategory).
  category: 'electronics' | 'apparel' | 'kitchenware' | 'footwear' | 'home';
}

export interface ReturnHealthCard {
  summary: string;               // 1–2 sentences, plain English condition summary
  verifiedAttributes: string[];  // what was actually checked from photos
  notVerified: string[];         // what could not be verified from photos alone
  trustScore: number;            // 0–100
}

// --- Spec 016: the return-item state machine -------------------------------
// A return is a lifecycle, not one decision. The engine re-runs at every
// physical checkpoint: information improves and redirection cost rises as the
// item moves. RL_OUTBOUND (today's reverse-logistics flow) is the universal
// fallback edge — the graceful-degradation guarantee.

export type ReturnItemState =
  // decision phase (nothing has moved — redirect is free)
  | 'initiated'
  | 'evidence_captured'
  | 'routed' // provisional, carries a TTL
  // custody checkpoints (cheap redirects)
  | 'pickup_verified' // driver scan at the doorstep
  | 'at_local_hub' // delivery station bench queue
  | 'hub_verified' // grade confirmed/overridden — last cheap redirect
  // execution (committed to a destination)
  | 'listed_local'
  | 'sold'
  | 'delivered_to_buyer'
  | 'refurb_queue'
  | 'restock_outbound'
  | 'restocked'
  | 'pallet_staging'
  | 'liquidated'
  | 'donation_batch'
  | 'donated'
  | 'recycle_batch'
  | 'recycled'
  | 'rl_outbound' // handed to the standard reverse-logistics chain
  | 'returnless_closed'; // spec 016.1: refund issued, item stays — nothing ever moves

/** Evidence gathered at a checkpoint that can move the posterior. */
export interface CheckpointEvidence {
  source: 'customer' | 'driver' | 'hub_bench';
  /** Grade observed at this checkpoint (hub bench may override the AI). */
  observedGrade?: Grade;
  confidence?: number;
  packagingSealed?: boolean;
  matchesPhotos?: boolean; // driver: does the physical item match the capture?
  functionalCheckPassed?: boolean; // hub bench, powered items
  notes?: string;
}

/** One transition in the lifecycle; `decision` is set when the engine re-ran. */
export interface ReturnStateTransition {
  from: ReturnItemState;
  to: ReturnItemState;
  at: string; // ISO timestamp
  evidence?: CheckpointEvidence;
  decision?: ReturnRoutingDecision; // present when this checkpoint re-routed
}

// --- Spec 022: frontend↔backend wiring --------------------------------------
// /api/grade and /api/route both fall back to a bare `{ fallback: true,
// decision: 'warehouse' }` shape on an unexpected server-side error — distinct
// from (and rarer than) the engines' own graceful-degradation paths (which
// already produce a fully-typed result with template reasoning). Callers must
// discriminate on `'fallback' in result` before assuming the happy-path shape.
export type ReturnGradeResponse = ReturnGradingResult | { fallback: true; decision: 'warehouse' };
export type ReturnRouteResponse = ReturnRoutingDecision | { fallback: true; decision: 'warehouse' };

// --- Spec 023: GET /api/matching/status/:returnId — previously untyped ad hoc
// JSON in the route handler. `candidates` are illustrative geo data for the
// seller's nearby-buyers map, derived at read-time (not stored) from BuyerDoc +
// pincode coordinates; PII (buyer.contact) is intentionally omitted.
export interface MatchCandidateGeo {
  buyerId: string;
  city: string;
  lat: number;
  lng: number;
  distanceKm: number;
  matchScore: number;
  response: 'pending' | 'accepted' | 'declined' | 'timeout';
}

export interface MatchStatusResponse {
  sessionId: string;
  returnId: string;
  status: 'searching' | 'notifying' | 'matched' | 'expired' | 'warehouse_fallback';
  offeredPrice: number;
  candidateCount: number;
  currentCandidateIndex: number;
  matchedBuyerId: string | null;
  matchedAt: Date | string | null;
  pickupDeadline: Date | string;
  candidates: MatchCandidateGeo[];
}
