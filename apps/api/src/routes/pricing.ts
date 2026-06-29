// Dynamic-pricing routes (spec 014). The event-driven reprice loop:
//   POST /api/pricing/decide        — an event fires → return a clamped, narrated price
//   POST /api/pricing/outcome       — log a sale/reroute result → reward → bandit update
//   GET  /api/pricing/state/:listingId — current pooled bandit posteriors (for dashboards)

import { Router } from 'express';
import { z } from 'zod';
import { PRICE_ARMS } from '@reloop/shared';
import type { RepriceEngine } from '../services/pricing/reprice-engine.js';

const eventTypeEnum = z.enum([
  'comp_sold',
  'comp_listed',
  'asin_new_price_changed',
  'view_velocity_drop',
  'dwell_threshold',
  'save_no_purchase',
  'heartbeat',
  'initial_listing',
]);

const stateSchema = z
  .object({
    category: z.string(),
    gradeKey: z.enum(['new', 'like-new', 'good', 'fair', 'poor']),
    compMedianPrice: z.number().positive(),
    amazonNewPrice: z.number().positive(),
    sellerFloor: z.number().nonnegative(),
    routeElsewhereValue: z.number().nonnegative(),
  })
  .passthrough();

const decideSchema = z.object({
  listingId: z.string().min(1),
  event: z.object({
    type: eventTypeEnum,
    payload: z.record(z.unknown()).default({}),
  }),
  state: stateSchema,
});

const armValues = PRICE_ARMS as readonly number[];
const outcomeSchema = z.object({
  listingId: z.string().min(1),
  decisionId: z.string().default(''),
  arm: z.number().refine((a) => armValues.includes(a), 'must be one of the price arms'),
  finalPrice: z.number(),
  sold: z.boolean(),
  daysOnMarket: z.number().nonnegative(),
  soldLocally: z.boolean().default(false),
  rerouted: z.boolean().default(false),
  rerouteDestination: z.string().optional(),
});

export function createPricingRouter(engine: RepriceEngine): Router {
  const router = Router();

  router.post('/decide', (req, res) => {
    const parsed = decideSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { listingId, event, state } = parsed.data;
    void engine
      .decide({
        listingId,
        event: { type: event.type, listingId, timestamp: new Date().toISOString(), payload: event.payload },
        state,
      })
      .then((decision) => res.json(decision))
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[reloop/api] pricing decide failed:', err);
        res.status(500).json({ error: 'pricing decision failed' });
      });
  });

  router.post('/outcome', (req, res) => {
    const parsed = outcomeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const result = engine.logOutcome({ ...parsed.data, arm: parsed.data.arm as (typeof PRICE_ARMS)[number], reward: 0 });
    res.json({ ok: true, ...result, loggedOutcomes: engine.loggedOutcomeCount });
  });

  router.get('/state/:listingId', (req, res) => {
    const state = engine.getBanditState(req.params.listingId);
    if (!state) {
      res.status(404).json({ error: 'no decisions recorded for this listing yet' });
      return;
    }
    res.json(state);
  });

  return router;
}
