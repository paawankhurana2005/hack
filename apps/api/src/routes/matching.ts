// Local buyer matching routes — the API surface for the rescue-pipeline
// matching engine. Mirrors the DB-backed route convention used by pricing.ts /
// returns.ts (mongo guard → 503, zod validation → 400, apiError helper, typed
// error mapping).

import { Router } from 'express';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import type { ApiError, MatchCandidateGeo } from '@reloop/shared';
import { getDb, isMongoConfigured } from '../lib/mongo.js';
import { log } from '../lib/logger.js';
import { getRegionCluster, getPincodeCoordinates, getCityForPincode, haversineDistanceKm } from '../lib/regionCluster.js';
import { BUYERS, MATCH_SESSIONS, RETURNS, type BuyerDoc, type MatchSessionDoc, type ReturnRecordDoc } from '../lib/collections.js';
import { initiateMatchSession, recordBuyerResponse } from '../services/matchingEngine.js';
import { logDemandEvent } from '../services/demandEvents.js';
import { MatchSessionNotFoundError, ReturnIncompleteError, ReturnNotFoundError } from '../lib/errors.js';

function apiError(code: string, message: string): ApiError {
  return { error: { code, message } };
}

const respondSchema = z.object({
  buyerId: z.string().trim().min(1),
  response: z.enum(['accepted', 'declined']),
});

const registerBuyerSchema = z.object({
  user_id: z.string().trim().min(1).nullable().optional(),
  name: z.string().trim().min(1).max(120),
  contact: z.string().trim().min(1).max(120),
  notification_preference: z.enum(['sms', 'email', 'push']),
  pincode: z.string().trim().min(4).max(12),
  category_subscriptions: z.array(z.string().trim().min(1).max(60)).default([]),
  price_range: z.object({
    min: z.number().finite().nonnegative(),
    max: z.number().finite().nonnegative(),
  }),
  condition_floor: z.enum(['A', 'B', 'C', 'Salvage']),
  is_refurbisher: z.boolean().default(false),
});

const activitySchema = z.object({
  category: z.string().trim().min(1).max(60),
});

