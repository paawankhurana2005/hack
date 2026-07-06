// Dynamic pricing engine contracts (rescue pipeline). Distinct from the sell-flow
// pricing in `pricing.ts`: this is the return-rescue price computed live on read
// from a precomputed regional demand index. Shared so the API and the web app
// agree on the wire shape.

/** The full, transparent price breakdown returned by GET /api/pricing/:returnId. */
export interface PriceBreakdown {
  finalPrice: number; // whole rupees
  basePrice: number;
  conditionFactor: number;
  demandFactor: number;
  urgencyFactor: number;
  categoryFactor: number;
  daysRemaining: number;
  breakdown: string; // human-readable one-line explanation
}

/** Payload for POST /api/returns — upserts the structured return record the
 *  pricing engine reads. Dates are ISO strings on the wire. */
export interface ReturnRecordInput {
  returnId: string;
  productName?: string;
  category: string;
  region_cluster: string;
  pincode?: string;
  base_price: number; // whole rupees (P_base, original market value)
  condition_score?: number; // 0–1; omit to let the engine use its placeholder
  pickup_deadline: string; // ISO — set once at listing creation
  listing_created_at: string; // ISO
  grade?: 'A' | 'B' | 'C' | 'Salvage' | null;
  sku?: string;
  /** Owning seller account id (spec 024) — lets matching-cascade and agent
   *  events notify the right seller via the in-app notification inbox. */
  sellerId?: string;
}
