// Dynamic-pricing routes (spec 014). The event-driven reprice loop:
//   POST /api/pricing/decide        — an event fires → return a clamped, narrated price
//   POST /api/pricing/outcome       — log a sale/reroute result → reward → bandit update
//   GET  /api/pricing/state/:listingId — current pooled bandit posteriors (for dashboards)
//   GET  /api/pricing/model-info    — the real trained model's offline eval (technical trace view)

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { z } from 'zod';
import { PRICE_ARMS, type PricingModelInfo } from '@reloop/shared';
import type { RepriceEngine } from '../services/pricing/reprice-engine.js';
import { getReqId, log } from '../lib/logger.js';

const here = dirname(fileURLToPath(import.meta.url)); // apps/api/src/routes
// A committed, frozen snapshot of ml/pricing's real training run — the actual
// XGBoost warm-start's SHAP-style feature importances + val MAE/MAPE
// (ml/pricing/runs/warmstart/v1/eval_results.json). That directory is
// gitignored (ml/pricing/.gitignore), so it never reaches the deployed API;
// this file is a real, honest copy of its numbers, not a fabrication —
// re-copy it whenever the model is retrained.
const modelInfo: PricingModelInfo = JSON.parse(
  readFileSync(join(here, '../data/pricing-model-info.json'), 'utf-8'),
) as PricingModelInfo;

const eventTypeEnum = z.enum([
  'comp_sold',
  'comp_listed',
  'asin_new_price_changed',
  'view_velocity_drop',
  'dwell_threshold',
  'save_no_purchase',
  'heartbeat',
  'initial_listing',
  'seller_markdown',
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
  currentPrice: z.number().positive().optional(),
  // Request metadata (spec 024) letting the engine resolve real geo/local
  // features instead of the flat placeholder defaults — not part of `state`.
  pincode: z.string().trim().min(1).optional(),
  returnId: z.string().trim().min(1).optional(),
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
    const { listingId, currentPrice, pincode, returnId, event, state } = parsed.data;
    void engine
      .decide({
        listingId,
        ...(currentPrice !== undefined ? { currentPrice } : {}),
        ...(pincode !== undefined ? { pincode } : {}),
        ...(returnId !== undefined ? { returnId } : {}),
        event: { type: event.type, listingId, timestamp: new Date().toISOString(), payload: event.payload },
        state,
      })
      .then((decision) => res.json(decision))
      .catch((err: unknown) => {
        log('error', 'pricing decide failed', {
          reqId: getReqId(req),
          listingId,
          detail: err instanceof Error ? err.message : String(err),
        });
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

  router.get('/model-info', (_req, res) => {
    res.json(modelInfo);
  });

  return router;
}
