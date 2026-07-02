// Pricing route — GET /api/pricing/:returnId returns the live price breakdown for
// a return record. Pure read: calls the write-free pricing engine, so it's safe
// to hit on every page view. Mirrors the DB-backed route convention used by
// state.ts / auth.ts (mongo guard → 503, apiError helper, typed error mapping).

import { Router } from 'express';
import type { ApiError } from '@reloop/shared';
import { isMongoConfigured } from '../lib/mongo.js';
import { ReturnIncompleteError, ReturnNotFoundError } from '../lib/errors.js';
import { log } from '../lib/logger.js';
import { calculatePrice } from '../services/pricingEngine.js';

function apiError(code: string, message: string): ApiError {
  return { error: { code, message } };
}

export function createPricingRouter(): Router {
  const router = Router();

  router.get('/:returnId', async (req, res) => {
    const { returnId } = req.params;
    if (!isMongoConfigured()) {
      return res.status(503).json(apiError('pricing_unavailable', 'Pricing database not configured'));
    }
    try {
      const breakdown = await calculatePrice(returnId);
      return res.json(breakdown);
    } catch (err) {
      if (err instanceof ReturnNotFoundError) {
        return res.status(404).json(apiError('return_not_found', err.message));
      }
      if (err instanceof ReturnIncompleteError) {
        return res.status(400).json(apiError('return_incomplete', err.message));
      }
      const detail = err instanceof Error ? err.message : 'unknown error';
      log('error', 'pricing calculation failed', { returnId, detail });
      return res.status(503).json(apiError('pricing_unavailable', 'Could not compute price'));
    }
  });

  return router;
}
