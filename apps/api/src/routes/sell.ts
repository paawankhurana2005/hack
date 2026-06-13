// Sell-flow routes. /grade runs real AI grading; /price recommends a resale price.

import { Router } from 'express';
import { z } from 'zod';
import type { ApiError } from '@reloop/shared';
import type { GradingService } from '../services/grading/grading-service.js';
import type { PricingService } from '../services/pricing/pricing-service.js';
import type { HealthCardService } from '../services/health-card/health-card-service.js';

const MAX_IMAGES = 4;
// ~2.6MB of base64 ≈ ~2MB binary per image; generous upper bound before we reject.
const MAX_B64_LEN = 2_600_000;

const categoryEnum = z.enum([
  'electronics',
  'home',
  'fashion',
  'sports',
  'toys',
  'books',
  'other',
]);

const gradeEnum = z.enum(['new', 'like-new', 'good', 'fair', 'poor']);
const moneySchema = z.object({ amountCents: z.number(), currency: z.literal('USD') });

const draftSchema = z.object({
  title: z.string().trim().min(1).max(140),
  category: categoryEnum,
  notes: z.string().trim().max(500).optional(),
});

const gradeSchema = z.object({
  draft: draftSchema,
  imagesBase64: z
    .array(z.string().min(1).max(MAX_B64_LEN))
    .min(1, 'at least one image is required')
    .max(MAX_IMAGES, `at most ${MAX_IMAGES} images`),
});

const priceSchema = z.object({
  draft: draftSchema,
  grade: gradeEnum,
  detectedIssues: z.array(z.string().trim().max(200)).max(20).default([]),
});

// Full result shapes the client echoes back to assemble the health card.
const gradingResultSchema = z.object({
  id: z.string(),
  productId: z.string(),
  grade: gradeEnum,
  confidence: z.number(),
  detectedIssues: z.array(z.string()),
  summary: z.string(),
  photoUrls: z.array(z.string()),
  gradedAt: z.string(),
});

const pricingResultSchema = z.object({
  id: z.string(),
  productId: z.string(),
  grade: gradeEnum,
  estimatedRetail: moneySchema,
  suggestedPrice: moneySchema,
  discountPct: z.number(),
  demand: z.enum(['low', 'medium', 'high']),
  rationale: z.string(),
  factors: z.array(z.object({ label: z.string(), value: z.string() })),
  pricedAt: z.string(),
});

const healthCardSchema = z.object({
  draft: draftSchema,
  grading: gradingResultSchema,
  pricing: pricingResultSchema,
});

function apiError(code: string, message: string): ApiError {
  return { error: { code, message } };
}

export function createSellRouter(
  grading: GradingService,
  pricing: PricingService,
  healthCard: HealthCardService,
): Router {
  const router = Router();

  router.post('/grade', async (req, res) => {
    const parsed = gradeSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      return res.status(400).json(apiError('invalid_request', message));
    }
    try {
      const result = await grading.grade(parsed.data);
      return res.json(result);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      // eslint-disable-next-line no-console
      console.error('[reloop/api] grading failed:', detail);
      return res
        .status(502)
        .json(apiError('grading_failed', `Grading failed: ${detail.slice(0, 200)}`));
    }
  });

  router.post('/price', async (req, res) => {
    const parsed = priceSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      return res.status(400).json(apiError('invalid_request', message));
    }
    try {
      const result = await pricing.price(parsed.data);
      return res.json(result);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      // eslint-disable-next-line no-console
      console.error('[reloop/api] pricing failed:', detail);
      return res
        .status(502)
        .json(apiError('pricing_failed', `Pricing failed: ${detail.slice(0, 200)}`));
    }
  });

  router.post('/health-card', (req, res) => {
    const parsed = healthCardSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      return res.status(400).json(apiError('invalid_request', message));
    }
    // Pure assembly — cannot fail on an external call.
    const card = healthCard.build(parsed.data);
    return res.json(card);
  });

  return router;
}
