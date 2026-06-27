// Edge-case test matrix (Phase 6): `pnpm test:edge`. A lightweight, dependency-free
// assertion runner that exercises every failure mode across grading, pricing, routing,
// resell/provenance, HITL, drift, PII, and Rufus grounding — proving each has a
// handler. Exits non-zero on any failure (CI-friendly). Deterministic; no network.

import {
  assessDrift,
  buildCorpus,
  calibrateConfidence,
  cumulativeImpact,
  decideRoute,
  evByPath,
  extractTrainingRows,
  hardConstraint,
  isGrounded,
  NoopPiiRedactor,
  retrieve,
  reviewDecision,
  sampleChains,
  type RoutingEvProfile,
  type RufusContext,
} from '@reloop/shared';
import { aggregate } from '../services/grading/grading-service.js';
import { PricingService } from '../services/pricing/pricing-service.js';
import type { MarketProvider } from '../services/pricing/types.js';
import type { VlmAssessment } from '../services/grading/types.js';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean): void {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(name);
  }
}

function vlm(grade: VlmAssessment['grade'], confidence: number, issues: string[] = []): VlmAssessment {
  return {
    grade,
    confidence,
    detectedIssues: issues,
    structuredIssues: issues.map((t) => ({ type: t, severity: 'moderate' as const, region: 'x' })),
    photoQuality: 'clear',
    summary: `${grade}`,
  };
}

function evp(over: Partial<RoutingEvProfile>): RoutingEvProfile {
  return {
    grade: 'B',
    reason: 'changed_mind',
    sellerType: '1P',
    sellerOptedIn: true,
    authenticityMatch: true,
    functionallyVerifiable: true,
    clearingPriceCents: 300_000,
    localHandlingCents: 40_000,
    nearbyBuyers: 6,
    radiusKm: 4,
    warehouseDistanceKm: 580,
    ...over,
  };
}

