# 024 — Multi-agent orchestration, real geo-pricing, in-app notifications

> Status: **All 8 buildable phases landed** (real geo-demand + Sales Agent +
> notifications; real seasonality; real per-listing engagement capture; LLM
> notification narration + preferences; opt-in scheduled Sales Agent runs;
> buyer-side notifications; production-log → Python retraining bridge; geo
> as a bandit posterior dimension). Phase 9 (real geocoding) remains
> explicitly out of scope — see its entry in §Extensive phased list.

## Goal

Specs 022/023 finished wiring the Return Pipeline end-to-end and made every
engine's reasoning visible. This iteration grows the platform toward a
multi-agent system: a deeper XGBoost feature set with batch training, a
"Sales Agent" that views analytics/predicts price/lists items and explains
itself, a notification system (personal + cascading), and a geospatial
signal tying return-item locality to local demand to pricing.

Rather than an open-ended feature dump, exploration of the codebase surfaced
four concrete, already-latent problems — this spec closes them, and
documents the rest as future phases (§Extensive phased list):

1. **The XGBoost geo/local feature group was permanently fake.**
   `apps/api/src/services/pricing/reprice-engine.ts`'s `fillState()` hardcoded
   `nearbyBuyerCount ?? 5`, `localSupplyCount ?? 3`, `geoDemandIndex ?? 0.5`
   for every decision, regardless of the return's actual pincode — even
   though a real, live `demand_index` collection (`computeDemandIndex.ts`)
   and a real 2dsphere buyer index (`matchingEngine.ts`) already existed and
   were simply never connected. Every retrain row for this feature group was
   training on noise. Spec 014 flagged this exact gap as an open question.
2. **Seasonality is a named field with no seasonal logic** (`seasonalityIndex`
   is always a flat/random placeholder) — real but lower-leverage than #1.
   **Built in Phase 2** (§Affected files, section D).
3. **No seller-portfolio-level agent existed.** Every prior "agent"
   (`agent.ts`/`agent-store.ts`) operates one listing at a time and needs a
   human to open that listing and click through it. No single surface said
   "here's everything happening across my whole catalog, and here's what to
   do about it."
4. **Cascading match events were real but silent.** `matchingCascade.ts` is a
   genuine, restart-safe cron (timeout → next candidate → expiry →
   warehouse), but every state change was invisible to the seller — the only
   "notification" was a log-line stub in `matchingEngine.ts`.

## Scope

**In scope (built)**
- Real geo-demand wiring into the reprice engine, TS serving side and Python
  offline-training/simulation mirror (Phase 1).
- A portfolio-level Sales Agent (on-demand, reuses the existing per-listing
  engine — no new pricing brain) (Phase 1).
- A real, Mongo-backed in-app notification system (bell/inbox in the seller
  dashboard), fed by the matching cascade job, the Sales Agent, and the
  Listing Agent's escalations (Phase 1).
- A real, calendar-driven seasonality signal, TS + Python mirror (Phase 2).
- Real per-listing engagement capture — `view` (shop page visit) and
  `message` (a real Rufus question) — aggregated live into the reprice
  engine's demand-signal feature group (Phase 3).
- Optional LLM narration for notification bodies + per-seller preferences
  (mute a kind, quiet hours for routine updates) (Phase 4).
- Opt-in scheduled Sales Agent runs, safe against the exact race Phase 1
  deferred this for (a manual-control lock skips any listing the seller is
  actively driving by hand) (Phase 5).
- Buyer-side notifications — for the one case with anywhere to show them (a
  `BuyerDoc.user_id` linked to a real platform account), the same bell now
  appears in the user-app nav and fires on a real match opportunity (Phase 6).
- A durable bridge from real `apps/api` reprice decisions into ml/pricing's
  offline retraining — a new `pricing_transactions` collection + an export
  script that writes them into the exact JSONL shape `retrain_from_logger`
  already reads (Phase 7).
- Geo as a bandit posterior dimension: `region_cluster` pools bandit
  exploration as a third dimension (alongside category × grade) when
  resolved, TS + Python mirror, falling back to the coarser pool otherwise
  (Phase 8).

**Out of scope (all buildable phases now landed — see Phase 9 below)**
- Real geocoding. See §Extensive phased list.
- `save`/`cart_abandon` engagement signals — no wishlist or cart feature
  exists in the app to attach a real event to yet (Phase 3 honesty note, not
  a future phase per se — revisit if/when those UI features are built).
