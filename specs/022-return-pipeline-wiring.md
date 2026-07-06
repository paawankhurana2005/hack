# 022 — Return Pipeline frontend↔backend wiring, reasoning-everywhere, logging & Langfuse

## Goal

Specs 016/021 built a real Return Pipeline engine — doorstep grading, the
Intelligent Bridge EV router, checkpoint re-evaluation, Health Card generation,
local buyer matching, dynamic repricing, and a Listing Agent — but the buyer-
and seller-facing frontend never calls most of it. Grading and routing in the
live buyer flow run on `setTimeout`-based mock tables; seller approval flips
local state and fire-and-forget POSTs a record without ever calling the
fully-built buyer-matching endpoint. There is also no LLM/agent observability
of any kind, and structured logging is inconsistently applied.

This spec connects every already-built backend capability to the frontend, so
the return flow is real end-to-end instead of mock-timer theater, makes the
"why" behind every AI/engine decision visible to the seller (a stated business
requirement per spec 016 — seller disputes and ESG audits need a replayable
reason), standardizes structured logging in prep for a future EC2 deployment,
and wires Langfuse tracing around every LLM call so the full pipeline's model
usage is observable.

## Scope

**In scope**
- Buyer return flow: real `/api/grade` + `/api/route` + `/api/health-card`
  calls replacing `mockGradeItem`/`mockRouteItem`, with graceful fallback to
  mock on failure.
- Reasoning-display UI ported from the orphaned, more feature-complete
  `Step2Grading.tsx`/`Step3Bridge.tsx` into the live `BuyerStep1/2Pickup/3Done`
  components; deletion of the 5 orphaned files once ported.
- Seller approval (`handleApprove()`) wired to the real, blocking
  `POST /api/matching/initiate/:returnId` as the primary approve action,
  alongside the existing `upsertReturnRecord`.
- Hub Bench checkpoint re-evaluation routed through `POST /api/return/checkpoint`
  instead of a direct client-side `decideRoute` import.
- A reasoning-visibility audit across every seller-facing decision surface
  (routing EV breakdown, Health Card fields, agent diagnosis, pricing
  guardrails).
- Structured logging standardization: all `apps/api` request-path code goes
  through the shared `log()` helper with `reqId` correlation; documented
  exceptions for startup-time and CLI-script logging.
- NVIDIA client seam consolidation: two duplicate wrappers become one.
- Langfuse tracing around every LLM call site, no-op when credentials are unset.

**Out of scope**
- The Sell/Trade-in flow (`apps/web/src/app/sell/**`, `sell-flow-context.tsx`,
  `apps/web/src/app/app/sell/[itemId]/**`, `/api/sell/*` routes) — dead per the
  pivot to Return-only. Touched only incidentally where a shared seam (NVIDIA
  client, logger) changes underneath it, with no behavior regression.
- New ML models or new routing/pricing economics — spec 021's engine is frozen
  here; this is a wiring/observability pass, not an economics change.
- Actual Langfuse account provisioning — the integration must work safely with
  no keys set; a real account is a user-side follow-up.
- A dedicated HTTP surface for per-lot liquidation reasoning
  (`LotValue`/`ShipVerdict.reason`) — the decision-level "why" for `liquidate`
  already reaches the seller via `ReturnRoutingDecision.reasoning`; a raw
  per-pallet ledger view is new scope, not built here.

## Affected files

- `apps/web/src/lib/api-client.ts` — new typed functions for every
  Return-Pipeline endpoint without a caller today.
- `packages/shared/src/return.ts` — new discriminated-union response types.
- `apps/web/src/components/return/BuyerStep1.tsx`, `BuyerStep2Pickup.tsx`,
  `BuyerStep3Done.tsx` — real API wiring + ported reasoning UI.
- `apps/web/src/components/return/Step1Reason.tsx`, `Step2Grading.tsx`,
  `Step3Bridge.tsx`, `Step4Handoff.tsx`, `Step5Done.tsx` — deleted (orphaned,
  zero importers, superseded by the above).
