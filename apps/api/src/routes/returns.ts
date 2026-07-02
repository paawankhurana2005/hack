// Returns record write path — POST /api/returns upserts the structured return
// record the pricing engine reads. Called by the seller dashboard when a return
// is approved for local routing. Idempotent (keyed by returnId) so re-approving
// or replaying is safe. Mirrors the DB-backed route convention in state.ts.

import { Router } from 'express';
import { z } from 'zod';
import type { ApiError } from '@reloop/shared';
import { getDb, isMongoConfigured } from '../lib/mongo.js';
import { log } from '../lib/logger.js';
import { RETURNS, type ReturnRecordDoc } from '../lib/collections.js';

// Dates arrive as ISO strings on the wire; coerced to Date for Mongo below.
const returnSchema = z.object({
  returnId: z.string().trim().min(1).max(120),
  productName: z.string().max(200).optional(),
  category: z.string().trim().min(1).max(60),
  region_cluster: z.string().trim().min(1).max(60),
  pincode: z.string().trim().max(12).optional(),
  base_price: z.number().finite().nonnegative(),
  condition_score: z.number().min(0).max(1).optional(),
  pickup_deadline: z.string().datetime(),
  listing_created_at: z.string().datetime(),
  grade: z.enum(['A', 'B', 'C', 'Salvage']).nullable().optional(),
  sku: z.string().max(60).optional(),
});

function apiError(code: string, message: string): ApiError {
  return { error: { code, message } };
}

export function createReturnsRouter(): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const parsed = returnSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      return res.status(400).json(apiError('invalid_request', message));
    }
    if (!isMongoConfigured()) {
      return res.status(503).json(apiError('returns_unavailable', 'Returns database not configured'));
    }

    const { pickup_deadline, listing_created_at, ...rest } = parsed.data;
    const doc: ReturnRecordDoc = {
      ...rest,
      pickup_deadline: new Date(pickup_deadline),
      listing_created_at: new Date(listing_created_at),
    };

    try {
      const db = await getDb();
      await db
        .collection<ReturnRecordDoc>(RETURNS)
        .updateOne({ returnId: doc.returnId }, { $set: doc }, { upsert: true });
      return res.json({ ok: true, returnId: doc.returnId });
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      log('error', 'return record upsert failed', { returnId: doc.returnId, detail });
      return res.status(503).json(apiError('returns_unavailable', 'Could not reach the returns database'));
    }
  });

  return router;
}
