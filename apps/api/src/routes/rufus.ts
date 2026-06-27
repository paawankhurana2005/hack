// Rufus chat route. Validates the question + Health Card context, returns one
// grounded answer. Never 5xx — answers always degrade to a deterministic reply.

import { Router } from 'express';
import { z } from 'zod';
import type { ApiError, RufusRequest } from '@reloop/shared';
import type { Config } from '../config.js';
import { answerRufus, fallbackAnswer } from '../services/rufus/rufus-service.js';

const contextSchema = z.object({
  title: z.string().max(200),
  category: z.string().max(40),
  grade: z.enum(['new', 'like-new', 'good', 'fair', 'poor']),
  confidence: z.number(),
  summary: z.string().max(600),
  detectedIssues: z.array(z.string().max(200)).max(20),
  authenticityVerified: z.boolean(),
  listingPriceInr: z.number(),
  originalPriceInr: z.number().optional(),
  co2SavedKg: z.number().optional(),
  ecoCredits: z.number().optional(),
  sellerName: z.string().max(120).optional(),
  specs: z.record(z.string().max(120)).optional(),
  priorQa: z
    .array(z.object({ q: z.string().max(400), a: z.string().max(600) }))
    .max(10)
    .optional(),
});

const schema = z.object({
  question: z.string().trim().min(1).max(400),
  context: contextSchema,
});

function apiError(code: string, message: string): ApiError {
  return { error: { code, message } };
}

export function createRufusRouter(cfg: Config): Router {
  const router = Router();

  router.post('/ask', async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      return res.status(400).json(apiError('invalid_request', message));
    }
    const request = parsed.data as RufusRequest;
    try {
      const text = await answerRufus(cfg, request);
      return res.json({ text });
    } catch {
      return res.json({ text: fallbackAnswer(request.context) });
    }
  });

  return router;
}
