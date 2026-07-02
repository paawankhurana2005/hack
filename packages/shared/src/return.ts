// Return flow — contracts for the 5-step return experience.
// These are distinct from the scaffold-era GradingResult/RoutingDecision (sell flow).

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
  /** Spec 016: factory seal / packaging intact — gates the restock path. */
  packagingSealed?: boolean;
}

export type Grade = 'A' | 'B' | 'C' | 'Salvage';

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
    | 'donate'
    | 'recycle'
    | 'warehouse'
    | 'return_to_seller';
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
  | 'donate'
  | 'recycle'
  | 'warehouse'
  | 'return_to_seller';

export type HandoffScenario = 'locker' | 'agent_pickup' | 'hub_dropoff' | 'no_locker' | 'locker_full';

export interface MockOrder {
  orderId: string;
  productName: string;
  imageUrl: string;
  orderDate: string; // ISO date string
  priceCents: number;
  currency: string;
  sku: string;
  category: 'electronics' | 'apparel' | 'kitchenware';
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
  | 'rl_outbound'; // handed to the standard reverse-logistics chain

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
