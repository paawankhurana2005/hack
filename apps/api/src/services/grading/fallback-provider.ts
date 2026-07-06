// Wraps a primary VlmProvider (our trained model) with automatic fallback to a
// secondary provider (NVIDIA-hosted) on error or timeout, so a slow/unreachable
// trained-model server degrades gracefully instead of failing the request.
//
// Known limitation: fetch() isn't cancelled on timeout (VlmProvider has no
// AbortSignal in its contract), so a slow primary call keeps running
// server-side after we've already moved on to the secondary. Acceptable for a
// hackathon; would need AbortController threaded through the interface to fix.

import { log } from '../../lib/logger.js';
import type { VlmAssessment, VlmImageInput, VlmProvider } from './types.js';

export class FallbackVlmProvider implements VlmProvider {
  constructor(
    private readonly primary: VlmProvider,
    private readonly secondary: VlmProvider,
    private readonly timeoutMs = 6000,
  ) {}

  async assessImage(input: VlmImageInput): Promise<VlmAssessment> {
    try {
      return await this.withTimeout(this.primary.assessImage(input), this.timeoutMs);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      log('warn', 'grading.trained_model_fallback', { detail });
      return this.secondary.assessImage(input);
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`grading provider timed out after ${ms}ms`)), ms);
      promise.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e: unknown) => {
          clearTimeout(timer);
          reject(e instanceof Error ? e : new Error(String(e)));
        },
      );
    });
  }
}
