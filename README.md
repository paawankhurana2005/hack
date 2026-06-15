# ReLoop

**An AI layer that gives returned, unused, and outgrown products a second life —
instead of hauling them back to a warehouse or writing them off.**

When something is returned today, it usually ships hundreds of kilometres back to
a fulfilment centre before anyone decides what to do with it — burning freight,
carbon, and most of the item's residual value along the way. ReLoop flips that:
it **grades the item at the source and decides before it moves.**

> **Core idea:** *Grade at the doorstep. Decide before the item travels.*

---

## What it does

ReLoop has two flows for the customer and one dashboard for sellers.

### 1. Sell (customer-initiated)
A customer has an item with life left in it. The AI grades it from photos, sets a
fair resale price, generates a trust card, and an autonomous agent works to get it
sold to a nearby buyer. **The item never touches a warehouse.**

### 2. Return (platform-decided)
A customer returns an item. The AI grades it **at the doorstep, before it moves.**
A deterministic decision engine — the **Intelligent Bridge** — then picks the best
next path for that specific item: local resale, refurbish, donate, recycle, return
to seller, or (only as a last resort) warehouse. The decision weighs residual
value against local handling cost, nearby demand, and carbon.

### 3. Seller dashboard
For sellers handling returns at volume — triage, rescue, exchange, spare-parts
recovery, and insights.

---

## The guiding principle: *logic decides, the model narrates*

Every decision in ReLoop is made by **deterministic, glass-box code** — plain
arithmetic and ordered rules you can read and audit. A large language model is used
for exactly two things:

1. **Perception** — assessing condition from photos (the one genuinely fuzzy task).
2. **Narration** — phrasing a one-sentence, human explanation of a decision the
   rules already made.

Every model call has a deterministic fallback, so no screen can ever fail because
an inference call did — the numbers on screen are always reproducible and explainable.

---

## The four pillars

| Pillar | Role | Where it lives |
| --- | --- | --- |
| **AI Grading** | "the eyes" — multimodal condition assessment from photos | `apps/api/src/services/grading/` |
| **Smart Routing / Intelligent Bridge** | "the brain" — a deterministic decision over `{value, local cost, demand, carbon}` | `apps/api/src/lib/routing-engine.ts` |
| **Product Health Card** | "the trust layer" — verifiable condition, history, and authenticity that travel *with the item* | `packages/shared/src/provenance.ts`, `apps/api/src/services/health-card/` |
| **Prevention** | predict the return *before it happens* and nudge to a safer variant | `apps/web/src/lib/prevention.ts` |

**AI Grading** grades each photo with a hosted vision model, then aggregates
deterministically: the overall grade is bounded by the *most-worn angle*, and
detected issues are the de-duplicated union across all angles — so more photos
catch more flaws. It can also diff the photos against the original listing to
produce an authenticity signal.

**Smart Routing** runs an ordered, first-match-wins rules engine. The Health Card
is **provenance that follows the physical item, not the listing** — an item is
"born" at first sale and accumulates an append-only chain of verified events
(`origin → owned → graded → listed → price_adjusted → sold → routed`) across every
owner. A re-grade *appends*; it never overwrites history.

---

## Two more headline features

- **Hyperlocal peer-to-peer lending** (`apps/web/src/lib/mesh.ts`) — activates the
  dormant inventory already sitting in people's homes. Instead of a "temporary
  need" purchase becoming a return, a nearby neighbour borrows the thing that's
  already there. The owner earns passive income, the borrower pays a fraction of
  buying new, the platform takes a fee — a return loop eliminated with zero new
  inventory. The rate/fee/savings math is pure, reproducible arithmetic.

- **The autonomous Listing Agent** (`packages/shared/src/agent.ts`) — a pure
  decision engine that watches a listing day by day and picks one lever to get it
  sold: `hold`, `reprice` (clamped to a price floor it cannot cross),
  `widen_radius` (4 km → 25 km), `improve_listing`, or `escalate_route`
  (donate / recycle when resale is exhausted). The user can override the price,
  pause it, or accept its routing recommendation.

---

## Tech stack

A **pnpm-workspaces monorepo**, strict TypeScript throughout (no `any`).

```
apps/web         Next.js (App Router) + TypeScript + Tailwind — the customer app + seller dashboard
apps/api         Node + Express + TypeScript — AI-backed endpoints (grading, pricing, narration)
packages/shared  @reloop/shared — the single source of truth for every data contract
specs/           Spec-per-iteration build log (001–013)
```

