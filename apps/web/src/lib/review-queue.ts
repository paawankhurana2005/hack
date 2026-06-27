// Human-in-the-loop review queue (Phase 6), per-user localStorage. When grading is
// low-confidence or an item is high-value/unverified/flagged, the sell flow enqueues
// a ReviewItem here instead of trusting the model outright — the concrete "what if the
// AI is wrong?" path. A reviewer can approve/override and resume. Maps to AWS A2I.

import type { ReviewItem, ReviewStatus } from '@reloop/shared';
import { nsKey, readJson, writeJson } from './storage';

const BASE = 'review.queue';

export function getReviewQueue(): ReviewItem[] {
  return readJson<ReviewItem[]>(nsKey(BASE), []);
}

/** Enqueue an item for human review (idempotent on id). Returns the queued item. */
export function enqueueReview(item: Omit<ReviewItem, 'id' | 'createdAt' | 'status'> & { id?: string }): ReviewItem {
  const queued: ReviewItem = {
    ...item,
    id: item.id ?? `rev_${Date.now()}`,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  const existing = getReviewQueue();
  if (existing.some((r) => r.id === queued.id)) return queued; // idempotent
  writeJson(nsKey(BASE), [queued, ...existing]);
  return queued;
}

/** Resolve a review (approve/override or reject) — the clean resume path. */
export function resolveReview(id: string, status: ReviewStatus, note?: string): void {
  writeJson(
    nsKey(BASE),
    getReviewQueue().map((r) => (r.id === id ? { ...r, status, ...(note ? { note } : {}) } : r)),
  );
}

export function pendingReviewCount(): number {
  return getReviewQueue().filter((r) => r.status === 'pending').length;
}
