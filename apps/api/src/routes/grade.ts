import type { Request, Response } from 'express';
import type { ReturnGradingResult, ReturnReason } from '@reloop/shared';
import { conditionGradeToReturnGrade, tagDefects } from '@reloop/shared';
import type { GradingService } from '../services/grading/grading-service.js';
import { skuToCategory } from '../lib/routing-engine.js';
import { MOCK_MODE } from '../lib/env.js';
import { mockGradeResult } from '../lib/mocks.js';
import { log } from '../lib/logger.js';

// Upload guards: cap the number of photos and the size of each base64 string so
// a malicious or runaway client can't push huge payloads through this route.
const MAX_PHOTOS = 6;
const MAX_B64_LEN = 2_600_000; // ~2MB binary per image

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
    const { photos, reason, sku } = req.body as {
      photos: unknown;
      reason: unknown;
      sku: unknown;
    };

    if (!Array.isArray(photos)) {
      res.status(400).json({ error: '`photos` must be an array' });
      return;
    }
    if (photos.length > MAX_PHOTOS) {
      res.status(400).json({ error: `at most ${MAX_PHOTOS} photos` });
      return;
    }
    if (!photos.every((p) => typeof p === 'string' && p.length <= MAX_B64_LEN)) {
      res.status(400).json({ error: 'each photo must be a base64 string within the size limit' });
      return;
    }
    if (typeof reason !== 'string' || !VALID_REASONS.has(reason)) {
      res.status(400).json({ error: '`reason` must be a valid ReturnReason' });
      return;
    }

    const typedReason = reason as ReturnReason;

    // No photos or mock mode — skip the grading provider entirely.
    if (photos.length === 0 || MOCK_MODE) {
      res.json(mockGradeResult(typedReason));
      return;
    }

    try {
      const result = await gradingService.grade({
        draft: {
          title: 'Return item',
          category: skuToCategory(typeof sku === 'string' ? sku : ''),
        },
        imagesBase64: photos as string[],
      });

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
      };
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
