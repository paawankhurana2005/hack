// Export real pricing_transactions rows into the exact JSONL shape
// ml/pricing's AgentMemory/TransactionLogger reads (spec 024, phase 7) — the
// durable bridge from real apps/api production decisions into the offline
// Python retraining loop, which today only ever trains on synthetic data +
// its OWN simulated transactions (simulate_marketplace.py), never real ones.
//
// Run standalone:  pnpm --filter @reloop/api export:pricing-transactions
//             or:  pnpm --filter @reloop/api exec tsx src/scripts/exportPricingTransactions.ts [outPath]
//
// After exporting, the next run of `python -m reloop_pricing.pricing.simulate_marketplace`
// (or any caller of retrain_from_logger over the same runs/agent memory dir)
// picks these real rows up automatically — no retrain-machinery changes needed,
// same "wiring, not new infrastructure" shape as phase A's geo-demand bridge.
//
// Best-effort field mapping, not perfect fidelity: PricingStateVector's
// pre-transformed fields (e.g. originalPriceLog) are reverse-transformed
// (Math.expm1) to approximate the raw inputs build_feature_vector expects —
// documented here so it's a known, deliberate approximation, not a silent bug.

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PricingStateVector } from '@reloop/shared';
import { getDb, isMongoConfigured } from '../lib/mongo.js';
import { PRICING_TRANSACTIONS, type PricingTransactionDoc } from '../lib/collections.js';

// Default target: the exact path ml/pricing's AgentMemory(agent_memory_dir="runs/agent")
// reads from when invoked from the ml/pricing/ directory (its documented convention).
const DEFAULT_OUT_PATH = '../../ml/pricing/runs/agent/transactions.jsonl';

/** Reverse-map PricingStateVector's camelCase, partly-pre-derived shape onto
 *  the snake_case "raw row" shape build_feature_vector expects (matching
 *  simulate_marketplace.py's `_make_listing` state dict convention). */
function toPythonRow(state: PricingStateVector): Record<string, unknown> {
  return {
    category_l1: state.categoryL1,
    category_l2: state.categoryL2,
    brand: state.brand,
    grade_ordinal: state.gradeOrdinal,
    grade_key: state.gradeKey,
    // Approximate — original_price_log was already log1p-transformed on write.
    original_price: Math.expm1(state.originalPriceLog),
    item_age_days: state.itemAgeDays,
    has_accessories: state.hasAccessories ? 1 : 0,
    authenticity_score: state.authenticityScore,
    damage_score: state.damageScore,
    defect_count: state.defectCount,
    days_on_market: state.daysOnMarket,
    num_reprices: state.numReprices,
    is_first_listing: state.numReprices === 0 ? 1 : 0,
    deadline_pressure: state.deadlinePressure,
    view_velocity_24h: state.viewVelocity24h,
    view_velocity_trend: state.viewVelocityTrend,
    save_rate: state.saveRate,
    ctr: state.ctr,
    message_count: state.messageCount,
    cart_abandons: state.cartAbandons,
    comp_count_nearby: state.compCountNearby,
    comp_median_price: state.compMedianPrice,
    comp_min_price: state.compMinPrice,
    comp_sold_last_7d: state.compSoldLast7d,
    comp_avg_days_to_sell: state.compAvgDaysToSell,
    amazon_new_price: state.amazonNewPrice,
    nearby_buyer_count: state.nearbyBuyerCount,
    local_supply_count: state.localSupplyCount,
    geo_demand_index: state.geoDemandIndex,
    seller_floor: state.sellerFloor,
    route_elsewhere_value: state.routeElsewhereValue,
    floor: Math.max(state.sellerFloor, state.routeElsewhereValue),
    seasonality_index: state.seasonalityIndex,
    day_of_week_sin: state.dayOfWeekSin,
    day_of_week_cos: state.dayOfWeekCos,
    hour_of_day_sin: state.hourOfDaySin,
    hour_of_day_cos: state.hourOfDayCos,
  };
}

function toJsonlRow(doc: PricingTransactionDoc): string {
  const row = {
    state: toPythonRow(doc.state),
    arm: doc.arm,
    reward: doc.reward,
    outcome: {
      sold: doc.sold,
      rerouted: doc.rerouted,
      reroute_destination: doc.reroute_destination ?? null,
      final_price: doc.final_price,
      days_on_market: doc.days_on_market,
    },
  };
  return JSON.stringify(row);
}

async function main(): Promise<void> {
  const outPath = process.argv[2] ?? DEFAULT_OUT_PATH;

  if (!isMongoConfigured()) {
    // eslint-disable-next-line no-console
    console.error('[export] MongoDB not configured — nothing to export.');
    process.exit(1);
  }

  const db = await getDb();
  const docs = await db.collection<PricingTransactionDoc>(PRICING_TRANSACTIONS).find({}).toArray();

  if (docs.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[export] no pricing_transactions rows found — nothing to export.');
    process.exit(0);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  const lines = docs.map(toJsonlRow).join('\n') + '\n';
  appendFileSync(outPath, lines);

  // eslint-disable-next-line no-console
  console.log(`[export] appended ${docs.length} real transaction rows to ${outPath}`);
  process.exit(0);
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[export] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
