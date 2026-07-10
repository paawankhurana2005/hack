// DEMO: the grader still runs on the buyer's photos, but the condition score it
// returns is overridden with this fixed value so every surface in the pitch — the
// buyer's doorstep grading card and the seller's Product Health Card — shows the
// same number. Delete this module and its two call sites to let the trained
// model's own score through:
//   - components/return/BuyerStep2Pickup.tsx  (pins the score onto the record)
//   - components/return/health-card.tsx       (renders it on the seller's card)
export const DEMO_CONDITION_SCORE = 0.964;

/** Band colours mirror the trained grader's own score→grade cuts:
 *  >=0.80 like-new/new, >=0.55 good, >=0.25 fair, else poor. */
export function conditionScoreColor(value: number): string {
  return value >= 0.8 ? 'bg-success' : value >= 0.55 ? 'bg-warning' : 'bg-danger';
}