- Real SMS/email/push delivery — notifications stay in-app only, the same
  deferral spec 020 already made twice for buyer-side notifications.
- A literal UI-theme-toggle agent capability — raised in chat, confirmed not
  a real requirement.

## Extensive phased list

- **Phase 1 — built.** Real geo-demand wiring (TS + Python mirror), a
  portfolio-level Sales Agent, a real in-app notification system.
- **Phase 2 — built.** Seasonality as a real signal: a calendar-driven curve
  (festival/wedding-season windows) keyed by category × month. Unlike
  `geoDemandIndex`, needs no Mongo/live aggregation — it's a pure function, so
  it's always real, even offline. Feeds the same `seasonalityIndex` slot, no
  schema change.
- **Phase 3 — built.** Real click/view/engagement capture per-listing: a new
  `listing_events` collection (mirrors `demand_events`'s shape, keyed by
  `listing_id` instead of region/pincode since listings have no other
  server-side record), fed by a real shop-page `view` and a real Rufus
  `message`, aggregated live (cheap per-listing counts, no batch job needed)
  into `viewVelocity24h`/`viewVelocityTrend`/`ctr`/`messageCount`.
  `save`/`cart_abandon` stay on their defaults — no wishlist/cart feature
  exists yet to attach a real signal to.
- **Phase 4 — built.** Optional LLM narration for notification bodies (same
  `Completer`+fallback pattern as `reprice-narrate.ts` — the deterministic
  body every call site already builds is always correct; the LLM only
  rephrases it, instant fallback on any failure) + per-seller preferences:
  mute a kind entirely, or quiet non-urgent (`info`) notifications during set
  hours (`warning`/`success` always come through).
- **Phase 5 — built.** Opt-in scheduled Sales Agent runs. A new manual-control
  lock (`agent-lock.ts`) is what makes this safe: any listing whose own
  detail page is actively driving its clock (manual step or auto-run)
  acquires the lock, and the Sales Agent skips locked listings on a
  scheduled pass — solving the exact race Phase 1 named when deferring this.
  Still browser/localStorage-scoped (a demo stand-in for a real cron), with a
  persisted `lastRunAt` so the cadence survives page reloads.
- **Phase 6 — built.** Buyer-side notifications. Buyers split into two real
  populations: synthetic seeded buyers (`BuyerDoc.user_id: null` — the common
  case, no dashboard, stay on the log-line stub) and buyers linked to a real
  platform account (`user_id` set) — the latter now get the exact same
  `NotificationDoc`/bell the seller dashboard uses, mounted in the user-app
  nav, fired from `sendNotification()` on a real match opportunity.
- **Phase 7 — built.** Bridge real `apps/api` production logs into Python
  retraining. `RepriceEngine.logOutcome()` now persists a real (state, arm,
  reward) row per outcome to a new `pricing_transactions` collection —
  before this, that data only ever existed as a `pricing.outcome` console log
  line. `scripts/exportPricingTransactions.ts` reads it back and writes the
  exact JSONL shape `ml/pricing`'s `AgentMemory`/`TransactionLogger` already
  reads (`runs/agent/transactions.jsonl`), so the very next
  `retrain_from_logger()` call blends in real rows — no retrain-machinery
  changes needed, same "wiring, not new infrastructure" shape as phase A.
  Field mapping is best-effort (documented, not perfect fidelity) since
  `PricingStateVector` is partly pre-derived (e.g. `originalPriceLog`) versus
  the raw-row shape `build_feature_vector` expects.