export function createMatchingRouter(): Router {
  const router = Router();

  // POST /api/matching/initiate/:returnId — seller accepted local routing.
  router.post('/initiate/:returnId', async (req, res) => {
    const { returnId } = req.params;
    if (!isMongoConfigured()) {
      return res.status(503).json(apiError('matching_unavailable', 'Matching database not configured'));
    }
    try {
      const session = await initiateMatchSession(returnId);
      return res.json({
        sessionId: session._id.toString(),
        returnId: session.return_id,
        status: session.status,
        candidateCount: session.candidate_list.length,
      });
    } catch (err) {
      if (err instanceof ReturnNotFoundError) {
        return res.status(404).json(apiError('return_not_found', err.message));
      }
      if (err instanceof ReturnIncompleteError) {
        return res.status(400).json(apiError('return_incomplete', err.message));
      }
      const detail = err instanceof Error ? err.message : 'unknown error';
      log('error', 'match session initiation failed', { returnId, detail });
      return res.status(503).json(apiError('matching_unavailable', 'Could not initiate matching'));
    }
  });

  // POST /api/matching/respond/:sessionId — a buyer accepts or declines.
  router.post('/respond/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const parsed = respondSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      return res.status(400).json(apiError('invalid_request', message));
    }
    if (!ObjectId.isValid(sessionId)) {
      return res.status(400).json(apiError('invalid_request', 'sessionId must be a valid id'));
    }
    if (!isMongoConfigured()) {
      return res.status(503).json(apiError('matching_unavailable', 'Matching database not configured'));
    }

    const { buyerId, response } = parsed.data;
    if (!ObjectId.isValid(buyerId)) {
      return res.status(400).json(apiError('invalid_request', 'buyerId must be a valid id'));
    }

    try {
      await recordBuyerResponse(sessionId, buyerId, response);
      const db = await getDb();
      const session = await db
        .collection<MatchSessionDoc>(MATCH_SESSIONS)
        .findOne({ _id: new ObjectId(sessionId) });
      if (!session) {
        return res.status(404).json(apiError('match_session_not_found', `Match session not found: ${sessionId}`));
      }
      return res.json({
        sessionId: session._id.toString(),
        status: session.status,
        matchedBuyerId: session.matched_buyer_id?.toString() ?? null,
      });
    } catch (err) {
      if (err instanceof MatchSessionNotFoundError) {
        return res.status(404).json(apiError('match_session_not_found', err.message));
      }
      const detail = err instanceof Error ? err.message : 'unknown error';
      log('error', 'recording buyer response failed', { sessionId, detail });
      return res.status(503).json(apiError('matching_unavailable', 'Could not record buyer response'));
    }
  });

  // GET /api/matching/status/:returnId — polled by the seller dashboard.
  router.get('/status/:returnId', async (req, res) => {
    const { returnId } = req.params;
    if (!isMongoConfigured()) {
      return res.status(503).json(apiError('matching_unavailable', 'Matching database not configured'));
    }
    try {
      const db = await getDb();
      const session = await db.collection<MatchSessionDoc>(MATCH_SESSIONS).findOne({ return_id: returnId });
      if (!session) {
        return res.status(404).json(apiError('match_session_not_found', `No match session for return: ${returnId}`));
      }

      // Spec 023: illustrative geo for the seller's nearby-buyers map — derived
      // at read-time (not stored). Origin = the return's own pincode centroid;
      // omits buyer.contact (PII) from the response entirely.
      const notified = session.candidate_list.filter((c) => c.notified_at !== null);
      let candidates: MatchCandidateGeo[] = [];
      if (notified.length > 0) {
        const returnDoc = await db.collection<ReturnRecordDoc>(RETURNS).findOne({ returnId });
        const origin = getPincodeCoordinates(returnDoc?.pincode ?? '560001');
        const buyerDocs = await db
          .collection<BuyerDoc>(BUYERS)
          .find({ _id: { $in: notified.map((c) => c.buyer_id) } })
          .toArray();
        const buyerById = new Map(buyerDocs.map((b) => [b._id!.toString(), b]));
        candidates = notified.map((c) => {
          const buyer = buyerById.get(c.buyer_id.toString());
          const [lng, lat] = buyer?.location.coordinates ?? [origin.lng, origin.lat];
          return {
            buyerId: c.buyer_id.toString(),
            city: buyer?.city ?? 'Unknown',
            lat,
            lng,
            distanceKm: Math.round(haversineDistanceKm(origin, { lat, lng }) * 10) / 10,
            matchScore: c.match_score,
            response: c.response,
            // Real data the engine already computed/persisted (findCandidates'
            // ranking + the cascade's own timestamps) — surfaced for the
            // notification-cascade trace timeline, not the default map.
            name: buyer?.name ?? 'Unknown buyer',
            notifiedAt: c.notified_at,
            responseAt: c.response_at,
            proximityScore: c.proximity_score,
            intentScore: c.intent_score,
            priceFitScore: c.price_fit_score,
            recencyScore: c.recency_score,
          };
        });
      }

      return res.json({
        sessionId: session._id.toString(),
        returnId: session.return_id,
        status: session.status,
        offeredPrice: session.offered_price,
        candidateCount: session.candidate_list.length,
        currentCandidateIndex: session.current_candidate_index,
        matchedBuyerId: session.matched_buyer_id?.toString() ?? null,
        matchedAt: session.matched_at,
        pickupDeadline: session.pickup_deadline,
        candidates,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      log('error', 'match status lookup failed', { returnId, detail });
      return res.status(503).json(apiError('matching_unavailable', 'Could not reach the matching database'));
    }
  });

  // POST /api/matching/buyers/register — register a new local buyer.
  router.post('/buyers/register', async (req, res) => {
    const parsed = registerBuyerSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      return res.status(400).json(apiError('invalid_request', message));
    }
    if (!isMongoConfigured()) {
      return res.status(503).json(apiError('matching_unavailable', 'Matching database not configured'));
    }

    const { pincode, user_id, ...rest } = parsed.data;
    const coords = getPincodeCoordinates(pincode);
    const doc: BuyerDoc = {
      ...rest,
      user_id: user_id ?? null,
      location: { type: 'Point', coordinates: [coords.lng, coords.lat] },
      pincode,
      city: getCityForPincode(pincode),
      region_cluster: getRegionCluster(pincode),
      activity: { last_active: new Date(), viewed_categories: [], completed_purchases: 0, avg_purchase_price: 0 },
      is_active: true,
      created_at: new Date(),
    };

    try {
      const db = await getDb();
      const result = await db.collection<BuyerDoc>(BUYERS).insertOne(doc);
      return res.json({ buyerId: result.insertedId.toString(), city: doc.city, region_cluster: doc.region_cluster });
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      log('error', 'buyer registration failed', { detail });
      return res.status(503).json(apiError('matching_unavailable', 'Could not reach the matching database'));
    }
  });

  // PATCH /api/matching/buyers/:buyerId/activity — fire-and-forget interaction tracking.
  router.patch('/buyers/:buyerId/activity', async (req, res) => {
    const { buyerId } = req.params;
    const parsed = activitySchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      return res.status(400).json(apiError('invalid_request', message));
    }
    if (!ObjectId.isValid(buyerId)) {
      return res.status(400).json(apiError('invalid_request', 'buyerId must be a valid id'));
    }
    if (!isMongoConfigured()) {
      return res.status(503).json(apiError('matching_unavailable', 'Matching database not configured'));
    }

    const { category } = parsed.data;

    try {
      const db = await getDb();
      const buyers = db.collection<BuyerDoc>(BUYERS);
      const buyer = await buyers.findOne({ _id: new ObjectId(buyerId) });
      if (!buyer) {
        return res.status(404).json(apiError('buyer_not_found', `Buyer not found: ${buyerId}`));
      }

      const now = new Date();
      const existingIdx = buyer.activity.viewed_categories.findIndex((v) => v.category === category);
      if (existingIdx === -1) {
        await buyers.updateOne(
          { _id: buyer._id },
          {
            $set: { 'activity.last_active': now },
            $push: { 'activity.viewed_categories': { category, count: 1, last_viewed: now } },
          },
        );
      } else {
        await buyers.updateOne(
          { _id: buyer._id },
          {
            $set: {
              'activity.last_active': now,
              [`activity.viewed_categories.${existingIdx}.count`]: buyer.activity.viewed_categories[existingIdx]!.count + 1,
              [`activity.viewed_categories.${existingIdx}.last_viewed`]: now,
            },
          },
        );
      }

      logDemandEvent('view', category, buyer.pincode);
      return res.json({ ok: true });
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      log('error', 'buyer activity update failed', { buyerId, detail });
      return res.status(503).json(apiError('matching_unavailable', 'Could not reach the matching database'));
    }
  });

  return router;
}
