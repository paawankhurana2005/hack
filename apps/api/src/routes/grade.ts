import type { Request, Response } from 'express';
import type { ReturnGradingResult, ReturnReason } from '@reloop/shared';
import { nvidiaChat } from '../lib/nvidia-client.js';
import { GradingServiceError } from '../lib/errors.js';
import { MOCK_MODE } from '../lib/env.js';
import { mockGradeResult } from '../lib/mocks.js';
import { log } from '../lib/logger.js';

const VISION_MODEL = 'meta/llama-3.2-90b-vision-instruct';

// Upload guards: cap the number of photos and the size of each base64 string so
// a malicious or runaway client can't push huge payloads through this route.
const MAX_PHOTOS = 6;
const MAX_B64_LEN = 2_600_000; // ~2MB binary per image

const VALID_REASONS = new Set<string>([
  'didnt_fit', 'changed_mind', 'duplicate_gift', 'defective',
  'stopped_working', 'arrived_damaged', 'wrong_item', 'counterfeit', 'not_as_described',
]);

const SYSTEM_PROMPT =
  'You are a product condition grading assistant. Analyze the provided product photos and return ONLY valid JSON with no preamble, explanation, or markdown fences. The JSON must have exactly these fields: grade (one of: "A", "B", "C", "Salvage"), confidence (number 0-1), defects (array of strings), authenticityMatch (boolean), wardrobingFlag (boolean), functionallyVerifiable (boolean).';

function stripFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function parseGradeResponse(raw: string, reason: ReturnReason): ReturnGradingResult {
  const cleaned = stripFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new GradingServiceError(`JSON parse failed: ${cleaned.slice(0, 100)}`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new GradingServiceError('Response is not an object');
  }

  const obj = parsed as Record<string, unknown>;

  const grade = obj['grade'];
  if (grade !== 'A' && grade !== 'B' && grade !== 'C' && grade !== 'Salvage') {
    throw new GradingServiceError(`Invalid grade: ${String(grade)}`);
  }

  const confidence = obj['confidence'];
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
    throw new GradingServiceError(`Invalid confidence: ${String(confidence)}`);
  }

  const defects = obj['defects'];
  if (!isStringArray(defects)) {
    throw new GradingServiceError('defects must be string[]');
  }

  const authenticityMatch = obj['authenticityMatch'];
  const wardrobingFlag = obj['wardrobingFlag'];
  const functionallyVerifiable = obj['functionallyVerifiable'];

  if (typeof authenticityMatch !== 'boolean') throw new GradingServiceError('authenticityMatch must be boolean');
  if (typeof wardrobingFlag !== 'boolean') throw new GradingServiceError('wardrobingFlag must be boolean');
  if (typeof functionallyVerifiable !== 'boolean') throw new GradingServiceError('functionallyVerifiable must be boolean');

  return { grade, confidence, defects, authenticityMatch, wardrobingFlag, functionallyVerifiable, rawReason: reason };
}

export async function gradeHandler(req: Request, res: Response): Promise<void> {
  const { photos, reason, sku: _sku } = req.body as {
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

  // No photos or mock mode — skip NVIDIA
  if (photos.length === 0 || MOCK_MODE) {
    res.json(mockGradeResult(typedReason));
    return;
  }

  try {
    const imageBlocks = (photos as string[]).map((b64) => ({
      type: 'image_url' as const,
      image_url: { url: `data:image/jpeg;base64,${b64}` },
    }));

    const content = [
      ...imageBlocks,
      {
        type: 'text' as const,
        text: `Return reason: ${typedReason}. Assess this item's condition and return JSON only.`,
      },
    ];

    const raw = await nvidiaChat({
      model: VISION_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      maxTokens: 256,
      temperature: 0.1,
    });

    const result = parseGradeResponse(raw, typedReason);
    res.json(result);
  } catch (err) {
    // Degrade gracefully, but surface WHY so the fallback isn't silent.
    log('warn', 'grade fallback', {
      reason: typedReason,
      error: err instanceof Error ? err.message : String(err),
    });
    res.json({ fallback: true, decision: 'warehouse' });
  }
}
