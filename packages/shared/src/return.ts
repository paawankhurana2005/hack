// Return flow — contracts for the 5-step return experience.
// These are distinct from the scaffold-era GradingResult/RoutingDecision (sell flow).

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
}

export type Grade = 'A' | 'B' | 'C' | 'Salvage';

export interface ReturnRoutingDecision {
  decision:
    | 'local_resale'
    | 'refurbish'
    | 'donate'
    | 'recycle'
    | 'warehouse'
    | 'return_to_seller';
  reasoning: string;
  co2SavedKg: number;
  dwellBudgetHours: number;
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
}

/** A single path's expected value + signed term contributions (paise). */
export interface RoutingPathEv {
  path: ReturnRoutingDecision['decision'];
  evCents: number;
  viable: boolean;
  terms: { label: string; valueCents: number }[];
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
