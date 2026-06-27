// The provenance flywheel (Phase 5). The Health-Card chain is not just the trust
// moat — it's the TRAINING-DATA engine. Every verified event is a labelled example:
//   • `graded`  → a perception label for the grading model (P1)
//   • `sold`    → a realized resale-ratio label for the pricing model (P2)
//   • `routed`  → an outcome label for the routing model (P3)
// This module is the pure transform from an append-only chain to those labelled rows.
// In production the rows flow to SageMaker Ground Truth → scheduled retraining; here
// they prove the loop is closed. Deterministic; introduces no new numbers (it only
// reads what each event already recorded).

import type { ProvenanceChain, ProvenanceEvent } from './provenance.js';
import type { ItemCategory } from './sell.js';

export interface GradingTrainingRow {
  itemId: string;
  at: string;
  grade: string;
  confidence: number;
  issueCount: number;
  referenceMatch?: boolean;
  verified: boolean;
}

export interface PricingTrainingRow {
  itemId: string;
  at: string;
  category: ItemCategory;
  grade?: string; // condition at sale (nearest preceding `graded`)
  ageYears: number; // origin → sale
  referencePriceCents: number; // first listed price (retail anchor proxy)
  soldPriceCents: number;
  realizedRatio: number; // soldPrice ÷ referencePrice — the P2 label
}

export interface RoutingTrainingRow {
  itemId: string;
  at: string;
  route: 'donate' | 'recycle';
  co2SavedKg: number;
  ecoCredits: number;
}

export interface TrainingRows {
  grading: GradingTrainingRow[];
  pricing: PricingTrainingRow[];
  routing: RoutingTrainingRow[];
}

function yearsBetween(a: string, b: string): number {
  const t0 = Date.parse(a);
  const t1 = Date.parse(b);
  if (Number.isNaN(t0) || Number.isNaN(t1)) return 0;
  return Math.max(0, (t1 - t0) / (365 * 86_400_000));
}

/** Turn one item's chain into labelled training rows for P1/P2/P4. Pure. */
export function extractTrainingRows(chain: ProvenanceChain): TrainingRows {
  const out: TrainingRows = { grading: [], pricing: [], routing: [] };
  let originAt = chain.events[0]?.at ?? '';
  let firstListedCents: number | null = null;
  let lastGrade: string | undefined;

  for (const e of chain.events as ProvenanceEvent[]) {
    if (e.type === 'origin') originAt = e.at;
    if (e.type === 'graded') {
      lastGrade = e.grade;
      out.grading.push({
        itemId: chain.itemId,
        at: e.at,
        grade: e.grade,
        confidence: e.confidence,
        issueCount: e.issues.length,
        referenceMatch: e.referenceMatch,
        verified: e.verified,
      });
    }
    if (e.type === 'listed' && firstListedCents === null) {
      firstListedCents = e.price.amountCents;
    }
    if (e.type === 'sold' && firstListedCents !== null && firstListedCents > 0) {
      out.pricing.push({
        itemId: chain.itemId,
        at: e.at,
        category: chain.category,
        grade: lastGrade,
        ageYears: Math.round(yearsBetween(originAt, e.at) * 10) / 10,
        referencePriceCents: firstListedCents,
        soldPriceCents: e.price.amountCents,
        realizedRatio: Math.round((e.price.amountCents / firstListedCents) * 1000) / 1000,
      });
    }
    if (e.type === 'routed') {
      out.routing.push({
        itemId: chain.itemId,
        at: e.at,
        route: e.route,
        co2SavedKg: e.co2SavedKg,
        ecoCredits: e.ecoCredits,
      });
    }
  }
  return out;
}

export interface FlywheelStats {
  chains: number;
  gradingRows: number;
  pricingRows: number;
  routingRows: number;
  totalRows: number;
}

/** Aggregate labelled-row counts across many chains — the flywheel's yield. */
export function flywheelStats(chains: ProvenanceChain[]): FlywheelStats {
  let g = 0;
  let p = 0;
  let r = 0;
  for (const chain of chains) {
    const rows = extractTrainingRows(chain);
    g += rows.grading.length;
    p += rows.pricing.length;
    r += rows.routing.length;
  }
  return { chains: chains.length, gradingRows: g, pricingRows: p, routingRows: r, totalRows: g + p + r };
}

/** Synthetic multi-life chains for deterministic eval (the real ones live in the
 *  global provenance store). Two-owner resale + a routed end-of-life. */
export function sampleChains(): ProvenanceChain[] {
  return [
    {
      itemId: 'sample_shoes',
      category: 'fashion',
      title: 'Adidas Ultraboost',
      events: [
        { type: 'origin', at: '2023-01-01T00:00:00Z', verified: true, seller: 'Amazon' },
        { type: 'owned', at: '2023-01-01T00:00:00Z', verified: true, ownerName: 'Aarav' },
        { type: 'graded', at: '2023-06-01T00:00:00Z', verified: true, grade: 'good', confidence: 0.82, issues: ['toe scuff'] },
        { type: 'listed', at: '2023-06-02T00:00:00Z', verified: true, price: { amountCents: 400000, currency: 'INR' } },
        { type: 'sold', at: '2023-06-10T00:00:00Z', verified: true, buyerName: 'Meera', price: { amountCents: 380000, currency: 'INR' }, co2SavedKg: 8, ecoCredits: 26 },
        { type: 'owned', at: '2023-06-10T00:00:00Z', verified: true, ownerName: 'Meera' },
        { type: 'graded', at: '2024-02-01T00:00:00Z', verified: true, grade: 'fair', confidence: 0.74, issues: ['sole wear', 'fading'] },
        { type: 'listed', at: '2024-02-02T00:00:00Z', verified: true, price: { amountCents: 250000, currency: 'INR' } },
        { type: 'sold', at: '2024-02-12T00:00:00Z', verified: true, buyerName: 'Rohan', price: { amountCents: 240000, currency: 'INR' }, co2SavedKg: 8, ecoCredits: 18 },
      ],
    },
    {
      itemId: 'sample_speaker',
      category: 'electronics',
      title: 'JBL Charge 5',
      events: [
        { type: 'origin', at: '2022-03-01T00:00:00Z', verified: true, seller: 'Amazon' },
        { type: 'owned', at: '2022-03-01T00:00:00Z', verified: true, ownerName: 'Ananya' },
        { type: 'graded', at: '2024-05-01T00:00:00Z', verified: true, grade: 'poor', confidence: 0.7, issues: ['port damage', 'battery wear'] },
        { type: 'routed', at: '2024-05-03T00:00:00Z', verified: true, route: 'recycle', co2SavedKg: 10, ecoCredits: 30 },
      ],
    },
  ];
}