- **`@reloop/shared`** holds all data contracts *and* the pure decision engines
  (routing, the listing agent, provenance roll-ups), so the exact same logic runs
  identically on client and server. It ships as raw TS source — the API runs it via
  `tsx`, with no separate build step.
- AI inference uses NVIDIA-hosted models (OpenAI-compatible API):
  `meta/llama-3.2-90b-vision-instruct` for grading, `meta/llama-3.3-70b-instruct`
  for pricing and narration.

### Design language
Dark navy surfaces (`#232F3E` family) with orange accents (`#FF9900` / `#EC7211`).
Clean, confident, minimal — design tokens defined once and reused.

---

## Getting started

```bash
pnpm install

# customer app + seller dashboard → http://localhost:3000
pnpm dev:web

# API → http://localhost:4000
pnpm dev:api
```

### Configuration

The API needs an NVIDIA inference key. Copy the examples and fill them in:

```bash
cp apps/api/.env.example apps/api/.env          # add NVIDIA_API_KEY
cp apps/web/.env.local.example apps/web/.env.local
```

`.env` files are gitignored — **never commit a real key.** The API validates its
config on boot and exits with a clear message if `NVIDIA_API_KEY` is missing.

| Variable | Where | Purpose |
| --- | --- | --- |
| `NVIDIA_API_KEY` | API | Inference key (required) |
| `GRADING_MODEL` / `PRICING_MODEL` | API | Model overrides (sensible defaults) |
| `WEB_ORIGIN` | API | Allowed CORS origin |
| `NEXT_PUBLIC_API_BASE_URL` | Web | The API's URL (baked in at build time) |

---

## API surface

| Method & path | Does |
| --- | --- |
| `GET /health` | Liveness + whether the server is in mock mode |
| `POST /api/sell/grade` | Real multimodal grading of 1–4 photos |
| `POST /api/sell/price` | Condition-and-demand-based resale price |
| `POST /api/sell/health-card` | Assembles the Product Health Card |
| `POST /api/agent/narrate` | One-sentence narration of a listing-agent action |
| `POST /api/rufus/*` | Health-Card-grounded shopping-assistant answers |

---

## Project layout

```
apps/
  web/
    src/app/        Routes: /app/* (Store, Shop, Lending, My Items, My Listings, Rewards),
                    /sell/*, /return/*, /seller/*
    src/lib/        Glass-box engines + per-user localStorage "stores"
                    (credits, sales, provenance, agent state, bookings)
    src/mock/       Mock catalogs and seed data
  api/
    src/routes/     Express route handlers (thin: validate → call service → respond)
    src/services/   Grading, pricing, health-card, narration, shopping-assistant
    src/lib/        Routing engine, NVIDIA client, env/config
packages/
  shared/src/       Data contracts + pure decision engines (the single source of truth)
specs/              001–013 — one doc per iteration (goal, scope, contracts, acceptance)
```

---

## Workflow

Built in spec-gated iterations. Each iteration is aligned in chat, then recorded in
`specs/NNN-short-name.md` as a living document (goal, scope, affected files, data
contracts, UI/behaviour, acceptance criteria, resolved decisions). The spec
documents the build — it doesn't block it.

### Before pushing to `main` (keeps deploys green)

1. `pnpm -r typecheck` — must pass (every package is strict, no `any`).
2. `pnpm --filter @reloop/web build` — with the dev server **stopped** (a prod
   build shares `apps/web/.next`; clear stale chunks with `rm -rf apps/web/.next`).
3. If any `package.json` deps changed, run `pnpm install` and commit
   `pnpm-lock.yaml` — CI installs with `--frozen-lockfile`.
4. Keep the API runnable as raw TS (`start:prod` via `tsx`), since `@reloop/shared`
   ships as TS source.
5. Don't commit secrets.

---

## Deployment

| Surface | Host | Notes |
| --- | --- | --- |
| Web | Vercel | Root directory `apps/web`, Next defaults |
| API | Render | Express via `tsx` (`start:prod`), from `render.yaml` |

Both auto-deploy from `main`. The two are wired by env vars: the web bundle bakes
in the API URL at build time, and the API allows the web origin via CORS — so if
either URL changes, update the other side and redeploy web.

---

## Credits

Demo product imagery under `apps/web/public/` is used for illustration only.

> Built for a hackathon. ReLoop is a working prototype: grading and pricing are
> real model calls; the surrounding catalog, demand, and marketplace state are
> deterministic mock data dressed as live state, so the experience is reproducible
> end to end.
