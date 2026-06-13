// Listing Agent narration route. Validates the decision, returns one narrated
// sentence. Never 502s — narration always degrades to a deterministic template.

import { Router } from 'express';
import { z } from 'zod';
import type { AgentNarrateRequest, ApiError } from '@reloop/shared';
import type { Config } from '../config.js';
import { fallbackNarration, narrateAgentDecision } from '../services/agent/narration.js';

const schema = z.object({
  action: z.enum(['hold', 'reprice', 'widen_radius', 'improve_listing', 'escalate_route']),
  diagnosis: z.string().max(400),
  priceFromCents: z.number().optional(),
  priceToCents: z.number().optional(),
  floorCents: z.number().optional(),
  comparableCents: z.number(),
  demand: z.enum(['low', 'medium', 'high']),
  radiusKm: z.number().optional(),
  routeRecommendation: z.enum(['donate', 'recycle']).optional(),
  day: z.number(),
  title: z.string().max(200),
});

function apiError(code: string, message: string): ApiError {
  return { error: { code, message } };
}

export function createAgentRouter(cfg: Config): Router {
  const router = Router();

  router.post('/narrate', async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      return res.status(400).json(apiError('invalid_request', message));
    }
    const request = parsed.data as AgentNarrateRequest;
    try {
      const text = await narrateAgentDecision(cfg, request);
      return res.json({ text });
    } catch {
      // Belt and braces — the service already falls back, but never fail here.
      return res.json({ text: fallbackNarration(request) });
    }
  });

  return router;
}
