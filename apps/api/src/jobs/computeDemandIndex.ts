// Demand aggregation job — the batch half of the pricing engine.
//
// Demand is NEVER computed live per request. This job rolls up the raw
// demand_events log into the small demand_index lookup table on a schedule
// (hourly). The pricing read path only ever does a cheap point lookup against
// that precomputed table.
//
// The heavy lifting ($match a 7-day window, $group by zone × category, $sum the
// weights) happens inside MongoDB. We only do the tiny per-category
// normalization across a handful of zone rows in app code.

import cron, { type ScheduledTask } from 'node-cron';
import { getDb, isMongoConfigured } from '../lib/mongo.js';
import { log } from '../lib/logger.js';
import {
  DEMAND_EVENTS,
  DEMAND_INDEX,
  type DemandEventDoc,
  type DemandIndexDoc,
} from '../lib/collections.js';

// ── Tunables ─────────────────────────────────────────────────────────────────
const WINDOW_DAYS = 7; // rolling window of events that count toward demand
const MIN_SAMPLE = 20; // below this, leave the entry on its static fallback
const SCORE_MIN = 0.7; // clamp floor for the normalized demand factor
const SCORE_MAX = 1.3; // clamp ceiling
const NORMALIZE_K = 0.5; // spread of the factor around 1.0
const CRON_EXPRESSION = '0 * * * *'; // top of every hour

/** One row of the in-DB rollup: weighted demand + raw event count per cell. */
interface AggRow {
  _id: { region_cluster: string; category: string };
  demand: number;
  sampleSize: number;
}

export interface AggregationSummary {
  updated: number;
  skipped: number; // skipped because sample_size < MIN_SAMPLE
  cells: number; // distinct zone × category cells with activity
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Recompute the demand index from the last 7 days of events. Idempotent: it
 * upserts and can be run as often as you like. Exposed directly so it can be
 * triggered on demand (tests, the seed script, a manual admin call) without
 * waiting for the cron tick.
 */
export async function runDemandAggregation(): Promise<AggregationSummary> {
  if (!isMongoConfigured()) {
    log('warn', 'demand aggregation skipped — MongoDB not configured');
    return { updated: 0, skipped: 0, cells: 0 };
  }

  const db = await getDb();
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // In-DB rollup: weighted demand + sample size per zone × category.
  const rows = await db
    .collection<DemandEventDoc>(DEMAND_EVENTS)
    .aggregate<AggRow>([
      { $match: { timestamp: { $gte: since } } },
      {
        $group: {
          _id: { region_cluster: '$region_cluster', category: '$category' },
          demand: { $sum: '$weight' },
          sampleSize: { $sum: 1 },
        },
      },
    ])
    .toArray();

  // Per-category average demand across zones (D_avg) — the baseline each zone is
  // normalized against. Computed over the handful of returned rows.
  const sumByCategory = new Map<string, { total: number; zones: number }>();
  for (const row of rows) {
    const acc = sumByCategory.get(row._id.category) ?? { total: 0, zones: 0 };
    acc.total += row.demand;
    acc.zones += 1;
    sumByCategory.set(row._id.category, acc);
  }

  const indexCol = db.collection<DemandIndexDoc>(DEMAND_INDEX);
  const computedAt = new Date();
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const { region_cluster, category } = row._id;

    // Too little signal → leave the cell at its static fallback (no write) so we
    // don't publish a noisy demand factor off a tiny sample.
    if (row.sampleSize < MIN_SAMPLE) {
      skipped += 1;
      continue;
    }

    const stats = sumByCategory.get(category);
    const dAvg = stats && stats.zones > 0 ? stats.total / stats.zones : 0;

    // score = 1 + 0.5 * (D_zone - D_avg) / D_avg, clamped to [0.7, 1.3].
    const raw = dAvg > 0 ? 1 + NORMALIZE_K * ((row.demand - dAvg) / dAvg) : 1;
    const score = clamp(raw, SCORE_MIN, SCORE_MAX);

    await indexCol.updateOne(
      { region_cluster, category },
      { $set: { region_cluster, category, score, sample_size: row.sampleSize, computed_at: computedAt } },
      { upsert: true },
    );
    updated += 1;
  }

  log('info', 'demand aggregation complete', {
    cells: rows.length,
    updated,
    skipped,
    windowDays: WINDOW_DAYS,
  });

  return { updated, skipped, cells: rows.length };
}

/**
 * Schedule the hourly aggregation. Returns the scheduled task (so it can be
 * stopped in tests) or null when MongoDB isn't configured. Non-fatal throughout:
 * a failed run is logged and the next tick still fires.
 */
export function scheduleDemandAggregation(): ScheduledTask | null {
  if (!isMongoConfigured()) {
    log('warn', 'demand aggregation cron not scheduled — MongoDB not configured');
    return null;
  }
  const task = cron.schedule(CRON_EXPRESSION, () => {
    runDemandAggregation().catch((err: unknown) => {
      const detail = err instanceof Error ? err.message : 'unknown error';
      log('error', 'scheduled demand aggregation failed', { detail });
    });
  });
  log('info', 'demand aggregation scheduled', { cron: CRON_EXPRESSION });
  return task;
}
