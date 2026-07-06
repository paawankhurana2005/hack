// Sell-flow routes. /grade runs real AI grading; /price recommends a resale price.

import { Router } from 'express';
import { z } from 'zod';
import type { ApiError } from '@reloop/shared';
import type { GradingService } from '../services/grading/grading-service.js';
import type { PricingService } from '../services/pricing/pricing-service.js';
import type { HealthCardService } from '../services/health-card/health-card-service.js';
import { runSellPipeline } from '../services/pipeline/sell-pipeline.js';
import { getReqId, log } from '../lib/logger.js';

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
const moneySchema = z.object({ amountCents: z.number(), currency: z.literal('INR') });

const draftSchema = z.object({
  title: z.string().trim().min(1).max(140),
  category: categoryEnum,
  notes: z.string().trim().max(500).optional(),
});

const referenceSchema = z.object({
  // URLs (may be relative, e.g. "/demo/..."), not base64 — keep this small.
  originalListingImages: z.array(z.string().min(1).max(2000)).max(8),
  originalSpecs: z.record(z.string().max(120)),
});

const gradeSchema = z.object({
  draft: draftSchema,
  imagesBase64: z
    .array(z.string().min(1).max(MAX_B64_LEN))
    .min(1, 'at least one image is required')
    .max(MAX_IMAGES, `at most ${MAX_IMAGES} images`),
  reference: referenceSchema.optional(),
  requestKey: z.string().max(120).optional(),
});

const severityEnum = z.enum(['minor', 'moderate', 'severe']);
const structuredIssueSchema = z.object({
  type: z.string().trim().max(120),
  severity: severityEnum,
  region: z.string().trim().max(60),
});
const priceReferenceSchema = z.object({
  originalRetailCents: z.number().nonnegative(),
  purchaseDate: z.string().max(40).optional(),
  discontinued: z.boolean().optional(),
});

// Phase 2 feature inputs are additive + optional, so older callers still validate.
const priceFeatureFields = {
  requestKey: z.string().max(120).optional(),
  reference: priceReferenceSchema.optional(),
  structuredIssues: z.array(structuredIssueSchema).max(20).optional(),
  completeness: z.number().min(0).max(1).optional(),
  authenticityConfidence: z.number().min(0).max(1).optional(),
  nearbyBuyers: z.number().int().nonnegative().optional(),
};

const priceSchema = z.object({
  draft: draftSchema,
  grade: gradeEnum,
  detectedIssues: z.array(z.string().trim().max(200)).max(20).default([]),
  ...priceFeatureFields,
});

// Pipeline accepts the grade payload plus the pricing feature inputs (so the
// orchestrated flow can anchor pricing to the base reference too).
const pipelineSchema = gradeSchema.extend({
  priceReference: priceReferenceSchema.optional(),
  completeness: z.number().min(0).max(1).optional(),
  nearbyBuyers: z.number().int().nonnegative().optional(),
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
      log('error', 'grading failed', { reqId: getReqId(req), detail });
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
      log('error', 'pricing failed', { reqId: getReqId(req), detail });
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

  // Additive: the whole grade→price→health-card flow as one orchestrated pipeline
  // with per-stage timeouts + deterministic fallbacks. Always 200 (degrades to
  // fallbacks rather than failing); the response carries the stage trace so the
  // caller can see what fell back. The individual endpoints above are unchanged.
  router.post('/pipeline', async (req, res) => {
    const parsed = pipelineSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      return res.status(400).json(apiError('invalid_request', message));
    }
    const result = await runSellPipeline({ grading, pricing, healthCard }, parsed.data);
    return res.json(result);
  });

  return router;
}
