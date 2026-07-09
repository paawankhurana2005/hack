// Local buyer matching engine — finds the best nearby buyer for a returned
// item within its pickup window, before it falls back to the warehouse.
//
// Four-factor weighted scoring (proximity, intent, price fit, recency) over a
// single geo-filtered MongoDB query. The DB does the radius filtering
// ($nearSphere against the 2dsphere index on buyers.location); this file only
// ranks the already-filtered candidate set. Same philosophy as the pricing
// engine and routing engine: deterministic, explainable, no live ML.

import { ObjectId, type WithId } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { getDb } from '../lib/mongo.js';
import { log } from '../lib/logger.js';
import { getPincodeCoordinates, getCityForPincode, haversineDistanceKm, type LatLng } from '../lib/regionCluster.js';
import { calculatePrice, PRICING_CONFIG } from './pricingEngine.js';
import { logDemandEvent } from './demandEvents.js';
import { createNotification, createNotificationForReturn } from './notifications/notification-service.js';
import {
  BUYERS,
  MATCH_SESSIONS,
  RETURNS,
  type BuyerDoc,
  type ConditionFloor,
  type MatchCandidate,
  type MatchSessionDoc,
  type ReturnRecordDoc,
} from '../lib/collections.js';
import { MatchSessionNotFoundError, ReturnIncompleteError, ReturnNotFoundError } from '../lib/errors.js';

// ── Tunables ─────────────────────────────────────────────────────────────────
export const SEARCH_RADIUS_KM = 10;
const MAX_FILTERED_CANDIDATES = 50;
const TOP_N = 5;
export const NOTIFY_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours — shared with the cascade job

const SCORE_WEIGHTS = { proximity: 0.3, intent: 0.35, priceFit: 0.2, recency: 0.15 } as const;

// Higher = better condition. Lets "buyer's floor at or below the product's
// grade" (buyer accepts this quality or worse) be expressed as a single $in.
const QUALITY_RANK: Record<ConditionFloor, number> = { Salvage: 0, C: 1, B: 2, A: 3 };
const ALL_FLOORS = Object.keys(QUALITY_RANK) as ConditionFloor[];

export interface RankedCandidate {
  buyer: WithId<BuyerDoc>;
  distanceKm: number;
  proximityScore: number;
  intentScore: number;
  priceFitScore: number;
  recencyScore: number;
  matchScore: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** condition_score/grade isn't guaranteed on a return record yet (AI grading is
 * wired in later); fall back to a score-derived grade using the same
 * placeholder default the pricing engine uses. */
function resolveGrade(record: ReturnRecordDoc): ConditionFloor {
  if (record.grade) return record.grade;
  const score = typeof record.condition_score === 'number' ? record.condition_score : PRICING_CONFIG.conditionScoreDefault;
  if (score >= 0.85) return 'A';
  if (score >= 0.65) return 'B';
  if (score >= 0.4) return 'C';
  return 'Salvage';
}

function computeProximityScore(distanceKm: number): number {
  return Math.max(0, 1 - distanceKm / SEARCH_RADIUS_KM);
}

function computeIntentScore(buyer: BuyerDoc, category: string): number {
  if (buyer.category_subscriptions.includes(category)) return 1.0;
  const viewed = buyer.activity.viewed_categories.find((v) => v.category === category);
  if (viewed) {
    if (viewed.count >= 3) return 0.7;
    if (viewed.count >= 1) return 0.4;
  }
  if (buyer.is_refurbisher) return 0.6;
  return 0.0;
}

function computePriceFitScore(offeredPrice: number, priceRange: { min: number; max: number }): number {
  if (offeredPrice >= priceRange.min && offeredPrice <= priceRange.max) return 1.0;
  if (offeredPrice < priceRange.min) return 0.8; // buyer can afford more — a deal for them
  const overPct = (offeredPrice - priceRange.max) / priceRange.max;
  if (overPct <= 0.1) return 0.6;
  if (overPct <= 0.25) return 0.4;
  return 0.1;
}

