# 017 — Local buyer matching engine

## Goal
Find the best local buyer for a returned item within its pickup window, before
it falls back to the warehouse. Builds directly on [[016-dynamic-pricing-engine]]:
reuses `calculatePrice`, `getRegionCluster`, and `logDemandEvent` rather than
duplicating any of that logic.

## Scope
**In:** a `buyers` collection with geospatial (2dsphere) matching, a
`match_sessions` collection tracking one return's matching lifecycle, the
four-factor ranking engine, a stubbed notification path, a 30-minute cascade
job (timeouts/retries/expiry), the matching API routes, and a buyer seed
script.
**Out:** any real SMS/email/push provider (stubbed — logs to console); any UI;
wiring buyer view-tracking into real frontend listing pages (the
`PATCH .../activity` route exists but nothing calls it yet, same "exists but
not wired" state `logDemandEvent` was left in after 016).

## Greenfield note (from codebase study)
No `buyers` collection, no geospatial index, and no notification infrastructure
existed anywhere in the codebase before this iteration — this is the first
geospatial work in the project. The existing `ReturnRecordDoc` (016) is keyed
by a **string** `returnId`, and the `users` collection (`accounts-seed.ts`) is
keyed by a **string** `id` — neither uses Mongo `ObjectId` as its primary
reference. Two deliberate deviations from a literal ObjectId-everywhere schema,
to stay consistent with that existing pattern:
- `match_sessions.return_id` is `string` (matches `returns.returnId`).
- `buyers.user_id` is `string | null` (matches `users.id`), not `ObjectId`.

`ReturnRecordDoc` also has no `city` field (only `pincode?` and the coarse
`region_cluster`). Added `getCityForPincode(pincode)` alongside
`getPincodeCoordinates(pincode)` in `regionCluster.ts` — a finer-grained lookup
(Delhi-South / Delhi-West / Delhi-North / NCR-Noida / NCR-Gurgaon / Bengaluru /
Mumbai) than the existing `getRegionCluster` zones, so within-city buyer
matching is meaningful. `pincode` is optional on `ReturnRecordDoc`; matching
throws `ReturnIncompleteError(['pincode'])` when it's missing.

## Data model (native driver, mirrors `collections.ts` conventions)
- **`buyers`**: `{ user_id, name, contact, notification_preference, location
  (GeoJSON Point), pincode, city, region_cluster, category_subscriptions,
  price_range, condition_floor, activity, is_refurbisher, is_active,
  created_at }`. Indexes: **2dsphere on `location`** (mandatory — the whole
  proximity search depends on it), `city`, `category_subscriptions`,
  `is_active`, `is_refurbisher`.
- **`match_sessions`**: `{ return_id, listing_created_at, pickup_deadline,
  status, category, region_cluster, city, condition_score, grade,
  offered_price, candidate_list[], current_candidate_index, matched_buyer_id,
  matched_at, created_at, updated_at }`. Indexes: unique `return_id`, `status`,
  `pickup_deadline`.
- `returns` extended with `match_session_id?: ObjectId` and
  `local_routing_accepted?: boolean`.

## Matching algorithm (`apps/api/src/services/matchingEngine.ts`)
Single geo-filtered Mongo query per match attempt — the DB does the radius
search (`$nearSphere` within 10km of the pincode centroid), never a JS loop
over all buyers. Hard filters, all simultaneous: `is_active`, within 10km,
same `city`, category subscribed/viewed/refurbisher, `condition_floor`
acceptable for the product's grade, `price_range.max >= offered_price`. Capped
at 50 filtered candidates, ranked in app code, top 5 returned.

`Match_Score = 0.30·Proximity + 0.35·Intent + 0.20·PriceFit + 0.15·Recency`
- **Proximity** = `1 - distance_km/10`, distance via a single exported
  `haversineDistanceKm` (regionCluster.ts) reused everywhere distance is needed.
- **Intent**: subscribed 1.0 → viewed 3+ times 0.7 → viewed 1–2 times 0.4 →
  refurbisher 0.6 → none 0.0.
- **Price fit**: within range 1.0 → below min 0.8 → 0–10% over max 0.6
  (interpolated tier, not in the original brief but needed to avoid an
  undefined gap between "within range" and the "10–25% over" tier) → 10–25%
  over 0.4 → >25% over 0.1.
- **Recency** = `exp(-0.1 × days_since_last_active)`.

`initiateMatchSession` is idempotent (replaying on an already-matched return
returns the existing session). `notifyBuyer` never throws — logs and continues
so a stub/notify failure can never take down the cascade job. `recordBuyerResponse`
ignores responses for a non-current candidate or an already-closed session
(guards against stale/out-of-order replies). Accept always logs a
`match_completed` demand event (weight 3.0, the highest-value signal in the
system) — non-negotiable per spec.

## Cascade job (`apps/api/src/jobs/matchingCascade.ts`)
Every 30 minutes (`node-cron`, same scheduler as the demand aggregation job).
Timeout detection is **stored-timestamp based** (`candidate.notified_at` vs. a
2-hour cutoff), never `setTimeout` — match state survives a server restart.
Three passes per run: advance timed-out candidates to the next in line, retry
`searching` sessions whose `updated_at` is stale (new buyers may have
registered), and fall back to `warehouse_fallback` for anything past its
`pickup_deadline`. Logs a `{timeoutsAdvanced, searchesRetried, candidatesFound,
sessionsExpired}` summary each run.

## API (`apps/api/src/routes/matching.ts`)
- `POST /api/matching/initiate/:returnId` → `{sessionId, returnId, status,
  candidateCount}` (scores stay internal). 404 return not found, 400 missing
  pincode, 503 Mongo unavailable.
- `POST /api/matching/respond/:sessionId` — body `{buyerId, response}` → updated
  `{sessionId, status, matchedBuyerId}`. 400 invalid ids, 404 session not found.
- `GET /api/matching/status/:returnId` — poll target for the seller dashboard.
- `POST /api/matching/buyers/register` — derives `location`/`city`/
  `region_cluster` from `pincode` server-side.
- `PATCH /api/matching/buyers/:buyerId/activity` — bumps `last_active` /
  `viewed_categories`, logs a `view` demand event via `logDemandEvent`.

## Seed script
`apps/api/src/scripts/seedBuyers.ts` (`pnpm --filter @reloop/api seed:buyers`) —
26 synthetic buyers across the 5 Delhi NCR zones, varied subscriptions/price
ranges/condition floors, one refurbisher per zone (4 of 5, seeded with
`condition_floor: 'Salvage'` so they stay eligible for low-grade items
regardless of the product's actual grade), `last_active` spread across the
last 30 days. Idempotent (wipes buyers at the pincodes it owns first).

## Acceptance criteria — all verified end-to-end
- `pnpm -r typecheck` passes (strict, no `any`). ✅
- Seed buyers (26 across 5 zones) → seed demand events → insert a Delhi-South
  electronics/grade-B/₹2000-base test return → `POST .../initiate` found 4
  ranked candidates, notified the top one (console stub logged name/contact/
  category/grade/price/accept-link). ✅
- `GET .../status` reflected `"notifying"` with the right candidate count. ✅
- `POST .../respond` with `accepted` for the top candidate transitioned the
  session to `"matched"`, set `matched_buyer_id`/`matched_at`, flipped
  `returns.local_routing_accepted`, and logged a `match_completed` demand event
  (weight 3) for the return's pincode/category. ✅

## Resolved decisions / open questions
- `city` on returns is derived on the fly from `pincode` via
  `getCityForPincode`, never persisted on `ReturnRecordDoc` — kept the return
  schema change to exactly what was asked (`match_session_id`,
  `local_routing_accepted`).
- Grade fallback: `ReturnRecordDoc.grade` can be `null` (AI grading not wired
  in yet, same placeholder state as 016); `resolveGrade` derives a grade from
  `condition_score` (defaulting to the pricing engine's 0.7 placeholder) when
  absent, using the thresholds A≥0.85 / B≥0.65 / C≥0.4 / else Salvage.
- No frontend wiring in this iteration — Step3Bridge / `routing-engine.ts` is
  a separate, older mock-scenario system and is untouched; this plugs into the
  same rescue pipeline as the pricing engine (returns → match_sessions), not
  into that routing engine.
