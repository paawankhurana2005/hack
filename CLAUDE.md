# ReLoop — Project Guide for Claude Code

## What we're building
ReLoop is the intelligence layer for Amazon's returns pipeline: grade at the
doorstep, decide the item's best next life BEFORE reverse-logistics costs are
incurred. Built for the Amazon hackathon. Customer-obsessed, one-stop,
Amazon-native. The full product thesis lives in `specs/016-return-pipeline.md`.

### The product (spec 016 — Return Pipeline first)
1. **RETURN (the product):** A user returns an item. The AI grades it AT THE
   DOORSTEP, *before it moves*. The "Intelligent Bridge" — one deterministic EV
   engine — picks the best path: restock / local resale / refurbish / donate /
   recycle / warehouse (standard reverse logistics = the engine's FALLBACK, so
   downside is bounded). The decision is re-checked at physical checkpoints
   (driver scan, local hub bench) while a redirect is still cheap.
   **Core innovation: grade at the source, decide before the item moves.**
   Positioning: Amazon already resells returns at scale (Grade & Resell, Renewed,
   Resale) — but every program grades AFTER the linehaul. We are the missing
   front end. Do NOT pitch ReLoop as a reselling/C2C app.
2. **SELL (shared rails, not a pitch vertical):** the same grading/pricing/
   Health Card rails, user-initiated. Kept in-app; de-emphasized in the pitch.

### Two interfaces
- **User app** — the Sell and Return flows above.
- **Seller dashboard** — for sellers handling returns at volume.

### The four pillars (our feature spine)
- **AI Grading** ("the eyes") — multimodal condition assessment from photos.
- **Smart Routing / Intelligent Bridge** ("the brain") — a deterministic,
  explainable decision engine over {value, local cost, demand, carbon}.
  This is rules-based and glass-box on purpose; the LLM narrates, logic decides.
- **Product Health Card** ("the trust layer") — verifiable condition, history,
  authenticity that travels with the item to its next owner.
- **Prevention** — predict returns before they happen.

Architecture intent (for later phases): ML for perception (grading) and
prediction (demand/returns); rules for the routing decision.

## Tech stack
- Monorepo, pnpm workspaces.
- `apps/web` — Next.js (App Router) + TypeScript + Tailwind.
- `apps/api` — Node + Express + TypeScript.
- `packages/shared` — shared TypeScript types = the single source of truth for
  all data contracts (e.g. GradingResult, RoutingDecision, ProductHealthCard).
- Strict TypeScript. No `any`. Data contracts live in `packages/shared`.

## Design language (make it look Amazon-native from day one)
- Dark navy surfaces (#232F3E family), Amazon orange accents (#FF9900 / #EC7211).
- Clean, confident, minimal. Friendly, not corporate-cold.
- Consistent design tokens — define them once, reuse everywhere.

## Workflow — CHAT-DRIVEN, SPEC AS LIVING DOC
We build in iterations. Approval happens **in chat**, not via a blocking
written-spec gate. The loop:

1. **Align in chat.** Before building, raise scope, decisions, and open questions
   directly in chat. I answer and approve in chat ("approved" / changes). No need
   to write the full spec first and stop — just ask what you need to know.
2. **Spec as documentation.** Still maintain `specs/NNN-short-name.md` as the
   living record of each iteration (kept current for maintenance), using this
   structure:
   - **Goal** — what this iteration delivers and why.
   - **Scope** — explicitly in-scope and out-of-scope.
   - **Affected files** — what gets created/changed.
   - **Data contracts** — any types added/changed in `packages/shared`.
   - **UI / behavior** — screens, routes, states (mock data is fine).
   - **Acceptance criteria** — how we'll know it's done.
   - **Resolved decisions / open questions.**
   Write or update the spec to reflect what we agreed; it documents the build, it
   doesn't block it.
3. **Build** — implement what was approved in chat.
4. If something needs to go beyond what we agreed mid-build, STOP, tell me in
   chat, and get a yes before expanding. Never silently expand scope. Update the
   spec afterward to match what shipped.

## Current phase
Working prototype (specs 001–021 shipped): real grading/pricing model calls,
deterministic glass-box engines (routing EV, listing agent, provenance), mock
catalog/demand state for reproducibility. Current focus: the Return Pipeline as
the single product thesis (spec 016) — engine upgrades, checkpoint lifecycle,
and the all-in-returns pitch. Spec 021 ("016.1") priced the engine honestly
against real Amazon returns economics: liquidation is now a first-class,
Health-Card-manifested hub-pallet path (with a real bulk-lot engine behind
it), the warehouse fallback lost its flat 60%-recovery fiction, refurb prices
defect-level repairs, and a returnless-refund path exists for items where
every route genuinely loses money. See `specs/021-liquidation-returnless.md`.

## Deployment (production)
Live URLs:
- **Web (Vercel):** https://reloop-woad.vercel.app — Next.js app (`apps/web`),
  Root Directory `apps/web`, Next defaults (no custom build/output overrides).
- **API (Render):** https://reloop-api-po73.onrender.com — Express (`apps/api`),
  runs via `tsx` (`start:prod`), built from `render.yaml`. Free tier sleeps after
  ~15 min idle (first request ~50s cold start).

Both auto-deploy from `main` once Git is connected (Render: yes; Vercel: connect
the GitHub app in Project → Settings → Git). The two are wired by env vars:
- Vercel: `NEXT_PUBLIC_API_BASE_URL` = the Render URL (baked in at build time).
- Render: `NVIDIA_API_KEY` (required — the API exits without it) and `WEB_ORIGIN`
  = the Vercel URL (CORS). If either URL changes, update the other side and
  redeploy web (the API URL is compiled into the web bundle).

### Before every push to `main` (so deploys stay green)
1. `pnpm -r typecheck` — must pass (web, api, shared are all strict, no `any`).
2. `pnpm --filter web build` — only with the dev server **stopped** (a prod build
   shares `apps/web/.next` and will break a running `next dev` with a stale-chunk
   "Cannot find module" error; clear with `rm -rf apps/web/.next`).
3. If you changed any `package.json` deps, run `pnpm install` and **commit
   `pnpm-lock.yaml`** — Render/Vercel install with `--frozen-lockfile` and fail on
   a stale lock.
4. Keep the API runnable as raw TS: `@reloop/shared` ships as TS source (no build
   step), so the API must start via `tsx` (`start:prod`), never `node dist`,
   unless you add a bundler. Don't point `shared`'s `main` at a non-existent dist.
5. Don't commit secrets — `apps/api/.env` is gitignored; the real key lives only
   in the Render dashboard.