function computeRecencyScore(lastActive: Date): number {
  const daysSince = Math.max(0, (Date.now() - lastActive.getTime()) / (24 * 60 * 60 * 1000));
  return Math.exp(-0.1 * daysSince);
}

/**
 * Rank the local buyers eligible for a return. Runs one geo-filtered Mongo
 * query (the DB does the radius search via $nearSphere), then scores the
 * filtered set in application code. Throws ReturnNotFoundError /
 * ReturnIncompleteError — same contract as calculatePrice.
 */
export async function findCandidates(returnId: string): Promise<RankedCandidate[]> {
  const db = await getDb();
  const record = await db.collection<ReturnRecordDoc>(RETURNS).findOne({ returnId });
  if (!record) throw new ReturnNotFoundError(returnId);
  if (!record.pincode) throw new ReturnIncompleteError(['pincode']);

  const priceBreakdown = await calculatePrice(returnId);
  const offeredPrice = priceBreakdown.finalPrice;

  const productCoords = getPincodeCoordinates(record.pincode);
  const city = getCityForPincode(record.pincode);
  const grade = resolveGrade(record);
  const acceptableFloors = ALL_FLOORS.filter((f) => QUALITY_RANK[f] <= QUALITY_RANK[grade]);

  const filtered = await db
    .collection<BuyerDoc>(BUYERS)
    .find({
      is_active: true,
      location: {
        $nearSphere: {
          $geometry: { type: 'Point', coordinates: [productCoords.lng, productCoords.lat] },
          $maxDistance: SEARCH_RADIUS_KM * 1000,
        },
      },
      city,
      $or: [
        { category_subscriptions: record.category },
        { 'activity.viewed_categories.category': record.category },
        { is_refurbisher: true },
      ],
      condition_floor: { $in: acceptableFloors },
      'price_range.max': { $gte: offeredPrice },
    })
    .limit(MAX_FILTERED_CANDIDATES)
    .toArray();

  const ranked: RankedCandidate[] = filtered.map((buyer) => {
    const buyerCoords: LatLng = { lat: buyer.location.coordinates[1], lng: buyer.location.coordinates[0] };
    const distanceKm = haversineDistanceKm(productCoords, buyerCoords);
    const proximityScore = round2(computeProximityScore(distanceKm));
    const intentScore = round2(computeIntentScore(buyer, record.category));
    const priceFitScore = round2(computePriceFitScore(offeredPrice, buyer.price_range));
    const recencyScore = round2(computeRecencyScore(buyer.activity.last_active));
    const matchScore = round2(
      SCORE_WEIGHTS.proximity * proximityScore +
        SCORE_WEIGHTS.intent * intentScore +
        SCORE_WEIGHTS.priceFit * priceFitScore +
        SCORE_WEIGHTS.recency * recencyScore,
    );
    return { buyer, distanceKm: round2(distanceKm), proximityScore, intentScore, priceFitScore, recencyScore, matchScore };
  });

  ranked.sort((a, b) => b.matchScore - a.matchScore);
  return ranked.slice(0, TOP_N);
}

/** Shape a ranked candidate list into the persisted MatchCandidate form. Shared
 * by initiateMatchSession and the cascade job's search-retry path so the two
 * never drift on how a fresh candidate list gets written. */
export function toCandidateList(candidates: RankedCandidate[]): MatchCandidate[] {
  return candidates.map((c) => ({
    buyer_id: c.buyer._id,
    match_score: c.matchScore,
    proximity_score: c.proximityScore,
    intent_score: c.intentScore,
    price_fit_score: c.priceFitScore,
    recency_score: c.recencyScore,
    notified_at: null,
    response: 'pending',
    response_at: null,
  }));
}

/** Stub notification — no SMS/email/push provider exists yet. Logs everything a
 * real provider would need so the integration point is obvious. Never throws.
 * Spec 024, phase 6: when this buyer IS a real platform account
 * (`user_id` set — the ONLY case with anywhere to actually show it), it also
 * gets a real in-app notification via the same inbox/bell sellers use. Buyers
 * with no platform account (the common case — most seeded buyers are
 * synthetic) still only get the log line; there's nowhere to show them one. */