async function run(): Promise<void> {
  // --- Grading -------------------------------------------------------------
  check('grading: worst-angle wins', aggregate([vlm('good', 0.8), vlm('poor', 0.7)]).grade === 'poor');
  check('grading: more angles only lower or hold', aggregate([vlm('new', 0.9), vlm('fair', 0.8)]).grade === 'fair');
  check('grading: issues de-duped union', aggregate([vlm('good', 0.8, ['scuff']), vlm('good', 0.8, ['scuff'])]).structuredIssues.length === 1);
  check('grading: low confidence abstains', calibrateConfidence(0.3) < 0.55);
  check('grading: high confidence does not abstain', calibrateConfidence(0.95) >= 0.55);

  // --- Pricing -------------------------------------------------------------
  const market: MarketProvider = {
    // eslint-disable-next-line @typescript-eslint/require-await
    estimate: async () => ({ estimatedRetailCents: 1_000_000, demand: 'medium', note: 'stub' }),
  };
  const pricing = new PricingService(market);
  const withRef = await pricing.price({
    draft: { title: 'X', category: 'electronics' },
    grade: 'good',
    detectedIssues: [],
    reference: { originalRetailCents: 1_000_000 },
  });
  check('pricing: base reference → model source', withRef.modelSource === 'gbdt');
  check('pricing: clamped below ceiling (95% retail)', withRef.suggestedPrice.amountCents <= 950_000);
  check('pricing: above floor (12% retail)', withRef.suggestedPrice.amountCents >= 120_000);
  check('pricing: rounded to ₹50', withRef.suggestedPrice.amountCents % 5_000 === 0);
  check('pricing: sell-through curve has 3 points', (withRef.sellThroughCurve?.length ?? 0) === 3);
  const noRef = await pricing.price({ draft: { title: 'Y', category: 'other' }, grade: 'fair', detectedIssues: [] });
  check('pricing: no reference → fallback policy', noRef.modelSource === 'fallback-policy');

  // --- Routing: hard constraints (never optimized away) --------------------
  check('routing: 3P → return_to_seller', hardConstraint(evp({ sellerType: '3P', sellerOptedIn: false }))?.path === 'return_to_seller');
  check('routing: counterfeit → return_to_seller', hardConstraint(evp({ reason: 'counterfeit' }))?.path === 'return_to_seller');
  check('routing: hazmat → recycle', hardConstraint(evp({ hazmat: true }))?.path === 'recycle');
  check('routing: wrong_item → warehouse', hardConstraint(evp({ reason: 'wrong_item' }))?.path === 'warehouse');
  check('routing: auth mismatch → warehouse', hardConstraint(evp({ authenticityMatch: false }))?.path === 'warehouse');
  check('routing: high-value unverified → warehouse', hardConstraint(evp({ clearingPriceCents: 3_000_000, grade: null }))?.path === 'warehouse');
  check('routing: reason↔grade mismatch → warehouse', hardConstraint(evp({ reasonGradeMismatch: true }))?.path === 'warehouse');
  check('routing: salvage → recycle', hardConstraint(evp({ grade: 'Salvage' }))?.path === 'recycle');
  check('routing: arrived_damaged → recycle', hardConstraint(evp({ reason: 'arrived_damaged' }))?.path === 'recycle');
  check('routing: clean item has no hard rule', hardConstraint(evp({})) === null);

  // --- Routing: EV optimization -------------------------------------------
  const dec = decideRoute(evp({ grade: 'A', clearingPriceCents: 800_000, nearbyBuyers: 8 }));
  const viable = evByPath(evp({ grade: 'A', clearingPriceCents: 800_000, nearbyBuyers: 8 })).filter((e) => e.viable);
  const argmax = viable.reduce((a, b) => (b.evCents > a.evCents ? b : a));
  check('routing: EV picks argmax viable path', dec.decision === argmax.path);
  check('routing: no buyers → local_resale not viable', evByPath(evp({ nearbyBuyers: 0 })).find((e) => e.path === 'local_resale')?.viable === false);

  // --- Resell / provenance (flywheel + multi-life) ------------------------
  const chains = sampleChains();
  const rows = extractTrainingRows(chains[0]!);
  check('provenance: multi-life chain yields pricing labels', rows.pricing.length >= 2);
  check('provenance: ≥2 lives counted', cumulativeImpact(chains[0]!).lives >= 2);

  // --- HITL review ---------------------------------------------------------
  check('hitl: low confidence flags review', reviewDecision({ calibratedConfidence: 0.4 }).reasons.includes('low_confidence'));
  check('hitl: high-value unverified flags review', reviewDecision({ valueCents: 3_000_000, functionallyVerifiable: false }).reasons.includes('high_value_unverified'));
  check('hitl: auth mismatch flags review', reviewDecision({ authenticityMatch: false }).reasons.includes('authenticity_mismatch'));
  check('hitl: clean item no review', reviewDecision({ calibratedConfidence: 0.9, valueCents: 100_000, authenticityMatch: true }).needsReview === false);

  // --- Drift monitoring ----------------------------------------------------
  const ref = Array.from({ length: 200 }, (_, i) => (i % 100) / 100);
  const noDrift = Array.from({ length: 200 }, (_, i) => (i % 100) / 100);
  const drifted = ref.map((x) => Math.min(1, x + 0.4));
  check('drift: stable distribution → none/continue', assessDrift(ref, noDrift).action === 'continue');
  check('drift: shifted distribution → fallback', assessDrift(ref, drifted).action === 'fallback');

  // --- PII redaction boundary ---------------------------------------------
  const redaction = await new NoopPiiRedactor().redact('abc');
  check('pii: redaction boundary present + auditable', redaction.result.source === 'noop-stub');

  // --- Rufus grounding -----------------------------------------------------
  const ctx: RufusContext = {
    title: 'Sony WH-1000XM5', category: 'electronics', grade: 'good', confidence: 0.8,
    summary: 'Light wear.', detectedIssues: ['ear-pad wear'], authenticityVerified: true,
    listingPriceInr: 12000, originalPriceInr: 24990,
  };
  const facts = retrieve('why is it cheaper than new?', buildCorpus(ctx)).map((c) => c.text).join('\n');
  check('rufus: grounded answer accepted', isGrounded('It is ₹12,000, 52% off ₹24,990.', facts));
  check('rufus: fabricated number rejected', !isGrounded('It has 99 hours battery.', facts));
  check('rufus: irrelevant question → empty retrieval', retrieve('what is the airspeed of a swallow?', buildCorpus(ctx)).length === 0);

  // --- Report --------------------------------------------------------------
  /* eslint-disable no-console */
  console.log(`\nReLoop edge-case matrix — ${passed}/${passed + failed} passed\n`);
  if (failed > 0) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    console.log('');
    process.exit(1);
  } else {
    console.log('  ✓ all edge cases handled\n');
  }
  /* eslint-enable no-console */
}

void run();