- `apps/web/src/lib/mocks/return-store.ts` — `SubmittedReturn` gains an
  optional `healthCard` field.
- `apps/web/src/app/seller/returns/[returnId]/SellerReturnDetail.tsx` — real,
  sequenced, error-surfaced `handleApprove()`; richer reasoning display.
- `apps/web/src/app/seller/hub/page.tsx` — checkpoint calls routed through the
  real API; Health Card regeneration at bench-verification time.
- `apps/web/src/components/agent/activity-feed.tsx` — verify diagnosis+factors
  render alongside narration.
- `apps/web/src/app/seller/rescue/[returnId]/page.tsx` — surface
  `reasonCode`/`guardrailsApplied`/`floor`/`ceiling`.
- `apps/api/src/routes/route.ts`, `routes/grade.ts`, `routes/health-card.ts` —
  migrated onto the single NVIDIA client seam; checkpoint handler unchanged in
  behavior.
- `apps/api/src/lib/nvidia-client.ts` — deleted after migration.
- `apps/api/src/services/nvidia/client.ts` — gains optional `traceMeta` on
  `ChatRequest`; single Langfuse wrap point.
- `apps/api/src/lib/logger.ts` — unchanged (already the target seam); consumers
  swept to use it consistently.
- `apps/api/src/lib/langfuse.ts` — new, mirrors `lib/mongo.ts`'s
  configured-or-no-op shape. `traceModelCall()` wraps the single `nvidiaChat`
  seam; `isLangfuseConfigured()` gates it.
- `apps/api/src/config.ts` — new optional `LANGFUSE_PUBLIC_KEY`/
  `LANGFUSE_SECRET_KEY`/`LANGFUSE_BASE_URL` env vars.
- `apps/api/package.json` — added `langfuse` (official Node SDK).
- `apps/api/.env.example` — documents the three new optional vars.
- `packages/shared/src/agent.ts` — `AgentEvent` gains optional `factors` so
  the deterministic diagnosis breakdown (not just its one-line text) reaches
  the activity feed.
- `apps/api/src/routes/sell.ts`, `routes/auth.ts`, `routes/pricing.ts`,
  `routes/state.ts`, `services/grading/grading-service.ts`,
  `services/matchingEngine.ts`, `services/pricing/reprice-engine.ts` — raw
  `console.*` swept to the shared `log()` helper.

## Data contracts

```ts
// packages/shared/src/return.ts
export type ReturnGradeResponse = ReturnGradingResult | { fallback: true; decision: 'warehouse' };
export type ReturnRouteResponse = ReturnRoutingDecision | { fallback: true; decision: 'warehouse' };
```
No other new shared types — every reasoning field this spec surfaces
(`evBreakdown`, `gateReason`, `ReturnHealthCard`, `AgentDecision.diagnosis`,
`PricingDecision.reason`/`reasonCode`/`guardrailsApplied`) already exists in
`packages/shared`; the gap is display, not schema.

## UI / behavior

- Buyer return flow (`/return/[orderId]`): photo capture → real doorstep
  grading (confidence, defects, authenticity, wardrobing) → real Intelligent
  Bridge routing with a glass-box EV table (`evBreakdown.paths`, including
  `gateReason` for non-viable paths) → real Health Card generation → save.
  Falls back to the existing mock scenarios on API failure so a demo never
  hard-fails.
- Seller return detail: approval is a real, awaited, sequenced action
  (`upsertReturnRecord` → `initiateMatching`) with a visible candidate-count
  success state and a real error/retry state on failure — never a silent
  false-success.
- Hub Bench: checkpoint re-evaluation goes through `POST /api/return/checkpoint`;
  the resulting decision/reasoning is unchanged in substance (same engine) but
  now logged server-side with a `reqId`.