function sendNotification(
  buyer: BuyerDoc,
  product: { category: string; grade: string },
  price: number,
  returnId: string,
): void {
  // TODO: wire to a real SMS/email/push provider (Twilio/SES/FCM). For now this
  // is the entire "notification system" for buyers with no platform account —
  // a structured log line a human can read.
  const acceptLink = `https://reloop-woad.vercel.app/buyer/match/${randomUUID()}`;
  log('info', 'buyer notified', {
    buyerName: buyer.name,
    contact: buyer.contact,
    via: buyer.notification_preference,
    category: product.category,
    grade: product.grade,
    price,
    acceptLink,
  });

  if (buyer.user_id) {
    void createNotification({
      seller_id: buyer.user_id,
      kind: 'cascade_update',
      severity: 'info',
      title: 'A nearby return is available',
      body: `A ${product.grade}-grade ${product.category} return near you is available at ₹${price} — first come, first served.`,
      // Carries the return so the bell can deep-link to the Open Box listing
      // (`lst_ret_<returnId>`). Without it the notification is a dead end.
      return_id: returnId,
    }).catch(() => {});
  }
}

/** Called when a seller accepts local routing. Idempotent: replaying on an
 * already-matched return returns the existing session rather than erroring. */
export async function initiateMatchSession(returnId: string): Promise<WithId<MatchSessionDoc>> {
  const db = await getDb();
  const sessions = db.collection<MatchSessionDoc>(MATCH_SESSIONS);

  const existing = await sessions.findOne({ return_id: returnId });
  if (existing) return existing;

  const record = await db.collection<ReturnRecordDoc>(RETURNS).findOne({ returnId });
  if (!record) throw new ReturnNotFoundError(returnId);
  if (!record.pincode) throw new ReturnIncompleteError(['pincode']);

  const candidates = await findCandidates(returnId);
  const priceBreakdown = await calculatePrice(returnId);
  const grade = resolveGrade(record);
  const conditionScore = typeof record.condition_score === 'number' ? record.condition_score : PRICING_CONFIG.conditionScoreDefault;
  const city = getCityForPincode(record.pincode);

  const now = new Date();
  const candidateList: MatchCandidate[] = toCandidateList(candidates);

  const session: MatchSessionDoc = {
    return_id: returnId,
    listing_created_at: record.listing_created_at,
    pickup_deadline: record.pickup_deadline,
    status: candidateList.length > 0 ? 'notifying' : 'searching',
    category: record.category,
    region_cluster: record.region_cluster,
    city,
    condition_score: conditionScore,
    grade,
    offered_price: priceBreakdown.finalPrice,
    candidate_list: candidateList,
    current_candidate_index: 0,
    matched_buyer_id: null,
    matched_at: null,
    created_at: now,
    updated_at: now,
  };

  const { insertedId } = await sessions.insertOne(session);

  await db
    .collection<ReturnRecordDoc>(RETURNS)
    .updateOne({ returnId }, { $set: { match_session_id: insertedId, local_routing_accepted: true } });

  if (candidateList.length > 0) {
    await notifyBuyer(insertedId.toString(), 0);
  }

  const created = await sessions.findOne({ _id: insertedId });
  if (!created) throw new Error('match session vanished immediately after insert');
  return created;
}

/** Notify the candidate at the given index. Never throws — a stub/notify
 * failure is logged and swallowed so it can never take down the cascade job. */
