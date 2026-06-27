// Flywheel wiring (Phase 5). Reads the live, append-only provenance store and turns
// every verified event into labelled training rows for the grading / pricing / routing
// models — closing the loop between "the trust moat" and "the training-data engine".
// In production these rows are shipped to SageMaker Ground Truth for scheduled
// retraining; here the same pure transform (extractTrainingRows) runs over real
// localStorage chains. Best-effort + read-only: it never mutates provenance.

import { extractTrainingRows, flywheelStats, type FlywheelStats, type TrainingRows } from '@reloop/shared';
import { getAllChains } from './provenance-store';

/** Aggregate, labelled training data harvested from every stored item chain. */
export function collectTrainingData(): { rows: TrainingRows; stats: FlywheelStats } {
  const chains = getAllChains();
  const rows: TrainingRows = { grading: [], pricing: [], routing: [] };
  for (const chain of chains) {
    const r = extractTrainingRows(chain);
    rows.grading.push(...r.grading);
    rows.pricing.push(...r.pricing);
    rows.routing.push(...r.routing);
  }
  return { rows, stats: flywheelStats(chains) };
}
