// Spec 025: gates the return-flow's model-calling routes (/api/grade,
// /api/route, /api/return/checkpoint, /api/health-card) behind a shared
// secret once the async return-worker Lambda becomes their only real caller
// (the browser stops calling them directly — see BuyerStep2Pickup.tsx).
// Optional by design, same graceful-degrade convention as Mongo/Langfuse: when
// INTERNAL_API_SECRET is unset, the gate is skipped entirely so local dev
// never needs it configured.

import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { log } from './logger.js';

let warned = false;

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function requireInternalSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = config.INTERNAL_API_SECRET;
  if (!secret) {
    if (!warned) {
      warned = true;
      log('warn', 'INTERNAL_API_SECRET is unset — return-flow routes are unauthenticated');
    }
    next();
    return;
  }

  const provided = req.headers['x-reloop-internal-secret'];
  if (typeof provided !== 'string' || !secretsMatch(provided, secret)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}