export async function notifyBuyer(sessionId: string, candidateIndex: number): Promise<void> {
  try {
    const db = await getDb();
    const sessionObjectId = new ObjectId(sessionId);
    const sessions = db.collection<MatchSessionDoc>(MATCH_SESSIONS);
    const session = await sessions.findOne({ _id: sessionObjectId });
    if (!session) {
      log('warn', 'notifyBuyer: session not found', { sessionId, candidateIndex });
      return;
    }
    const candidate = session.candidate_list[candidateIndex];
    if (!candidate) {
      log('warn', 'notifyBuyer: candidate index out of range', { sessionId, candidateIndex });
      return;
    }
    const buyer = await db.collection<BuyerDoc>(BUYERS).findOne({ _id: candidate.buyer_id });
    if (!buyer) {
      log('warn', 'notifyBuyer: buyer not found', { sessionId, buyerId: candidate.buyer_id.toString() });
      return;
    }

    const now = new Date();
    await sessions.updateOne(
      { _id: sessionObjectId },
      {
        $set: {
          [`candidate_list.${candidateIndex}.notified_at`]: now,
          [`candidate_list.${candidateIndex}.response`]: 'pending',
          current_candidate_index: candidateIndex,
          status: 'notifying',
          updated_at: now,
        },
      },
    );

    sendNotification(buyer, { category: session.category, grade: session.grade }, session.offered_price, session.return_id);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error';
    log('error', 'notifyBuyer failed (continuing)', { sessionId, candidateIndex, detail });
  }
}

/** Record a buyer's accept/decline. Accept closes the session and logs the
 * highest-value demand signal in the system; decline cascades to the next
 * ranked candidate (or back to "searching" if the list is exhausted). */
export async function recordBuyerResponse(
  sessionId: string,
  buyerId: string,
  response: 'accepted' | 'declined',
): Promise<void> {
  const db = await getDb();
  const sessionObjectId = new ObjectId(sessionId);
  const sessions = db.collection<MatchSessionDoc>(MATCH_SESSIONS);
  const session = await sessions.findOne({ _id: sessionObjectId });
  if (!session) throw new MatchSessionNotFoundError(sessionId);

  if (session.status === 'matched' || session.status === 'expired' || session.status === 'warehouse_fallback') {
    log('warn', 'recordBuyerResponse: session already closed, ignoring', { sessionId, status: session.status });
    return;
  }

  const idx = session.candidate_list.findIndex((c) => c.buyer_id.toString() === buyerId);
  if (idx === -1) {
    log('warn', 'recordBuyerResponse: buyer is not a candidate in this session', { sessionId, buyerId });
    return;
  }
  if (idx !== session.current_candidate_index) {
    log('warn', 'recordBuyerResponse: response for a non-current candidate ignored', {
      sessionId,
      buyerId,
      candidateIndex: idx,
      currentIndex: session.current_candidate_index,
    });
    return;
  }

  const now = new Date();

  if (response === 'accepted') {
    const matchedBuyerId = new ObjectId(buyerId);
    await sessions.updateOne(
      { _id: sessionObjectId },
      {
        $set: {
          [`candidate_list.${idx}.response`]: 'accepted',
          [`candidate_list.${idx}.response_at`]: now,
          status: 'matched',
          matched_buyer_id: matchedBuyerId,
          matched_at: now,
          updated_at: now,
        },
      },
    );

    const returnRecord = await db.collection<ReturnRecordDoc>(RETURNS).findOne({ returnId: session.return_id });
    logDemandEvent('match_completed', session.category, returnRecord?.pincode ?? '');
    await createNotificationForReturn(session.return_id, {
      kind: 'cascade_update',
      severity: 'success',
      title: 'Matched with a local buyer!',
      body: `A nearby buyer accepted your ${session.category} return at ₹${session.offered_price}.`,
    });
    return;
  }

  // declined
  await sessions.updateOne(
    { _id: sessionObjectId },
    {
      $set: {
        [`candidate_list.${idx}.response`]: 'declined',
        [`candidate_list.${idx}.response_at`]: now,
        updated_at: now,
      },
    },
  );

  const nextIndex = idx + 1;
  if (nextIndex < session.candidate_list.length) {
    await notifyBuyer(sessionId, nextIndex);
  } else {
    await sessions.updateOne({ _id: sessionObjectId }, { $set: { status: 'searching', updated_at: now } });
  }
}
