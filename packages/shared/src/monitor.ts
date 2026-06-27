// Drift & calibration monitoring (Phase 6). Production models silently rot as the
// world shifts; this is the deterministic watchdog. Population Stability Index (PSI)
// compares a live feature/prediction window against the training reference; high PSI
// fires an alarm whose response is to WIDEN intervals / fall back to deterministic
// policy — never to keep trusting a drifted model. Maps to CloudWatch alarms /
// SageMaker Model Monitor; the math is pure + reproducible.

export type DriftLevel = 'none' | 'moderate' | 'severe';

export interface DriftReport {
  psi: number;
  level: DriftLevel;
  /** Recommended response when drift is detected. */
  action: 'continue' | 'widen_intervals' | 'fallback';
}

/** Standard PSI thresholds. */
export function driftLevel(psi: number): DriftLevel {
  if (psi < 0.1) return 'none';
  if (psi < 0.25) return 'moderate';
  return 'severe';
}

/**
 * Population Stability Index between a reference and a live sample over equal-width
 * bins on [0,1]. Assumes features are normalized; callers normalize first.
 */
export function psi(reference: number[], live: number[], bins = 10): number {
  if (reference.length === 0 || live.length === 0) return 0;
  const eps = 1e-4;
  let total = 0;
  for (let b = 0; b < bins; b += 1) {
    const lo = b / bins;
    const hi = (b + 1) / bins;
    const inBin = (xs: number[]): number =>
      xs.filter((x) => (b === bins - 1 ? x >= lo && x <= hi : x >= lo && x < hi)).length / xs.length;
    const r = Math.max(eps, inBin(reference));
    const l = Math.max(eps, inBin(live));
    total += (l - r) * Math.log(l / r);
  }
  return Math.round(total * 1000) / 1000;
}

/** Assess drift and recommend the safe response. */
export function assessDrift(reference: number[], live: number[]): DriftReport {
  const value = psi(reference, live);
  const level = driftLevel(value);
  const action = level === 'severe' ? 'fallback' : level === 'moderate' ? 'widen_intervals' : 'continue';
  return { psi: value, level, action };
}