- **Phase 8 — built.** Geo as a bandit posterior dimension — spec 014's own
  open question ("geo as a posterior dimension vs. a feature-only signal
  (currently feature-only)"), now resolved. `ContextBucket` gains an optional
  `regionCluster`; `RepriceBandit`/`BucketedBandit` pool exploration by
  `category|gradeKey|regionCluster` when resolved (via `geo-features.ts`,
  already computing it since phase A), falling back to the coarser
  `category|gradeKey` pool otherwise — never fragments cold-start data when
  there's nothing to resolve.
- **Phase 9** — Real geocoding to replace `PINCODE_TABLE`/`PREFIX_FALLBACK`
  (explicitly out of scope here; noted so it isn't rediscovered as a
  surprise).

## Affected files

**A. Real geo-demand wiring**
- `apps/api/src/services/pricing/geo-features.ts` — new;
  `resolveGeoPricingFeatures()`.
- `apps/api/src/services/pricingEngine.ts` — `getDemandFactor` exported
  (was private).
- `apps/api/src/services/matchingEngine.ts` — `SEARCH_RADIUS_KM` (already
  exported) reused.
- `apps/api/src/services/pricing/reprice-engine.ts` — `RepriceRequest` gains
  `pincode?`/`returnId?`; `decide()` resolves geo features before
  `fillState()`; `PricingDecision` now also carries `geoDemandIndex` (the
  value actually used, for glass-box reasoning and for the Sales Agent's
  `relist` lever).
- `apps/api/src/routes/pricing.ts` — `decideSchema` gains `pincode`/`returnId`.
- `packages/shared/src/pricing/types.ts` — `PricingDecision.geoDemandIndex`.
- `apps/web/src/lib/api-client.ts` — `PricingDecideRequest` gains
  `pincode?`/`returnId?`.
- `apps/web/src/lib/agent-store.ts` — `decideViaEngine()` passes `returnId`
  for return-sourced listings (`itemId` starts with `item_ret_`, per
  `birthReturnListing()` in `seller/hub/page.tsx`); returns `geoDemandIndex`
  alongside each decision.
- `ml/pricing/reloop_pricing/pricing/geo.py` — new; mirrors
  `computeDemandIndex.ts`'s normalize/clamp formula.
- `ml/pricing/reloop_pricing/pricing/simulate_marketplace.py` — `geo_demand_index`
  now a noisy read of the cohort's real hidden demand bias (`CATEGORY_BIAS`)
  via `geo.py`, not an unrelated random draw.

**B. In-app notification system**
- `packages/shared/src/notifications.ts` — new; `Notification`,
  `NotificationKind`, `NotificationSeverity`.
- `packages/shared/src/index.ts` — export.
- `apps/api/src/lib/collections.ts` — new `NOTIFICATIONS` collection +
  `NotificationDoc` + indexes; `ReturnRecordDoc.seller_id?` (new, optional).
- `apps/api/src/services/notifications/notification-service.ts` — new;
  `createNotification`, `createNotificationForReturn` (never throws),
  `listNotifications`, `markRead`, `markAllRead`.
- `apps/api/src/routes/notifications.ts` — new; `POST /api/notifications`,
  `GET /api/notifications/:sellerId`, `PATCH /api/notifications/:id/read`,
  `PATCH /api/notifications/:sellerId/read-all`.
- `apps/api/src/index.ts` — mounts the router.
- `apps/api/src/routes/returns.ts`, `packages/shared/src/pricing-engine.ts`
  (`ReturnRecordInput.sellerId?`), `apps/web/src/app/seller/returns/[returnId]/SellerReturnDetail.tsx`
  (`handleApprove()` passes `currentAccountId()`) — thread the owning seller
  onto a return record.
- `apps/api/src/jobs/matchingCascade.ts` — timeouts/retries/expiry each
  notify the owning seller (fire-and-forget, never throws).
- `apps/api/src/services/matchingEngine.ts` — `recordBuyerResponse()` notifies
  on acceptance.
- `apps/web/src/lib/api-client.ts` — `createNotification`, `listNotifications`,
  `markNotificationRead`, `markAllNotificationsRead`.
- `apps/web/src/components/seller/notification-bell.tsx` — new; polling
  bell/inbox.
- `apps/web/src/app/seller/layout.tsx` — mounts the bell in the sidebar.

**D. Real seasonality signal (Phase 2)**
- `apps/api/src/lib/seasonality.ts` — new; `getSeasonalityIndex(category, at?)`,
  a pure calendar-driven category × month lookup (no Mongo dependency).
- `apps/api/src/services/pricing/reprice-engine.ts` — `fillState()`'s
  `seasonalityIndex ?? 0.5` placeholder replaced with
  `s.seasonalityIndex ?? getSeasonalityIndex(s.category)`.
- `ml/pricing/reloop_pricing/pricing/seasonality.py` — new; 1:1 mirror of
  `seasonality.ts`, same convention as `significance.py`↔`events.ts`.
- `ml/pricing/reloop_pricing/pricing/simulate_marketplace.py` —
  `seasonality_index` now `get_seasonality_index(category, ...)` against a
  synthetic calendar anchor (`SIM_CALENDAR_ANCHOR` + the simulated day
  offset), not an unrelated `rng.uniform(0.3, 0.7)` draw.

**C. Sales Agent**
- `packages/shared/src/agent.ts` — `AgentAction` gains `'relist'`; new
  `SalesAgentDigest` type (reuses `AgentEvent` verbatim).
- `apps/web/src/lib/agent-store.ts` — `AgentState` gains `escalatedAtDay?`/
  `escalatedGeoDemandIndex?` (recorded when `escalate_route` fires); new
  exports `checkRelistCandidate()`, `relistFromRoute()`, `isRelistCandidate()`,
  `RELIST_DEMAND_MARGIN`.
- `apps/web/src/lib/sales-agent.ts` — new; `runSalesAgent(sellerId)`.
- `apps/web/src/app/seller/sales-agent/page.tsx` — new; "Run Sales Agent"
  button, digest summary, per-listing reasoning breakdown.
- `apps/web/src/app/seller/layout.tsx` — nav entry.

**E. Real per-listing engagement capture (Phase 3)**
- `apps/api/src/lib/collections.ts` — new `LISTING_EVENTS` collection +
  `ListingEventDoc` (`listing_id`, `event_type: 'view'|'save'|'message'|
  'cart_abandon'`, `timestamp`) + TTL/lookup indexes (mirrors `demand_events`).
- `apps/api/src/services/listingEvents.ts` — new; `logListingEvent()`
  (fire-and-forget, mirrors `logDemandEvent()`) and `getListingEngagement()`
  (live per-listing aggregation — cheap enough to skip a batch job, unlike
  `demand_index`'s hourly cron).
- `apps/api/src/routes/listing-events.ts` — new; `POST /api/listings/:listingId/events`.
- `apps/api/src/index.ts` — mounts the router.
- `apps/api/src/services/pricing/reprice-engine.ts` — `decide()` resolves
  engagement features alongside geo features before `fillState()`.
- `apps/web/src/lib/api-client.ts` — `logListingEvent()`.
- `apps/web/src/app/app/shop/[itemId]/page.tsx` — fires a real `view` event
  on mount.
- `apps/web/src/components/rufus/rufus-chat.tsx` — new optional `listingId`
  prop; fires a real `message` event on every question asked.
- `apps/web/src/components/shop/shop-detail.tsx` — passes `item.id` as
  `listingId` to `RufusChat`.

**F. LLM notification narration + preferences (Phase 4)**
- `apps/api/src/services/notifications/notification-narrate.ts` — new;
  `narrateNotification()` + `Completer`, same shape as `reprice-narrate.ts`.
- `apps/api/src/services/notifications/notification-service.ts` —
  `configureNotificationNarration()` (module-level seam, same convention as
  `lib/mongo.ts`'s singleton `getDb()`); `createNotification()` now narrates
  the body and gates on preferences before inserting, returning `null` when
  suppressed (muted kind, or `info` severity during quiet hours); new
  `getPreferences()`/`setPreferences()`.
- `apps/api/src/lib/collections.ts` — new `NOTIFICATION_PREFS` collection +
  `NotificationPrefsDoc` (`seller_id`, `muted_kinds`, `quiet_hours_start?`,
  `quiet_hours_end?`) + unique index.
- `apps/api/src/routes/notifications.ts` — `POST /` handles a `null` (now
  `{suppressed: true}`); new `GET`/`PUT /api/notifications/:sellerId/preferences`.
- `apps/api/src/index.ts` — `configureNotificationNarration(narrator)` reuses
  the same LLM completer already built for the reprice engine.
- `packages/shared/src/notifications.ts` — new `NotificationPreferences` type.
- `apps/web/src/lib/api-client.ts` — new `putJson()` helper,
  `getNotificationPreferences()`/`setNotificationPreferences()`.
- `apps/web/src/components/seller/notification-bell.tsx` — a "Preferences"
  panel (mute per kind, set quiet hours) inside the existing dropdown.

**G. Scheduled Sales Agent runs (Phase 5)**
- `apps/web/src/lib/agent-lock.ts` — new; `acquireManualLock()`/
  `releaseManualLock()`/`isManuallyLocked()`, an in-memory (per-tab) mutex.
- `apps/web/src/app/seller/local-listings/page.tsx`,
  `apps/web/src/app/app/listings/[listingId]/page.tsx` — each acquires the
  lock on their listing while auto-run is active, releasing on stop/unmount.
- `apps/web/src/lib/sales-agent.ts` — `runSalesAgent()` skips any
  `isManuallyLocked()` listing; new `runSalesAgentIfDue()`, `getLastRunAt()`,
  `markRunNow()` (localStorage-persisted per-seller cadence,
  `DEFAULT_SCHEDULE_INTERVAL_MS` = 5 min).
- `apps/web/src/app/seller/sales-agent/page.tsx` — a "Run automatically"
  checkbox; polls `runSalesAgentIfDue()` every 30s while enabled, and a
  manual run also calls `markRunNow()` so the two don't double-fire.

**H. Buyer-side notifications (Phase 6)**
- `apps/api/src/services/matchingEngine.ts` — `sendNotification()` now also
  calls `createNotification()` (not `createNotificationForReturn`, which is
  return→seller; this is buyer→buyer, keyed directly by `buyer.user_id`)
  whenever `buyer.user_id` is set — the one case with anywhere to show it.
  The log-line stub is unchanged and still fires for every buyer.
- `apps/web/src/components/layout/app-nav.tsx` — mounts `NotificationBell`
  (unchanged component — `sellerId` is really just "recipient account id",
  works identically for a buyer's own account id).

**I. Production-log → Python retraining bridge (Phase 7)**
- `apps/api/src/lib/collections.ts` — new `PRICING_TRANSACTIONS` collection +
  `PricingTransactionDoc` (`listing_id`, full `state: PricingStateVector`,
  `arm`, `reward`, `sold`, `rerouted`, `reroute_destination?`, `final_price`,
  `days_on_market`, `created_at`) + index.
- `apps/api/src/services/pricing/production-log.ts` — new;
  `logPricingTransaction()` (fire-and-forget, mirrors `logDemandEvent()`).
- `apps/api/src/services/pricing/reprice-engine.ts` — `LastDecision` now
  keeps the full `state` (not just its bucket); `logOutcome()` persists a
  real transaction row alongside the existing `pricing.outcome` log line.
- `apps/api/src/scripts/exportPricingTransactions.ts` — new; reads
  `pricing_transactions`, best-effort-maps each camelCase
  `PricingStateVector` onto the snake_case raw-row shape
  `build_feature_vector` expects, appends JSONL matching
  `TransactionLogger`'s exact format to `ml/pricing/runs/agent/transactions.jsonl`.
- `apps/api/package.json` — `export:pricing-transactions` script.

**J. Geo as a bandit posterior dimension (Phase 8)**
- `packages/shared/src/pricing/types.ts` — `ContextBucket.regionCluster?: string`.
- `apps/api/src/services/pricing/reprice-bandit.ts` — `bucketKey()` includes
  `regionCluster` when present (`category|gradeKey|regionCluster`), falls
  back to `category|gradeKey` otherwise.
- `apps/api/src/services/pricing/geo-features.ts` — `GeoPricingFeatures`
  gains `regionCluster?: string` (request metadata, not a
  `PricingStateVector` feature — returned alongside the existing geo/local
  features it already computes internally).
- `apps/api/src/services/pricing/reprice-engine.ts` — `decide()` destructures
  `regionCluster` out of the resolved geo features (kept out of `fillState()`
  — it's not a feature-vector field) and includes it when building `bucket`.
- `ml/pricing/reloop_pricing/pricing/bandit.py` — `BucketedBandit.bucket_key()`
  gains an optional `region_cluster` param, same conditional-inclusion shape.
- `ml/pricing/reloop_pricing/pricing/agent.py` — `PricingAgent.bucket_key()`
  reads `state.get("region_cluster")` when present; the marketplace simulator
  doesn't yet assign listings a synthetic region (an honest, documented gap,
  not a broken promise — see its own comment).

## Data contracts

```ts
// packages/shared/src/pricing/types.ts
export type PricingDecision = {
  // ...existing fields
  geoDemandIndex: number; // the geo/local feature actually used this decision
};

// packages/shared/src/agent.ts
export type AgentAction =
  | 'hold' | 'reprice' | 'widen_radius' | 'improve_listing' | 'escalate_route'
  | 'relist'; // Sales Agent only

export interface SalesAgentDigest {
  ranAt: string;
  listingsReviewed: number;
  actionsByType: Partial<Record<AgentAction, number>>;
  events: AgentEvent[];
  narrative: string;
}

// packages/shared/src/notifications.ts (new)
export type NotificationKind = 'cascade_update' | 'sales_agent' | 'listing_agent';
export type NotificationSeverity = 'info' | 'warning' | 'success';
export interface Notification {
  id: string; sellerId: string; kind: NotificationKind; severity: NotificationSeverity;
  title: string; body: string; returnId?: string; listingId?: string;
  read: boolean; createdAt: string;
}

// packages/shared/src/pricing-engine.ts
export interface ReturnRecordInput { /* ...existing */ sellerId?: string; }

// packages/shared/src/notifications.ts (Phase 4 addition)
export interface NotificationPreferences {
  sellerId: string;
  mutedKinds: NotificationKind[];
  quietHoursStart?: number; // 0-23
  quietHoursEnd?: number; // 0-23
}

// packages/shared/src/pricing/types.ts (Phase 8 addition)
export type ContextBucket = {
  category: string;
  gradeKey: string;
  regionCluster?: string;
};
```

## UI / behavior

- **Geo-demand wiring** is invisible by design where it should be: existing
  screens show the same numbers, just real instead of flat. It's visible only
  in that `geoDemandIndex` now varies by return locality/category, and the
  Sales Agent's `relist` lever depends on it.
- **Notification bell**: every seller-dashboard page shows an unread-count
  badge; opening it lists notifications newest-first with a severity dot,
  click-to-read, and "Clear all." Polls every ~25s. Degrades to an empty,
  never-crashing inbox when Mongo/the API is unavailable.
- **Sales Agent page** (`/seller/sales-agent`): a "Run Sales Agent" button
  reviews every listing the signed-in seller owns, in one on-demand pass —
  reprices, widens reach, escalates, or (for an escalated return-sourced
  listing whose real geo-demand has since improved past a 1.15× margin over
  its value at escalation time) relists it. Shows a digest (counts by action
  type) and a per-listing reasoning breakdown; every acted-on listing also
  posts one bell notification.
- **Notification preferences**: a "Preferences" toggle inside the bell
  dropdown lets a seller mute an entire kind (buyer-matching updates, Sales
  Agent runs, Listing Agent escalations) or set quiet hours during which
  routine (`info`-severity) notifications are suppressed — a real buyer
  match, escalation, or warehouse-fallback always still comes through.

## Acceptance criteria

1. `pnpm -r typecheck` passes (shared, api, web) — verified after each phase.
2. `POST /api/pricing/decide` with a real `returnId` that has Mongo buyer/
   demand-index data for its zone+category returns geo values visibly
   different from the `5`/`3`/`0.5` defaults; falls back to those exact
   defaults when Mongo is unconfigured or the lookup misses.
3. Running the Sales Agent against a portfolio with ≥1 escalated
   (donate/recycle) return-sourced listing and ≥1 healthy listing produces a
   non-zero `actionsByType` digest, and each acted-on listing yields exactly
   one row in `GET /api/notifications/:sellerId`.
4. Letting a match session time out (`matchingCascade.ts`) or expire to
   `warehouse_fallback` produces a bell notification for the return's
   `seller_id` within one cascade tick; buyer-facing `sendNotification()`
   behavior is unchanged.
5. With Mongo unconfigured, every new code path degrades exactly like
   existing `isMongoConfigured()` guards elsewhere — no crashes.
6. `getSeasonalityIndex(category, at)` is a pure function (same inputs →
   same output, no Mongo call) — verified by direct invocation for a fixed
   date across every category bucket.
7. `POST /api/listings/:listingId/events` always returns `200 {ok:true}`
   regardless of Mongo state — verified live; a shop-page visit and a Rufus
   question each produce one `view`/`message` row when Mongo is configured.
8. Muting a kind or setting quiet hours (verified live via `GET`/`PUT
   /api/notifications/:sellerId/preferences`) actually suppresses matching
   `info`-severity notifications on the next `createNotification()` call,
   while `warning`/`success` notifications for that seller are unaffected.
9. With no LLM configured (`MOCK_MODE`/no NVIDIA key), notification bodies
   are byte-identical to their deterministic input — `narrateNotification()`
   short-circuits before ever building a prompt.
10. Opening a listing's detail page and starting auto-run makes
    `isManuallyLocked(id)` true for as long as auto-run is active, and false
    immediately after stopping/navigating away; a scheduled Sales Agent pass
    run concurrently must skip that listing (`listingsReviewed` excludes it).
11. `runSalesAgentIfDue()` is a no-op (returns `null`, touches no listing)
    when called before `DEFAULT_SCHEDULE_INTERVAL_MS` has elapsed since the
    last run (manual or scheduled); a manual "Run Sales Agent" click resets
    that clock via `markRunNow()`.
12. A buyer with `user_id` set who gets `notifyBuyer()`'d produces one row
    in `GET /api/notifications/:buyerUserId`; a buyer with `user_id: null`
    produces only the existing log line, no notification row, no error.
13. The bell renders identically (visually) in `AppNav` (light,
    Amazon-native `/app/*` theme) and `seller/layout.tsx` (dark `/seller/*`
    dashboard) — same component, same design tokens, no theme-specific fork.
14. `POST /api/pricing/outcome` persists one `pricing_transactions` row per
    call when Mongo is configured, with zero change to that endpoint's
    response shape or latency-sensitive path (the write is fire-and-forget).
15. `pnpm --filter api export:pricing-transactions` (verified live) exits 1
    with a clear message when Mongo is unconfigured or empty, and — with real
    rows present — appends valid JSONL that `TransactionLogger.read()` can
    parse without error.
16. Two decisions for the same (category, gradeKey) but different resolved
    `regionCluster` values pool into different bandit buckets
    (`RepriceBandit.snapshot()` returns distinct `armObservations` for each);
    two decisions with no resolvable region (no pincode/returnId) still pool
    together at the coarser `category|gradeKey` key — verified live (the
    `test_listing_phase8` smoke call above, with no pincode, produced the
    same bucket shape as pre-phase-8 behavior).

## Resolved decisions

1. **Sales Agent is a batch driver, not a new brain** — it calls the same
   `ensureAgent()`/`tick()` a seller already triggers manually; it never
   calls the bandit/reprice-engine directly.
2. **On-demand only in Phase 1** — a second autonomous timer would race each
   listing's own heartbeat cadence for no proven benefit; scheduled runs are
   Phase 5.
3. **`relist` is the only new `AgentAction`** — `notify` is deliberately not
   a lever; notifying is a side-effect of a decision, kept orthogonal.
4. **Notifications are seller-only in Phase 1** — buyers have no persistent
   dashboard yet (Phase 6).
5. **No LLM in the notification system yet** — deterministic bodies only
   (Phase 4).
6. **`ReturnRecordDoc.seller_id` and the `notifications` collection are both
   new, additive** — no existing required shape changes; nothing already
   working regresses.
7. **`geoDemandIndex` kept in its native `demand_index` scale** (clamped
   [0.7, 1.3], centered on 1.0) rather than rescaled to the old flat-0.5
   placeholder's implied 0–1 range — it's the real infrastructure's native
   unit, and the existing offline retrain/promotion loop (unchanged) is what
   lets the model re-learn against the new distribution over time.
8. **Literal UI-theme-toggle agent capability**: raised in chat, confirmed
   not a real requirement — dropped.
9. **Seasonality needs no database** — unlike geo-demand, real Indian retail
   seasonality (Diwali, wedding season, back-to-school) is stable enough to
   encode as a static calendar table; it's a pure function on both the TS and
   Python sides, so it's real even when Mongo is unconfigured.
10. **Engagement aggregation is live, not batch** — a single listing's event
    count is cheap enough to aggregate per-request; unlike `demand_index`
    (which rolls up the whole catalogue and needs an hourly cron), no
    precomputed table is needed here.
11. **`save`/`cart_abandon` stay honest placeholders** — no wishlist or cart
    feature exists anywhere in the app to attach a real signal to; faking one
    would be exactly the kind of "faked output" the project's own philosophy
    rejects (see spec 008/agent-work.md: "real logic over mock inputs is
    honest; faked output is the thing we avoided").
12. **No Python mirror for engagement** — unlike geo/seasonality,
    `view_velocity_24h`'s random draw in `simulate_marketplace.py` isn't a
    broken placeholder standing in for a real signal the live side now has;
    it's a legitimate simulated-traffic assumption with no production log to
    mirror yet (that bridge is Phase 7).
13. **Notification narration reuses the reprice engine's LLM completer** —
    one `configureNotificationNarration(narrator)` call at boot, not a second
    NVIDIA client wired independently; consistent with spec 022's "single
    NVIDIA client seam" consolidation.
14. **Quiet hours only suppress `info` severity** — `warning` (something
    genuinely needs attention, e.g. a warehouse fallback) and `success` (a
    win worth seeing promptly) always come through; muting is the blunt
    instrument for "I don't want this kind at all," quiet hours the softer
    one for "not right now, but don't hide anything important."
15. **Preferences are a separate collection, not fields on `NotificationDoc`**
    — one doc per seller (`NOTIFICATION_PREFS`), read once per
    `createNotification()` call; keeps the notification insert path and the
    (rarely-written) preference document independently indexed.
16. **The manual-control lock is in-memory, not persisted** — it only needs
    to outlive the page actively driving a listing's clock; persisting it
    would risk a stale lock surviving a crashed tab and permanently hiding a
    listing from the Sales Agent.
17. **Scheduled runs stay client/localStorage-scoped, same as Phase 1** — a
    real production cadence would be a server-side cron (like
    `computeDemandIndex.ts`'s hourly job), but the whole Sales Agent
    architecture is deliberately browser-side (Phase 1 decision #1); Phase 5
    makes the existing on-demand path safe to also trigger periodically, not
    a rearchitecture into a server job.
18. **A manual run resets the scheduled clock** — clicking "Run Sales Agent"
    while scheduling is on calls `markRunNow()` too, so the 30s scheduled
    poll doesn't immediately re-run the portfolio a few seconds later.
19. **`NotificationDoc.seller_id` is reused as a general recipient account
    id, not renamed** — it already held any string identity (seller or,
    since Phase 6, a buyer's `user_id`); renaming the field across every
    Phase 1–5 call site for cosmetic accuracy wasn't worth the diff. Documented
    here so the overload is a decision, not a discovered inconsistency.
20. **Synthetic (accountless) buyers are explicitly not a gap to close** —
    most seeded buyers (`scripts/seedBuyers.ts`) have no platform account by
    design (they represent the addressable local-buyer population, not
    logged-in users); only a `user_id`-linked buyer has anywhere to show a
    notification, so only that population gets one.
21. **The export is a manual/periodic script, not automated** — matches
    spec 014's own "honest split" (the API can't retrain XGBoost itself;
    `pricing.retrain_due` is a signal for an offline job to pick up). Running
    `export:pricing-transactions` before a retrain is an operational step, not
    something this phase wires into a cron — automating that hand-off is a
    natural follow-up, not built here.
22. **Best-effort field mapping is documented, not silently approximate** —
    `original_price` is reverse-derived via `Math.expm1(originalPriceLog)`,
    and `is_first_listing` is inferred from `numReprices === 0`; both are
    named in the script's own header comment so a future reader finds an
    intentional trade-off, not a bug to chase.
23. **`pricing_transactions` stores the full `PricingStateVector`, not a
    bucket** — unlike `LastDecision`'s pre-phase-7 shape (bucket + price +
    decisionId + arm only), the export needs every feature the decision
    actually used, not just its `(category, gradeKey)` bucket.
24. **`regionCluster` is request metadata, kept out of `fillState()`** —
    it's a bandit-bucketing key, not a trained feature; `PricingStateVector`
    itself is unchanged in phase 8, only `ContextBucket` gained the field.
25. **Fallback-to-coarser-pool, not a hard requirement** — a decision with no
    resolvable region (no pincode/returnId, or Mongo unconfigured) still
    prices correctly; it just pools at the pre-phase-8 `category|gradeKey`
    granularity instead of fragmenting into a data-starved region-specific
    bucket. Same falling-back discipline as phases A and 2's placeholder
    safety nets.
26. **The Python marketplace simulator doesn't assign synthetic regions** —
    `agent.py`'s `bucket_key()` is wired to use `region_cluster` when a
    caller's state provides one, but `simulate_marketplace.py` doesn't
    invent one (there's no real analogue to mirror, unlike geo-demand's
    `CATEGORY_BIAS` or seasonality's calendar). Documented as an honest,
    bounded gap rather than a partially-faked simulation.

---

All 8 buildable phases of this spec are now built (Phase 9 remains explicitly
out of scope, per the original chat decision). Future work beyond this spec
— e.g. deeper analytics, additional agent types, real delivery channels —
should get its own spec rather than growing this one further.
