import type { Request, Response } from 'express';
import type { ReturnGradingResult, ReturnReason } from '@reloop/shared';
import {
  conditionGradeToReturnGrade,
  tagDefects,
  toGradingCategory,
  missingRequiredAngles,
  angleLabels,
} from '@reloop/shared';
import type { GradingService } from '../services/grading/grading-service.js';
import { skuToCategory } from '../lib/routing-engine.js';
import { MOCK_MODE } from '../lib/env.js';
import { mockGradeResult } from '../lib/mocks.js';
import { log, getReqId } from '../lib/logger.js';

// Upload guards: cap the number of photos and the size of each base64 string so
// a malicious or runaway client can't push huge payloads through this route.
const MAX_PHOTOS = 6;
const MAX_B64_LEN = 2_600_000; // ~2MB binary per image

/** Normalize the request body into angle-tagged images. Accepts the spec-025
 *  `images: [{ angle, imageBase64 }]` shape, and still tolerates the legacy flat
 *  `photos: string[]` (angle-less) so older callers don't break. */
function readImages(body: unknown): { angle: string | null; imageBase64: string }[] | null {
  const b = (body ?? {}) as { images?: unknown; photos?: unknown };
  if (Array.isArray(b.images)) {
    const out: { angle: string | null; imageBase64: string }[] = [];
    for (const raw of b.images) {
      if (!raw || typeof raw !== 'object') return null;
      const { angle, imageBase64 } = raw as { angle?: unknown; imageBase64?: unknown };
      if (typeof imageBase64 !== 'string') return null;
      out.push({ angle: typeof angle === 'string' && angle ? angle : null, imageBase64 });
    }
    return out;
  }
  if (Array.isArray(b.photos)) {
    if (!b.photos.every((p) => typeof p === 'string')) return null;
    return (b.photos as string[]).map((imageBase64) => ({ angle: null, imageBase64 }));
  }
  return null;
}

const VALID_REASONS = new Set<string>([
  'didnt_fit', 'changed_mind', 'duplicate_gift', 'defective',
  'stopped_working', 'arrived_damaged', 'wrong_item', 'counterfeit', 'not_as_described',
]);

/**
 * Spec 023: the Return flow now grades through the same VlmProvider seam the
 * Sell flow uses (trained-model-primary, NVIDIA-fallback — see index.ts's
 * composition root), instead of calling nvidiaChat directly. authenticityMatch/
 * wardrobingFlag are honest static defaults: the trained CV model (spec 108)
 * never produced those signals, and the old direct-NVIDIA prompt only ever
 * guessed them unverified — so this isn't a regression, just no longer a
 * fabricated one.
 */
export function createGradeHandler(gradingService: GradingService) {
  return async function gradeHandler(req: Request, res: Response): Promise<void> {
    const { reason, sku, category } = req.body as {
      reason: unknown;
      sku: unknown;
      category: unknown;
    };

    const images = readImages(req.body);
    if (images === null) {
      res.status(400).json({ error: '`images` must be [{ angle, imageBase64 }] (or legacy `photos: string[]`)' });
      return;
    }
    if (images.length > MAX_PHOTOS) {
      res.status(400).json({ error: `at most ${MAX_PHOTOS} photos` });
      return;
    }
    if (!images.every((im) => im.imageBase64.length <= MAX_B64_LEN)) {
      res.status(400).json({ error: 'each photo must be a base64 string within the size limit' });
      return;
    }
    if (typeof reason !== 'string' || !VALID_REASONS.has(reason)) {
      res.status(400).json({ error: '`reason` must be a valid ReturnReason' });
      return;
    }

    const typedReason = reason as ReturnReason;
    const t0 = Date.now();

    // Same capture spec the web used to render the angle slots — trust the
    // client-resolved category, else fall back to the SKU-derived one so both
    // sides compute the SAME required angles (no drift).
    const gradingCategory =
      typeof category === 'string' && category
        ? toGradingCategory(category)
        : toGradingCategory(skuToCategory(typeof sku === 'string' ? sku : ''));
    const providedAngles = images.map((im) => im.angle).filter((a): a is string => a !== null);

    // No photos or mock mode — skip the grading provider entirely.
    if (images.length === 0 || MOCK_MODE) {
      res.json(mockGradeResult(typedReason));
      return;
    }

    try {
      const result = await gradingService.grade({
        draft: {
          title: 'Return item',
          category: skuToCategory(typeof sku === 'string' ? sku : ''),
        },
        imagesBase64: images.map((im) => im.imageBase64),
      });

      // Angle-aware review gate (the trained model's missing_required signal,
      // enforced app-side so it survives the VLM fallback). Only meaningful when
      // photos were angle-tagged; a legacy flat upload has no required-angle set.
      const missing = providedAngles.length > 0 ? missingRequiredAngles(gradingCategory, providedAngles) : [];
      const missingLabels = angleLabels(gradingCategory, missing);
      const captureGuidance = [
        ...(result.captureGuidance ?? []),
        ...missingLabels.map((l) => `Add a ${l} photo — it's a required angle for this item.`),
      ];
      const needsReview = Boolean(result.needsReview) || missing.length > 0;

      const defectTags = tagDefects(result.detectedIssues);
      const gradeResult: ReturnGradingResult = {
        grade: conditionGradeToReturnGrade(result.grade),
        confidence: result.confidence,
        defects: result.detectedIssues,
        authenticityMatch: true,
        wardrobingFlag: false,
        functionallyVerifiable: result.grade !== 'poor' && !defectTags.includes('dead_battery'),
        rawReason: typedReason,
        packagingSealed: !defectTags.includes('worn_packaging'),
        needsReview,
        ...(missingLabels.length ? { missingAngles: missingLabels } : {}),
        ...(captureGuidance.length ? { captureGuidance } : {}),
      };

      // Demo-visible inference log: one line per upload with what the model saw
      // and decided. `provider` is the configured primary — a `grade fallback`
      // warn below (or the absence of a serve.py inference line) means it fell
      // back to the hosted VLM / mock.
      log('info', 'grade.inference', {
        reqId: getReqId(req),
        provider: process.env.GRADING_PROVIDER ?? 'trained-local',
        category: gradingCategory,
        angles: providedAngles,
        images: images.length,
        grade: gradeResult.grade,
        confidence: Number(gradeResult.confidence.toFixed(3)),
        needsReview,
        missingAngles: missingLabels,
        defects: result.detectedIssues,
        durationMs: Date.now() - t0,
      });

      res.json(gradeResult);
    } catch (err) {
      // Degrade gracefully, but surface WHY so the fallback isn't silent.
      log('warn', 'grade fallback', {
        reason: typedReason,
        error: err instanceof Error ? err.message : String(err),
      });
      res.json({ fallback: true, decision: 'warehouse' });
    }
  };
}