- Every decision surface (buyer routing screen, seller return detail, hub
  bench, agent activity feed, rescue pricing tab) shows a human-readable
  reason, not just a status or a number.

## Acceptance criteria

1. `pnpm -r typecheck` and `pnpm --filter web build` (dev server stopped) pass
   after every phase.
2. No `BuyerStep*` component calls `lib/mocks/return-flow.ts` except as an
   explicit try/catch fallback; the 5 orphaned components no longer exist.
3. `handleApprove()` has zero silent `.catch(() => {})` swallows and shows a
   real error state on failure.
4. `grep -rn "console\." apps/api/src --include="*.ts"` shows only the two
   documented exception categories (startup validation, CLI scripts).
5. `grep -rn "nvidiaChat(" apps/api/src --include="*.ts"` shows exactly one
   function definition, all call sites passing `(config, req)`.
6. With `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY` unset: zero behavior or
   latency change anywhere. With keys set: traces appear per LLM call, linked
   by `returnId`/`reqId`.
7. Full dev walkthrough (buyer submit with photos → seller approve → hub bench
   → agent activity feed → rescue pricing tab) shows a reason at every screen
   without opening devtools; repeating with the API stopped degrades
   gracefully with no crash.

## Resolved decisions

1. **Dead code**: port the reasoning UI from `Step2Grading`/`Step3Bridge` into
   the live `BuyerStep1/2Pickup/3Done`, then delete all 5 orphaned files.
2. **Langfuse**: wire now, no-op cleanly without keys (mirrors
   `isMongoConfigured()`); real account provisioning deferred to the user.
3. **Seller approval**: `POST /api/matching/initiate/:returnId` becomes the
   real, blocking, primary approve action, sequenced after `upsertReturnRecord`
   (matching depends on the return record existing with a `pincode`).
4. **Phasing**: one living spec (this doc), sequenced into independently
   buildable/reviewable phases A–H.
5. **Hub Bench checkpoint routing**: deferred, staying client-side.
   `checkpointHandler` → `computeRouting` → `getPricing(sku)`
   (`apps/api/src/lib/routing-engine.ts`) derives `clearingPriceCents`/
   `nearbyBuyers`/`radiusKm` from a hardcoded SKU-prefix table (e.g. every
   `B09*` SKU gets a flat ₹2,499 residual value), while the Hub Bench page's
   client-side preview (`seller/hub/page.tsx`) derives `clearingPriceCents`
   from the item's real price (`priceCents * 0.6`) and inherits
   `nearbyBuyers`/`radiusKm` from the prior doorstep decision. These are not
   the same inputs — switching to the API would silently change EV numbers
   and possibly the routed decision at a live demo checkpoint, which is an
   economics change, not a wiring change, and out of scope here. The tracing
   gap (hub-bench checkpoints aren't server-logged/traced) is accepted for
   now; revisit once the routing engine takes real pricing as an input on
   both sides instead of a SKU-prefix mock.
6. **`sellerType` in the buyer flow**: hardcoded to `'1P'` at the routing call
   site (the demo's mock order catalog is 1P-only); documented as intentional,
   not an oversight.
7. **`MOCK_MODE`**: confirmed dead under the current config schema
   (`NVIDIA_API_KEY` is required, non-empty, or the process exits at boot) —
   not treated as a working demo toggle in this pass.
8. **Hub-bench Health Card regeneration**: implemented. `birthReturnListing()`
   now calls `/api/health-card` again with the bench-verified grade/evidence
   for the narrative `summary` (falling back to the original hand-built
   template on any failure), while keeping the locally-constructed `history`
   provenance entries (doorstep → driver → bench) that the API doesn't know
   about. Lower risk than the Hub Bench checkpoint-routing question (#5)
   because it only changes narrative text, not any economic input or decision.
9. **Liquidation-lot per-pallet reasoning**: no new HTTP surface built; the
   decision-level reasoning already reaching the seller via
   `ReturnRoutingDecision.reasoning` is considered sufficient for this pass.
