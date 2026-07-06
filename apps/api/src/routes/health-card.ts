import type { Request, Response } from 'express';
import type { ReturnGradingResult, ReturnHealthCard } from '@reloop/shared';
import { nvidiaChat } from '../services/nvidia/client.js';
import { config } from '../config.js';
import { HealthCardError } from '../lib/errors.js';
import { MOCK_MODE } from '../lib/env.js';
import { mockHealthCard } from '../lib/mocks.js';
import { getReqId } from '../lib/logger.js';

const TEXT_MODEL = 'meta/llama-3.1-70b-instruct';

const SYSTEM_PROMPT =
  'You are writing a product condition summary for a second-hand buyer. Be factual, concise, and trustworthy. Return ONLY valid JSON with no preamble or markdown fences.';

function stripFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function parseHealthCardResponse(raw: string): ReturnHealthCard {
  const cleaned = stripFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new HealthCardError(`JSON parse failed: ${cleaned.slice(0, 100)}`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new HealthCardError('Response is not an object');
  }

  const obj = parsed as Record<string, unknown>;

  const summary = obj['summary'];
  if (typeof summary !== 'string' || summary.length === 0) {
    throw new HealthCardError('summary must be a non-empty string');
  }

  const verifiedAttributes = obj['verifiedAttributes'];
  if (!isStringArray(verifiedAttributes)) {
    throw new HealthCardError('verifiedAttributes must be string[]');
  }

  const notVerified = obj['notVerified'];
  if (!isStringArray(notVerified)) {
    throw new HealthCardError('notVerified must be string[]');
  }

  const trustScore = obj['trustScore'];
  if (typeof trustScore !== 'number' || trustScore < 0 || trustScore > 100) {
    throw new HealthCardError(`trustScore must be 0–100, got ${String(trustScore)}`);
  }

  return { summary, verifiedAttributes, notVerified, trustScore };
}

function buildFallback(gradingResult: ReturnGradingResult): { fallback: true; summary: string } {
  const gradeLabel = gradingResult.grade ?? 'unknown';
  return {
    fallback: true,
    summary: `Item assessed as Grade ${gradeLabel}. ${gradingResult.defects.length} issue(s) detected.`,
  };
}

export async function healthCardHandler(req: Request, res: Response): Promise<void> {
  const { gradingResult } = req.body as { gradingResult: unknown };

  if (typeof gradingResult !== 'object' || gradingResult === null) {
    res.status(400).json({ error: '`gradingResult` is required' });
    return;
  }

  const gr = gradingResult as ReturnGradingResult;

  if (MOCK_MODE) {
    res.json(mockHealthCard(gr));
    return;
  }

  try {
    const raw = await nvidiaChat(config, {
      model: TEXT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(gr) },
      ],
      maxTokens: 256,
      temperature: 0.2,
      traceMeta: { name: 'health-card.summarize', reqId: getReqId(req) },
    });

    const result = parseHealthCardResponse(raw);
    res.json(result);
  } catch {
    res.json(buildFallback(gr));
  }
}
