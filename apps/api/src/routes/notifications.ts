// In-app notification routes (spec 024). Mirrors the DB-backed route
// convention used by pricing.ts/returns.ts/matching.ts (mongo guard → 503,
// zod validation → 400, apiError helper).

import { Router } from 'express';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import type { ApiError } from '@reloop/shared';
import { isMongoConfigured } from '../lib/mongo.js';
import { log } from '../lib/logger.js';
import {
  createNotification,
  getPreferences,
  listNotifications,
  markAllRead,
  markRead,
  setPreferences,
} from '../services/notifications/notification-service.js';

function apiError(code: string, message: string): ApiError {
  return { error: { code, message } };
}

const createSchema = z.object({
  sellerId: z.string().trim().min(1).max(120),
  kind: z.enum(['cascade_update', 'sales_agent', 'listing_agent']),
  severity: z.enum(['info', 'warning', 'success']),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(1000),
  returnId: z.string().trim().max(120).optional(),
  listingId: z.string().trim().max(120).optional(),
});

const preferencesSchema = z.object({
  mutedKinds: z.array(z.enum(['cascade_update', 'sales_agent', 'listing_agent'])).default([]),
  quietHoursStart: z.number().int().min(0).max(23).optional(),
  quietHoursEnd: z.number().int().min(0).max(23).optional(),
});

function prefsToWire(doc: {
  seller_id: string;
  muted_kinds: string[];
  quiet_hours_start?: number;
  quiet_hours_end?: number;
}) {
  return {
    sellerId: doc.seller_id,
    mutedKinds: doc.muted_kinds,
    quietHoursStart: doc.quiet_hours_start,
    quietHoursEnd: doc.quiet_hours_end,
  };
}

function toWire(doc: {
  _id?: ObjectId;
  seller_id: string;
  kind: string;
  severity: string;
  title: string;
  body: string;
  return_id?: string;
  listing_id?: string;
  read: boolean;
  created_at: Date;
}) {
  return {
    id: doc._id!.toString(),
    sellerId: doc.seller_id,
    kind: doc.kind,
    severity: doc.severity,
    title: doc.title,
    body: doc.body,
    returnId: doc.return_id,
    listingId: doc.listing_id,
    read: doc.read,
    createdAt: doc.created_at.toISOString(),
  };
}

export function createNotificationsRouter(): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      return res.status(400).json(apiError('invalid_request', message));
    }
    if (!isMongoConfigured()) {
      return res.status(503).json(apiError('notifications_unavailable', 'Notifications database not configured'));
    }
    try {
      const { sellerId, returnId, listingId, ...rest } = parsed.data;
      const doc = await createNotification({
        seller_id: sellerId,
        return_id: returnId,
        listing_id: listingId,
        ...rest,
      });
      // `null` means muted/quiet-hours-suppressed, not an error — 200 with no doc.
      return res.json(doc ? toWire(doc) : { suppressed: true });
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      log('error', 'notification create failed', { detail });
      return res.status(503).json(apiError('notifications_unavailable', 'Could not reach the notifications database'));
    }
  });

  router.get('/:sellerId', async (req, res) => {
    const { sellerId } = req.params;
    if (!isMongoConfigured()) {
      return res.status(503).json(apiError('notifications_unavailable', 'Notifications database not configured'));
    }
    try {
      const unreadOnly = req.query.unreadOnly === 'true';
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const docs = await listNotifications(sellerId, { unreadOnly, limit });
      return res.json({ notifications: docs.map(toWire) });
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      log('error', 'notification list failed', { sellerId, detail });
      return res.status(503).json(apiError('notifications_unavailable', 'Could not reach the notifications database'));
    }
  });

  router.patch('/:id/read', async (req, res) => {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json(apiError('invalid_request', 'id must be a valid id'));
    }
    if (!isMongoConfigured()) {
      return res.status(503).json(apiError('notifications_unavailable', 'Notifications database not configured'));
    }
    try {
      await markRead(id);
      return res.json({ ok: true });
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      log('error', 'notification mark-read failed', { id, detail });
      return res.status(503).json(apiError('notifications_unavailable', 'Could not reach the notifications database'));
    }
  });

  router.patch('/:sellerId/read-all', async (req, res) => {
    const { sellerId } = req.params;
    if (!isMongoConfigured()) {
      return res.status(503).json(apiError('notifications_unavailable', 'Notifications database not configured'));
    }
    try {
      await markAllRead(sellerId);
      return res.json({ ok: true });
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      log('error', 'notification mark-all-read failed', { sellerId, detail });
      return res.status(503).json(apiError('notifications_unavailable', 'Could not reach the notifications database'));
    }
  });

  // GET/PUT /api/notifications/:sellerId/preferences — mute a kind or set
  // quiet hours (spec 024, phase 4).
  router.get('/:sellerId/preferences', async (req, res) => {
    const { sellerId } = req.params;
    if (!isMongoConfigured()) {
      return res.status(503).json(apiError('notifications_unavailable', 'Notifications database not configured'));
    }
    try {
      const prefs = await getPreferences(sellerId);
      return res.json(prefsToWire(prefs));
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      log('error', 'notification preferences read failed', { sellerId, detail });
      return res.status(503).json(apiError('notifications_unavailable', 'Could not reach the notifications database'));
    }
  });

  router.put('/:sellerId/preferences', async (req, res) => {
    const { sellerId } = req.params;
    const parsed = preferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      return res.status(400).json(apiError('invalid_request', message));
    }
    if (!isMongoConfigured()) {
      return res.status(503).json(apiError('notifications_unavailable', 'Notifications database not configured'));
    }
    try {
      const { mutedKinds, quietHoursStart, quietHoursEnd } = parsed.data;
      const prefs = await setPreferences(sellerId, {
        muted_kinds: mutedKinds,
        quiet_hours_start: quietHoursStart,
        quiet_hours_end: quietHoursEnd,
      });
      return res.json(prefsToWire(prefs));
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      log('error', 'notification preferences write failed', { sellerId, detail });
      return res.status(503).json(apiError('notifications_unavailable', 'Could not reach the notifications database'));
    }
  });

  return router;
}
