// Cloud state sync — a generic per-scope key/value snapshot store backed by
// MongoDB. The web app mirrors its localStorage here so a user's data follows
// them across devices/sessions. Each "scope" is either an account id (per-user
// data) or "__shared__" (the shared marketplace / returns queue).
//
// Best-effort by design: localStorage stays the fast local source of truth; this
// is the durable cloud copy. Values are opaque JSON strings (already serialized
// by the client), so this layer never needs to understand their shape.

import { Router } from 'express';
import { z } from 'zod';
import type { ApiError } from '@reloop/shared';
import { getDb, isMongoConfigured } from '../lib/mongo.js';
import { getReqId, log } from '../lib/logger.js';

const COLLECTION = 'state';

// scope = "__shared__" or an account id like "user_aarav" / "seller_urban".
const SCOPE_RE = /^(__shared__|[a-z]+_[a-z0-9_]+)$/;

const putSchema = z.object({
  // Map of localStorage key -> raw stored string. Values are already JSON.
  data: z.record(z.string().max(5_000_000)),
});

interface StateDoc {
  scope: string;
  data: Record<string, string>;
  updatedAt: string;
}

function apiError(code: string, message: string): ApiError {
  return { error: { code, message } };
}

export function createStateRouter(): Router {
  const router = Router();

  router.get('/:scope', async (req, res) => {
    const { scope } = req.params;
    if (!SCOPE_RE.test(scope)) {
      return res.status(400).json(apiError('invalid_scope', 'Bad scope'));
    }
    if (!isMongoConfigured()) {
      return res.status(503).json(apiError('state_unavailable', 'State database not configured'));
    }
    try {
      const db = await getDb();
      const doc = await db
        .collection<StateDoc>(COLLECTION)
        .findOne({ scope }, { projection: { _id: 0 } });
      return res.json(doc ?? { scope, data: {}, updatedAt: null });
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      log('error', 'state get failed', { reqId: getReqId(req), scope, detail });
      return res.status(503).json(apiError('state_unavailable', 'Could not reach the state database'));
    }
  });

  router.put('/:scope', async (req, res) => {
    const { scope } = req.params;
    if (!SCOPE_RE.test(scope)) {
      return res.status(400).json(apiError('invalid_scope', 'Bad scope'));
    }
    const parsed = putSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      return res.status(400).json(apiError('invalid_request', message));
    }
    if (!isMongoConfigured()) {
      return res.status(503).json(apiError('state_unavailable', 'State database not configured'));
    }
    try {
      const db = await getDb();
      const updatedAt = new Date().toISOString();
      await db.collection<StateDoc>(COLLECTION).updateOne(
        { scope },
        { $set: { scope, data: parsed.data.data, updatedAt } },
        { upsert: true },
      );
      return res.json({ ok: true, updatedAt });
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      log('error', 'state put failed', { reqId: getReqId(req), scope, detail });
      return res.status(503).json(apiError('state_unavailable', 'Could not reach the state database'));
    }
  });

  return router;
}
