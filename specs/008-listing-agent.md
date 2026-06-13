# Spec 008 — The Listing Agent (autonomous reprice / re-route, glass-box)

## Goal
A single, fully-realized **autonomous agent** for the sell-listing flow. When a
listing stalls it doesn't just discount on a timer — it **perceives** the
listing's state, **diagnoses** *why* it isn't moving, **chooses the right lever**
(reprice / widen reach / improve listing / escalate to a different route),
**acts** inside hard deterministic guardrails, and **logs every step with
plain-language reasoning** to a live activity feed. Price is only one of its
tools. Autonomy bounded by glass-box rails: it is free to act but provably cannot
sell below the floor.

## Core principle
**Logic decides, the LLM narrates.** The decision comes from transparent
deterministic rules over `{day, views, demand, price-vs-comps, floor,
holding-cost}`. The LLM only phrases the feed line, with a deterministic template
fallback so it never goes blank on stage. Same shape as `routes/route.ts`.

## Scope
**In scope**
- Deterministic decision engine in `packages/shared` (`decideAgentAction`), plus a
  deterministic market simulator (`simulateViews`) and per-listing seed context.
- Client-side orchestration: a simulated per-listing clock, price history, an
  append-only activity feed, manual price override (pauses agent), accept-route.
- New listing detail page with price-history chart (floor rail), live feed, clock
  controls, manual edit, recycle recommendation banner.
- Two demo listings with baked market context: the existing Pegasus (happy
  reprice→sell arc) and a NEW worn-running-shoes listing (reprice→floor→widen→
  **recycle** arc).
- LLM narration endpoint `POST /api/agent/narrate` with deterministic fallback.
- Accepting Recycle awards materials-recovery EcoCredits + CO₂ into the existing
  Rewards ledger.

**Out of scope**
- Any return-side agent or multi-agent orchestration. One agent, sell-listing only.
- Real market data, real scheduling/cron, real money. The clock is simulated.

## Architecture
```
packages/shared/src/agent.ts   ← THE BRAIN (pure, deterministic, testable)
  decideAgentAction(snapshot) → AgentDecision   (the rules cascade)
  simulateDailyViews(...)                         (deterministic market sim)

apps/web/src/lib/agent-store.ts  ← ORCHESTRATION (localStorage, runs in browser)
  per-listing { day, priceHistory[], events[], radiusKm, paused, status }
  tick(id) → run engine, apply action, append feed, update price+history
  setManualPrice / togglePause / reset / acceptRoute

apps/web/src/app/app/listings/[listingId]/page.tsx  ← THE SURFACE
  price-history chart w/ floor rail · live feed · clock · manual edit · recycle banner

apps/api/src/services/agent + routes/agent.ts  ← NARRATION ONLY (LLM + fallback)
  POST /api/agent/narrate → nvidiaChat(cfg) → 1 sentence; template fallback
```
The engine lives in `packages/shared` so it is the single source of truth,
unit-testable, and runs client-side — the whole demo executes in the browser with
zero network dependency. The only network hop is optional nicer narration, which
degrades to a template.

## Data contracts (packages/shared)
- `agent.ts` (new): `AgentAction`, `AgentPhase`, `RouteRecommendation`,
  `MarketContext`, `AgentSnapshot`, `AgentFactor`, `AgentDecision`, `AgentEvent`,
  `decideAgentAction(snapshot): AgentDecision`, `simulateDailyViews(...)`,
  `RADIUS_LADDER`, `maxRadiusKm()`.
- `impact.ts`: add `estimateRouteImpact(category, route)` for recycle/donate.
- `index.ts`: export `./agent.js`.

## The levers
| Action | Fires when | Effect |
|---|---|---|
| `hold` | day 0, or competitively priced and waiting | log "watching" |
| `reprice` | price >5% above comp, no offers, price>floor | step ~50% toward comp, capped 15%/tick, **clamped to floor** |
| `widen_radius` | price competitive / at floor, demand not high, radius<max | expand 4km → 25km |
| `improve_listing` | many views, 0 offers, not already improved | one-shot suggestion |
| `escalate_route` | at floor, demand low, radius maxed, no offers | recommend `recycle` (poor/no value) or `donate` |

`reprice` mathematically cannot cross the floor. At the floor the agent switches
levers (widen → escalate) instead of breaking the rail.

## Demo arcs (deterministic, identical every run)
- **Pegasus (`shop_pegasus`)** — retail ₹9,999, list ₹3,999, comp ₹3,500, floor
  ₹3,000, demand medium. Reprices ₹3,999→₹3,750→₹3,650, widens reach, suggests a
  listing improvement, then holds "competitively priced." Sells via Shop purchase.
- **Worn running shoes (`lst_worn_runners`, NEW)** — retail ₹4,500, list ₹1,800,
  comp ₹1,000 (below floor — market wants less than we can afford), floor ₹1,100,
  demand low, grade poor. Reprices down to the floor over ~4 days, widens reach
  once (no help), then **escalates to Recycle** with materials-recovery impact.

## UI / behavior
- `/app/listings/[listingId]`: header (image, price, status, agent chip),
  price-history step chart with dashed floor rail, agent panel (Advance 1 day /
  Auto-run / Reset, current diagnosis, live timeline feed), manual price edit
  (within floor..retail, pauses agent), recycle banner with Accept / Keep trying.
- My Listings cards: mini price-trend sparkline + agent-status chip, link into
  detail.
- Accepting Recycle: status → `recycled`, awards EcoCredits (`estimateRouteImpact`)
  into the credits ledger, shows CO₂ avoided.

## Acceptance criteria
- Engine is pure/deterministic; both demo arcs reproduce identically from day 0.
- `reprice` never returns a price below the floor (asserted).
- The recycle listing reaches `escalate_route` → `recycle` after reprice + widen.
- Feed shows perceived → diagnosed → acted with real numbers; LLM narrates the
  acted line, falls back to a template offline.
- Manual edit pauses the agent and logs an override entry; Resume re-engages.
- `tsc` + `next build` green.

## Resolved decisions
- Recycle demo item: worn running shoes (grade poor).
- Manual override pauses the agent and logs it; Resume re-engages.
- Narration: LLM with deterministic fallback.
- Accepting Recycle awards materials-recovery EcoCredits + CO₂ into Rewards.
