// Edge-case test matrix (Phase 6): `pnpm test:edge`. A lightweight, dependency-free
// assertion runner that exercises every failure mode across grading, pricing, routing,
// resell/provenance, HITL, drift, PII, and Rufus grounding — proving each has a
// handler. Exits non-zero on any failure (CI-friendly). Deterministic; no network.

import {
  assessDrift,
  buildCorpus,
  calibrateConfidence,
  CONFIDENCE_GATE_THETA,
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

  // --- Routing: legacy regression (016.1 must not silently change this) ----
  check('routing: default profile still routes local_resale', decideRoute(evp({})).decision === 'local_resale');

  // --- Routing: liquidate (016.1) -------------------------------------------
  const liqManifested = evByPath(
    evp({ category: 'electronics', manifestCoverage: 1, confidence: 0.9, nearbyBuyers: 0 }),
  );
  const liqUnmanifested = evByPath(
    evp({ category: 'electronics', manifestCoverage: 0, confidence: 0.9, nearbyBuyers: 0 }),
  );
  const whManifested = liqManifested.find((e) => e.path === 'warehouse')!;
  const liqM = liqManifested.find((e) => e.path === 'liquidate')!;
  const liqU = liqUnmanifested.find((e) => e.path === 'liquidate')!;
  check('routing: manifested pallet beats honestly-priced warehouse', liqM.evCents > whManifested.evCents);
  check('routing: manifest premium is monotone in coverage', liqM.evCents > liqU.evCents);
  check(
    'routing: warehouse recovery pinned to the honest blend (≤31% of clearing)',
    // evp() default clearingPriceCents is 300_000 — see the profile builder above.
    whManifested.terms.slice(0, 2).reduce((s, t) => s + t.valueCents, 0) <= 0.31 * 300_000,
  );
  check(
    'routing: no-demand functional item → liquidate, not warehouse (016.1 recalibration)',
    decideRoute(evp({ grade: 'A', nearbyBuyers: 0 })).decision === 'liquidate',
  );

  // --- Routing: refurb fix + defect-level economics (016.1) -----------------
  check(
    'routing: refurb not viable with zero nearby buyers (016.1 fix — no downstream channel)',
    evByPath(evp({ grade: 'C', nearbyBuyers: 0 })).find((e) => e.path === 'refurbish')?.viable === false,
  );
  const refurbNoTags = decideRoute(evp({ grade: 'B', nearbyBuyers: 3 }));
  const refurbWithTags = decideRoute(evp({ grade: 'B', nearbyBuyers: 3, defectTags: ['missing_charger'] }));
  const refurbEv = (r: typeof refurbNoTags) => r.evByPath.find((e) => e.path === 'refurbish')!.evCents;
  check(
    'routing: defect-table repair cost (₹300) beats the grade-level fallback (₹600) on a ₹3,000 item',
    refurbEv(refurbWithTags) > refurbEv(refurbNoTags),
  );
  check(
    'routing: defect repair cost surfaces as its own glass-box term',
    refurbWithTags.evByPath
      .find((e) => e.path === 'refurbish')!
      .terms.some((t) => t.label.startsWith('Defect repairs') && t.valueCents === -30_000),
  );

  // --- Routing: E[correction_cost(r)] (016.1 — the spec formula's missing term) --
  const uncertainA = evByPath(
    evp({ grade: 'A', gradePosterior: { A: 0.7, B: 0.2, C: 0.1, Salvage: 0 }, sealed: true, skuActive: true }),
  );
  check(
    'routing: restock carries a negative correction-cost term when posterior mass sits below A',
    uncertainA.find((e) => e.path === 'restock')!.terms.some((t) => t.label === 'Expected correction cost' && t.valueCents < 0),
  );
  check(
    'routing: donate carries no correction-cost term (being wrong is free)',
    !uncertainA.find((e) => e.path === 'donate')!.terms.some((t) => t.label === 'Expected correction cost'),
  );
  check(
    'routing: θ gate ordering mirrors redirect-cost ordering',
    CONFIDENCE_GATE_THETA.restock! > CONFIDENCE_GATE_THETA.local_resale! &&
      CONFIDENCE_GATE_THETA.local_resale! > CONFIDENCE_GATE_THETA.refurbish! &&
      CONFIDENCE_GATE_THETA.refurbish! > CONFIDENCE_GATE_THETA.donate! &&
      CONFIDENCE_GATE_THETA.donate! > CONFIDENCE_GATE_THETA.liquidate!,
  );

  // --- Routing: returnless refund (016.1) — "the best route is no route" --------
  const returnlessBase: Partial<RoutingEvProfile> = {
    clearingPriceCents: 5_000,
    localHandlingCents: 3_000,
    nearbyBuyers: 0,
    customerTrust: 0.9,
  };
  check('routing: all-paths-negative + trust → returnless refund', decideRoute(evp(returnlessBase)).decision === 'returnless_refund');
  check(
    'routing: no trust signal → ineligible, stays a real route',
    decideRoute(evp({ ...returnlessBase, customerTrust: undefined })).decision !== 'returnless_refund',
  );
  check(
    'routing: high-value item never goes returnless',
    decideRoute(evp({ ...returnlessBase, clearingPriceCents: 200_000 })).decision !== 'returnless_refund',
  );
  check(
    'routing: fraud signal blocks returnless',
    decideRoute(evp({ ...returnlessBase, fraudSignal: true })).decision !== 'returnless_refund',
  );

  // --- Routing: hero-demo guard (liquidate must never cannibalize the flagship) --
  check(
    'routing: B09-shaped demo profile still routes local_resale',
    decideRoute(
      evp({ grade: 'A', category: 'electronics', clearingPriceCents: 249_900, localHandlingCents: 38_000, nearbyBuyers: 8, radiusKm: 4 }),
    ).decision === 'local_resale',
  );

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
