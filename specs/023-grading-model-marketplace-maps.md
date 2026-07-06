# 023 — Own grading model, returned-item marketplace, real maps

## Goal

Three gaps raised in chat, closed in one iteration on top of spec 022's
wiring pass:

1. **Grading provider**: the live Return-flow `/api/grade` route called the
   NVIDIA-hosted vision model directly, never the team's own trained DINOv2
   grader (spec 108, `ml/grading/`). The team's own model is now the primary
   grading source, with automatic fallback to NVIDIA on error/timeout — NVIDIA
   stays in the picture only for what it always did: LLM narration (health-card
   summaries, routing reasoning, agent activity feed, Rufus).
2. **Marketplace edge cases for return-sourced items**: returned items differ
   from fresh Sell-flow items — no original packaging, and a wide condition
   range from "slightly damaged but resellable" to refurb/liquidate-only. The
   spec 016/021 routing engine already decides restock/local_resale/refurbish/
   liquidate/donate/recycle/warehouse per item; the gap was a dedicated
   buyer-facing page for these discounted items, a packaging-missing signal on
   the listing card, and a way for a seller to manually approve a markdown
   price distinct from the fully-autonomous repricer.
3. **Real maps**: the buyer "Intelligent Bridge" redirect screen and seller
   nearby-buyer screens showed location as plain text or a fake decorative
   rings widget. Real lat/lng existed server-side (pincode lookups, MongoDB
   geo-matching) but never reached the UI.

Explicitly **out of scope**, per the user, documented here as a future
iteration only: a full LLM-agent-driven selling workflow, and a geospatial
database + push notifications to nearby interested buyers triggered by agent
activity.

## Scope

**In scope**
- Own-trained grading model (`ml/grading/serve.py`) wired as the primary
  `VlmProvider` for both Sell and Return flows, NVIDIA as automatic fallback.
- `routes/grade.ts` unified onto the same `GradingService`/`VlmProvider` seam
  the Sell flow uses (previously a separate direct-`nvidiaChat` code path).
- A new buyer-facing `/app/shop/returned` page for hub-verified return items,
  plus a `packagingSealed` badge on the shared `ShopCard`.
- A seller-initiated markdown override: seeded at Hub Bench dispatch
  (`birthReturnListing`), and a second, later `seller_markdown` reprice-engine
  event for an already-listed item — both raise the listing's floor so the
  autonomous repricer never discounts below what the seller approved.
- A reusable Leaflet + OpenStreetMap component (no API key), wired into the
  buyer Intelligent Bridge screen and the three seller nearby-buyer screens.
- Real coordinates threaded server-side: `ReturnRoutingDecision.origin`/
  `destination` (illustrative hub locations) and `GET /api/matching/status/
  :returnId`'s new `candidates` array (real buyer geo, derived at read-time).

**Out of scope**
- New routing/pricing economics — the map and packaging badge are pure
  visualization/display of existing decisions, not new EV inputs.
- Real hub/refurb-center GPS data — `hub-locations.ts` is illustrative demo
  data, matching the existing `PINCODE_TABLE` convention.
- Wiring `seller/rescue`, `seller/listings/[listingId]`, `seller/exchange` off
  their `exchange-store.ts` mock onto the real matching API — Phase K exposes
  real geo on that endpoint, but these three pages still render mock buyers
  (now with illustrative Bengaluru-neighborhood coordinates for the map).
- Full LLM-agent-driven selling workflow; geospatial DB + proactive buyer
  notifications (both explicitly deferred to a future iteration).

## Affected files

**Grading model**
- `apps/api/src/config.ts` — `GRADING_PROVIDER` enum widened to
  `'chat-vlm' | 'trained-local'` (default `'trained-local'`); new
  `GRADING_MODEL_URL`.
- `apps/api/src/index.ts` — composition root builds `gradingProvider` as
  `FallbackVlmProvider(LocalModelProvider, NvidiaVlmProvider)` when
  `GRADING_PROVIDER === 'trained-local'`; `routes/grade.ts` now DI'd with the
  same `gradingService` instance the Sell flow uses.
- `apps/api/src/services/grading/fallback-provider.ts` — new; races primary
  vs. a timeout, falls back to secondary on error/timeout.
- `apps/api/src/routes/grade.ts` — rewritten as `createGradeHandler(gradingService)`;
  direct `nvidiaChat`/prompt-parsing code deleted.
- `packages/shared/src/return.ts` — new `conditionGradeToReturnGrade()` bridges
  the Sell flow's `ConditionGrade` onto the Return flow's `Grade`.
