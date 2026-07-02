# 016 — Dynamic pricing engine (regional demand index + live price calc)

## Goal
Give the rescue pipeline a dynamic resale price for each return. Two halves:
- a **regional demand index** — precomputed, batch-refreshed hourly from a raw
  buyer-activity log;
- a **pricing service** — computed live on read, glass-box, no writes.

Same philosophy as the routing engine ([[002-return-flow]]): logic decides,
numbers are transparent. Builds on the MongoDB layer from [[014-mongo-auth]] /
[[015-cloud-state-sync]] (native `mongodb` driver, `getDb()` lazy singleton).

## Scope
**In:** demand event capture (write path), the hourly aggregation job, the
precomputed `demand_index`, the live `calculatePrice` read path, the
`GET /api/pricing/:returnId` route, region clustering, seed/test tooling.
**Out:** AI grading integration (`condition_score` is a placeholder 0.7 until the
CLIP model in `ai-grading/` is wired in later); wiring `logDemandEvent` into real
buyer view/search/interest routes (those routes don't exist yet — see below); any
UI. Demand is **never** computed live; urgency is **never** persisted.

## Greenfield note (from codebase study)
There was **no** structured returns/listings collection and **no** server-side
buyer-activity tracking. Returns/listings lived only in the web's localStorage
(`apps/web/src/lib/mocks/exchange-store.ts`), mirrored to Mongo as opaque JSON in
the `state` collection. So `demand_events`, `demand_index`, and the structured
`returns` collection are all new. `condition_score` did not exist either (the
`ReturnGradingResult` contract uses letter grades), confirming the placeholder.

## Data model (collections, native driver — no ODM)
- **`demand_events`** (append-only, write-heavy): `{ event_type, category,
  region_cluster, pincode, timestamp, weight }`. Weights: match_completed=3,
  interest=2, view=1, search=0.5. **TTL index** on `timestamp` (expire after 14
  days; we only need a 7-day window). Helper index `{category, region_cluster,
  timestamp}` for the rollup.
- **`demand_index`** (small, read-heavy): `{ region_cluster, category, score
  (0.7–1.3), sample_size, computed_at }`. **Unique compound** `{region_cluster,
  category}` — one row per cell, stays tiny regardless of traffic.
- **`returns`** (new structured record): `{ returnId (unique), category,
  region_cluster, pincode?, base_price, condition_score?, pickup_deadline,
  listing_created_at, grade?, sku? }`. `pickup_deadline` is set once at creation,
  never recalculated.

All collection names, doc types, the weight table, and idempotent index creation
live in `apps/api/src/lib/collections.ts` (single source, mirrors `accounts-seed`).

## Pricing formula (all tunables in `PRICING_CONFIG`)
`finalPrice = base_price × conditionFactor × demandFactor × urgencyFactor × categoryFactor`
- `conditionFactor = condition_score ^ alpha`; alpha per category
  (electronics 1.8, apparel 1.3, furniture 1.2, default 1.5).
- `demandFactor`: point lookup in `demand_index`; if missing **or** `computed_at`
  older than 24h → static prior (electronics 1.15, apparel 1.0, furniture 0.9,
  default 1.0). Never computed live.
- `urgencyFactor = 1 − 0.25·(1 − t/T)^3`, `t = deadline − now`,
  `T = deadline − created`, `t/T` clamped to [0,1] (overdue / just-created /
  bad-window safe). Computed inline, never stored.
- `categoryFactor`: static (electronics 0.75, apparel 0.55, furniture 0.70,
  books_media 0.85, default 0.65).
Returns the full `PriceBreakdown` (every factor + a human-readable line).

## Aggregation job
`$match` last 7 days → `$group` by `{region_cluster, category}` summing weights
and counting samples (heavy lifting in Mongo). Per category, `D_avg` = mean
weighted demand across its zones; `score = clamp(1 + 0.5·(D_zone−D_avg)/D_avg,
0.7, 1.3)`. Cells with `sample_size < 20` are **skipped** (left on static
fallback). Upserts into `demand_index`; logs `{cells, updated, skipped}`. Runs
hourly via `node-cron` (`0 * * * *`); `runDemandAggregation()` exported for manual
/ test runs.

## Affected files
- `apps/api/src/lib/regionCluster.ts` — `getRegionCluster(pincode)` prefix buckets
  (Delhi-NCR / Bengaluru / Mumbai / other) — new.
- `apps/api/src/lib/collections.ts` — names, doc types, weights, `ensurePricingIndexes` — new.
- `apps/api/src/services/demandEvents.ts` — `logDemandEvent` fire-and-forget — new.
- `apps/api/src/jobs/computeDemandIndex.ts` — `runDemandAggregation`, `scheduleDemandAggregation` — new.
- `apps/api/src/services/pricingEngine.ts` — `PRICING_CONFIG`, `PriceBreakdown`, `calculatePrice` — new.
- `apps/api/src/routes/pricing.ts` — `GET /api/pricing/:returnId` — new.
- `apps/api/src/scripts/{seedDemandEvents,runDemandAggregation}.ts` — test tooling — new.
- `apps/api/src/lib/errors.ts` — `ReturnNotFoundError`, `ReturnIncompleteError`.
- `apps/api/src/index.ts` — mount router, ensure indexes, schedule cron.
- `apps/api/package.json` — add `node-cron` (+ types), `seed:demand` / `aggregate:demand` scripts.

## API
- `GET /api/pricing/:returnId` → 200 `PriceBreakdown`; 404 unknown id; 400 record
  missing required field(s); 503 Mongo unavailable. Pure read, safe per page view.
- `POST /api/returns` → upserts a `ReturnRecordInput` (zod-validated, ISO dates
  coerced to `Date`, keyed by `returnId`); 400 invalid, 503 Mongo unavailable.

## Frontend integration (seller flow → rescue pipeline)
The existing seller flow already did: return graded → shows in the returns queue as
"Needs your approval" → seller clicks **Approve for Local Listing** →
`createLocalRoutingListing` drops it into the rescue pipeline. Wired the engine in:
- **On approve** (`SellerReturnDetail.tsx`): also `POST /api/returns` a structured
  record (best-effort, never blocks approval). `base_price` = `priceCents/100`,
  `condition_score` = 0.7 placeholder, `region_cluster` defaulted to `Bengaluru`
  (no pincode on returns yet), `pickup_deadline` = now + `RESCUE_WINDOW_HOURS`.
- **Rescue detail Pricing tab** (`rescue/[returnId]/page.tsx`): fetches
  `GET /api/pricing/:returnId` and renders the live `PriceBreakdown` (all 5
  factors + explanation) above the existing local time-decay simulation; falls
  back to the local estimate if the record/API is absent.
- Contracts `PriceBreakdown` + `ReturnRecordInput` moved to
  `packages/shared/src/pricing-engine.ts` (single source; `pricingEngine.ts`
  re-exports `PriceBreakdown`). Client helpers `getPricing` / `upsertReturnRecord`
  added to `apps/web/src/lib/api-client.ts`.
- Seed script also upserts return records for the three pre-seeded rescue items
  (RET-2026-800001 / EX002 / EX003) so their pages show live prices immediately.

## Acceptance criteria
- `pnpm -r typecheck` passes (strict, no `any`). ✅
- Seed → aggregate → price each of the four test records (condition 0.9/0.7/0.45/
  0.15) returns a monotonically decreasing price with full breakdown. ✅
- 404 / 400 error paths verified. ✅

## Resolved decisions / open questions
- `condition_score`: not hard-required by the route — defaults to 0.7 with a
  clearly-marked TODO (Step 6) so pricing is testable before grading is wired.
- `logDemandEvent` is exposed but **not yet wired** into buyer routes — those
  (local listing view / search / interest) don't exist server-side yet; wire on
  build. Demand currently arrives via the seed script.
- `PriceBreakdown` (and `ReturnRecordInput`) now live in `packages/shared` since
  the web app consumes them; `pricingEngine.ts` re-exports `PriceBreakdown`.
- `region_cluster` is defaulted to `Bengaluru` on approval because returns carry
  no pincode yet — replace with a real buyer/seller-derived zone when available.
