// The single choke point for every model-backed call. Enforces the inviolable rule
// in one place: a timeout, JSON/shape parsing, bounded retries with an optional
// "JSON only" nudge, a REQUIRED deterministic fallback, and a calibration hook for
// model confidence (identity in Phase 0; conformal/temperature scaling lands in
// Phase 1). Callers can never forget the fallback — it's a required argument.

import type { Config } from '../config.js';
import { nvidiaChat, type ChatRequest } from '../services/nvidia/client.js';

const DEFAULT_TIMEOUT_MS = 45_000;

export interface ModelCallSpec<T> {
  /** Base chat request (model + messages + sampling). */
  request: ChatRequest;
  /** Parse model text into T; THROW on an invalid/unusable shape to trigger retry. */
  parse: (content: string) => T;
  /** Deterministic fallback when every attempt fails. REQUIRED — the safety net. */
  fallback: (error: unknown) => T;
  /** Extra attempts beyond the first (default 0). */
  retries?: number;
  /** Appended as a user turn on retry attempts (e.g. "Return ONLY the JSON"). */
  nudge?: string;
  /** Calibrate a successfully parsed value (e.g. confidence scaling). Default: identity. */
  calibrate?: (value: T) => T;
  /** Per-attempt ceiling; default 45s. */
  timeoutMs?: number;
}

export interface ModelCallResult<T> {
  value: T;
  /** True when the deterministic fallback was used. */
  usedFallback: boolean;
}

function withTimeout<O>(p: Promise<O>, ms: number): Promise<O> {
  return new Promise<O>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`model call timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Call a model with retries + nudge, parse + calibrate the result, and fall back
 * deterministically if it never succeeds. Never throws — always returns a value.
 */
export async function callModel<T>(cfg: Config, spec: ModelCallSpec<T>): Promise<ModelCallResult<T>> {
  const retries = spec.retries ?? 0;
  const calibrate = spec.calibrate ?? ((v: T): T => v);
  const timeoutMs = spec.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const messages =
      attempt === 0 || !spec.nudge
        ? spec.request.messages
        : [...spec.request.messages, { role: 'user' as const, content: spec.nudge }];
    try {
      const content = await withTimeout(nvidiaChat(cfg, { ...spec.request, messages }), timeoutMs);
      return { value: calibrate(spec.parse(content)), usedFallback: false };
    } catch (error) {
      lastError = error;
    }
  }

  return { value: spec.fallback(lastError), usedFallback: true };
}