- `apps/api/src/lib/routing-engine.ts` — `getCategory` renamed/exported as
  `skuToCategory` (reused by `routes/grade.ts` instead of a duplicated table).
- `ml/grading/README.md`, root `package.json` (`dev:grader` script),
  `apps/api/.env.example`, `CLAUDE.md` — dev/prod run instructions; Render
  must set `GRADING_PROVIDER=chat-vlm` (nothing deploys the Flask server there).

**Marketplace**
- `packages/shared/src/health-card.ts` — `ProductHealthCard.packagingSealed?: boolean`.
- `apps/web/src/app/seller/hub/page.tsx` — `birthReturnListing()` gains
  `packagingSealed` and optional `sellerApprovedPriceCents` params; a bench-UI
  price input seeds `listedCents`/raises `floorCents` for local_resale items.
- `apps/web/src/components/shop/shop-card.tsx` — "Packaging not included" badge.
- `apps/web/src/lib/market.ts` — new `getReturnedShopEntries()`.
- `apps/web/src/app/app/shop/returned/page.tsx` — new curated page.
- `apps/web/src/app/app/shop/page.tsx` — promo link to the new page.
- `packages/shared/src/pricing/types.ts`, `.../pricing/events.ts` — new
  `DemandEventType`/`PricingReasonCode` member `seller_markdown`.
- `apps/api/src/routes/pricing.ts` — `eventTypeEnum` gains `'seller_markdown'`.
- `apps/api/src/services/pricing/reprice-engine.ts` — `seller_markdown` skips
  the step-cap guardrail and uses `payload.approvedPrice` as `rawPrice` directly.
- `apps/api/src/services/pricing/reprice-narrate.ts` — narration template
  case for the new reason code.
- `apps/web/src/lib/agent-store.ts` — new `applyManualMarkdown()`.
- `apps/web/src/app/seller/local-listings/page.tsx` — "Set price" control.

**Maps**
- `apps/web/package.json` — `leaflet`, `react-leaflet@4`, `@types/leaflet`.
- `apps/web/src/components/map/LeafletMap.tsx` (dynamic `ssr:false` wrapper),
  `LeafletMapInner.tsx` (actual render), `leaflet-theme.css` (light
  navy/orange chrome overrides).
- `apps/api/src/lib/hub-locations.ts` — new; illustrative per-region-cluster
  destination coordinates by decision type.
- `apps/api/src/lib/routing-engine.ts` — `computeRouting` attaches
  `origin`/`destination` for `local_resale|refurbish|liquidate|donate|recycle`.
- `apps/api/src/routes/route.ts` — threads `origin`/`destination` onto the
  `ReturnRoutingDecision` response (both `routeHandler` and `checkpointHandler`).
- `apps/api/src/routes/matching.ts` — `GET /status/:returnId` gains a
  `candidates` array (real buyer lat/lng, distance via existing `haversineDistanceKm`).
- `apps/web/src/components/return/BuyerStep2Pickup.tsx` — map on the
  Intelligent Bridge screen (origin/destination pins + eco-credit popup).
- `apps/web/src/lib/mocks/exchange-store.ts` — new `coordsForBuyer()` helper
  (Bengaluru-neighborhood lookup, illustrative).
