// Central definition of the dynamic-pricing collections: their names, document
// shapes, the demand-event weight table, and idempotent index creation. Kept in
// one place (mirrors how `accounts-seed.ts` owns the `users` schema) so the
// write path, the aggregation job, the pricing read path, and the seed script
// all agree on field names and never drift.

import type { Db, ObjectId } from 'mongodb';
import type { RegionCluster } from './regionCluster.js';

// ── Collection names ─────────────────────────────────────────────────────────
export const DEMAND_EVENTS = 'demand_events';
export const DEMAND_INDEX = 'demand_index';
export const RETURNS = 'returns';
export const BUYERS = 'buyers';
export const MATCH_SESSIONS = 'match_sessions';

// ── demand_events: raw, append-only buyer-activity log (write-heavy) ──────────
export type DemandEventType = 'search' | 'view' | 'interest' | 'match_completed';

export interface DemandEventDoc {
  event_type: DemandEventType;
  category: string;
  region_cluster: string; // coarse zone derived from pincode
  pincode: string;
  timestamp: Date;
  weight: number;
}

/** How much each signal contributes to demand. Stronger intent → higher weight. */
export const EVENT_WEIGHTS: Record<DemandEventType, number> = {
  match_completed: 3,
  interest: 2,
  view: 1,
  search: 0.5,
};

// ── demand_index: precomputed lookup, small & read-heavy ─────────────────────
export interface DemandIndexDoc {
  region_cluster: string;
  category: string;
  score: number; // normalized demand factor, clamped 0.7–1.3
  sample_size: number;
  computed_at: Date;
}

// ── returns: the structured return/listing record the pricing engine reads ────
// Greenfield: returns currently live only as opaque JSON in the `state` blob and
// in the web's localStorage. This is the first structured, queryable home for
// the fields dynamic pricing needs.
export interface ReturnRecordDoc {
  returnId: string;
  productName?: string;
  category: string;
  region_cluster: RegionCluster | string;
  pincode?: string;
  base_price: number; // P_base — original product market value (whole rupees)
  condition_score?: number; // 0–1, from AI grading (placeholder until wired in)
  pickup_deadline: Date; // set once at listing creation, never recalculated
  listing_created_at: Date;
  grade?: 'A' | 'B' | 'C' | 'Salvage' | null;
  sku?: string;
  match_session_id?: ObjectId; // set once the local buyer matching engine opens a session
  local_routing_accepted?: boolean; // seller accepted local routing for this return
}

// ── buyers: registered local buyers eligible for rescue-pipeline matching ────
export type ConditionFloor = 'A' | 'B' | 'C' | 'Salvage';

export interface BuyerViewedCategory {
  category: string;
  count: number;
  last_viewed: Date;
}

export interface BuyerActivity {
  last_active: Date;
  viewed_categories: BuyerViewedCategory[];
  completed_purchases: number;
  avg_purchase_price: number;
}

export interface BuyerDoc {
  _id?: ObjectId;
  user_id: string | null; // references users.id (string-keyed) when the buyer has a platform account
  name: string;
  contact: string;
  notification_preference: 'sms' | 'email' | 'push';
  location: {
    type: 'Point';
    coordinates: [number, number]; // GeoJSON — [lng, lat]
  };
  pincode: string;
  city: string; // fine-grained zone from getCityForPincode, e.g. "Delhi-South"
  region_cluster: RegionCluster | string; // coarse zone from getRegionCluster
  category_subscriptions: string[];
  price_range: { min: number; max: number };
  condition_floor: ConditionFloor;
  activity: BuyerActivity;
  is_refurbisher: boolean;
  is_active: boolean;
  created_at: Date;
}

// ── match_sessions: lifecycle of one return's local-buyer matching attempt ───
export type MatchSessionStatus = 'searching' | 'notifying' | 'matched' | 'expired' | 'warehouse_fallback';
export type CandidateResponse = 'pending' | 'accepted' | 'declined' | 'timeout';

export interface MatchCandidate {
  buyer_id: ObjectId;
  match_score: number;
  proximity_score: number;
  intent_score: number;
  price_fit_score: number;
  recency_score: number;
  notified_at: Date | null;
  response: CandidateResponse;
  response_at: Date | null;
}

export interface MatchSessionDoc {
  _id?: ObjectId;
  return_id: string; // references returns.returnId (string-keyed, not ObjectId)
  listing_created_at: Date;
  pickup_deadline: Date;
  status: MatchSessionStatus;
  category: string;
  region_cluster: RegionCluster | string;
  city: string;
  condition_score: number;
  grade: ConditionFloor;
  offered_price: number;
  candidate_list: MatchCandidate[];
  current_candidate_index: number;
  matched_buyer_id: ObjectId | null;
  matched_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// We only ever need a 7-day rolling window for aggregation; expire raw events
// after 14 days so the write-heavy log can't grow without bound.
const EVENT_TTL_SECONDS = 14 * 24 * 60 * 60;

/**
 * Idempotently ensure all indexes for the pricing collections. Safe to call on
 * every boot — createIndex is a no-op when the index already exists. Runs once
 * per process (promise cached); a transient failure resets so it can retry.
 */
let indexPromise: Promise<void> | null = null;

export function ensurePricingIndexes(db: Db): Promise<void> {
  if (!indexPromise) {
    indexPromise = (async () => {
      const events = db.collection<DemandEventDoc>(DEMAND_EVENTS);
      // TTL: auto-expire raw events 14 days after their timestamp.
      await events.createIndex({ timestamp: 1 }, { expireAfterSeconds: EVENT_TTL_SECONDS });
      // Supports the aggregation $match/$group (by category+zone over a window).
      await events.createIndex({ category: 1, region_cluster: 1, timestamp: -1 });

      const index = db.collection<DemandIndexDoc>(DEMAND_INDEX);
      // One row per zone × category — keeps this collection tiny and unique.
      await index.createIndex({ region_cluster: 1, category: 1 }, { unique: true });

      const returns = db.collection<ReturnRecordDoc>(RETURNS);
      await returns.createIndex({ returnId: 1 }, { unique: true });

      const buyers = db.collection<BuyerDoc>(BUYERS);
      // Mandatory — the entire proximity search in the matching engine depends
      // on this: it's what makes $nearSphere possible.
      await buyers.createIndex({ location: '2dsphere' });
      await buyers.createIndex({ city: 1 });
      await buyers.createIndex({ category_subscriptions: 1 });
      await buyers.createIndex({ is_active: 1 });
      await buyers.createIndex({ is_refurbisher: 1 });

      const matchSessions = db.collection<MatchSessionDoc>(MATCH_SESSIONS);
      await matchSessions.createIndex({ return_id: 1 }, { unique: true });
      await matchSessions.createIndex({ status: 1 });
      await matchSessions.createIndex({ pickup_deadline: 1 });
    })().catch((err: unknown) => {
      indexPromise = null;
      throw err;
    });
  }
  return indexPromise;
}