- `apps/web/src/app/seller/rescue/[returnId]/page.tsx`,
  `apps/web/src/app/seller/listings/[listingId]/page.tsx`,
  `apps/web/src/app/seller/exchange/page.tsx` — nearby-buyers map added
  (exchange page's decorative concentric-rings widget removed).

## Data contracts

```ts
// packages/shared/src/return.ts
export function conditionGradeToReturnGrade(g: ConditionGrade): Grade;

export interface ReturnRoutingDecision {
  // ...existing fields
  origin?: { lat: number; lng: number };
  destination?: { lat: number; lng: number; label: string };
}

export interface MatchCandidateGeo {
  buyerId: string; city: string; lat: number; lng: number;
  distanceKm: number; matchScore: number;
  response: 'pending' | 'accepted' | 'declined' | 'timeout';
}
export interface MatchStatusResponse { /* ...; candidates: MatchCandidateGeo[] */ }
```

```ts
// packages/shared/src/health-card.ts
export interface ProductHealthCard {
  // ...existing fields
  packagingSealed?: boolean;
}
```

```ts
// packages/shared/src/pricing/types.ts
export type DemandEventType = /* ... */ | 'seller_markdown';
export type PricingReasonCode = /* ... */ | 'seller_markdown';
```

## UI / behavior

- **Grading**: `GRADING_PROVIDER=trained-local` (dev default) calls
  `ml/grading/serve.py` first; on error/timeout within 6s, falls back to
  NVIDIA automatically, with a `grading.trained_model_fallback` warn log.
  `GRADING_PROVIDER=chat-vlm` (Render/prod) skips the trained model entirely.
- **Marketplace**: `/app/shop/returned` shows only hub-verified,
  return-sourced items (`openBox: true`); cards surface a packaging-missing
  badge when `packagingSealed === false`. Hub Bench operators can type an
  approved list price for a `local_resale` item, which becomes both the
  initial price and the floor; sellers can later call `applyManualMarkdown()`
  from Local Listings to reprice an already-listed item in one step (through
  the real reprice engine, not a client-only clamp), which also raises the floor.
- **Maps**: the buyer Intelligent Bridge screen renders an origin→destination
  map with a distance + eco-credits popup for `local_resale|refurbish|
  liquidate` decisions, using the same numbers already shown in text above it
  (no new economics). The three seller nearby-buyer screens (`rescue`,
  `listings/[listingId]`, `exchange`) render a map of matched buyers using
  illustrative neighborhood coordinates layered on top of the existing mock
  buyer data.

## Acceptance criteria

1. `pnpm -r typecheck` and `pnpm --filter web build` (dev server stopped) pass.
2. API boots cleanly with the default `GRADING_PROVIDER=trained-local` even
   when no Flask server is running (fallback engages on the first grade call,
   not at boot — `LocalModelProvider` only makes an HTTP call inside
   `assessImage()`).
3. `POST /api/grade` with `photos: []` still returns the deterministic
   `mockGradeResult` path unchanged (verified via a local smoke test).
4. `grep -rn "nvidiaChat(" apps/api/src/routes/grade.ts` shows no matches —
   the Return flow's grading call site no longer calls NVIDIA directly.
5. A `local_resale`-routed return, once dispatched from Hub Bench, appears on
   both `/app/shop` and `/app/shop/returned`.
6. Setting a Hub Bench approved price raises both `listedCents` and
   `floorCents`; `applyManualMarkdown()` on an already-listed item never
   returns a price below the (possibly-raised) floor.
7. The Intelligent Bridge map and the three seller buyer-map screens render
   without a Next.js SSR error (Leaflet is dynamic-imported with `ssr:false`
   everywhere it's used).

## Resolved decisions

1. **Grading fallback direction**: own trained model is primary; NVIDIA is
   the automatic fallback on error/timeout — not the reverse, and not a
   feature flag defaulting off. Render/prod is the one place that flips back
   to `chat-vlm` explicitly, since nobody has deployed the Flask server there.
2. **Grade-taxonomy bridge is honest, not exhaustive**: `authenticityMatch`/
   `wardrobingFlag` are static defaults (`true`/`false`) under the trained
   model, since spec 108's CV model never scoped those signals. This isn't a
   regression — the old direct-NVIDIA prompt only ever guessed them
   unverified — but it's an open product question whether to build real
   signals for these later.
3. **Seller-markdown placement**: seeding happens at Hub Bench
   (`birthReturnListing`), not at the earlier `SellerReturnDetail` approval
   screen — confirmed with the user after tracing that `SellerReturnDetail`'s
   approve action doesn't feed the real listing/repricer at all, while
   Hub Bench's bench-verified grade is what actually births the listing and
   already supersedes the doorstep grade per spec 022.
4. **Map library**: Leaflet + OpenStreetMap tiles, chosen over Google Maps for
   zero API-key/billing setup risk before a live demo.
5. **Map data is illustrative, not new ground truth**: hub-location
   coordinates and Bengaluru-neighborhood buyer coordinates are demo data
   (matching the existing `PINCODE_TABLE`/`STATIC_SELLER` convention) and
   deliberately do not feed back into any EV/economics calculation — the map
   visualizes numbers the engine already computed via its existing SKU-prefix
   mock, per spec 022's precedent of not changing routing economics in a
   wiring/display pass.
6. **`rescue`/`listings`/`exchange` stay on the mock**: Phase K exposes real
   buyer geo on `GET /api/matching/status/:returnId`, but these three pages
   were deliberately left on `exchange-store.ts`'s mock rather than silently
   swapping their data source as a side effect of the map feature. Wiring them
   to the real endpoint is a natural, cheap follow-up, not done here.
7. **Out of scope, deferred to a future iteration** (per the user): a full
   LLM-agent-driven selling workflow, and a geospatial database + push
   notifications to nearby interested buyers triggered by agent activity.
