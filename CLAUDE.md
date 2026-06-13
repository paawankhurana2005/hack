# ReLoop — Project Guide for Claude Code

## What we're building
ReLoop is an AI layer that gives returned, unused, or outgrown products a
second life — instead of being hauled back to a warehouse or written off.
Built for the Amazon hackathon. Customer-obsessed, one-stop, Amazon-native.

### Two user-side functionalities
1. **SELL (user-initiated):** A user has an item with life left in it. AI grades
   it, sets a fair price, generates a trust card, matches it to a nearby buyer,
   and Amazon handles the handoff. The item never touches a warehouse.
2. **RETURN (Amazon-decided):** A user returns an item. The AI grades it AT THE
   DOORSTEP, *before it moves*. Then the "Intelligent Bridge" decides the best
   next path — local resale / refurbish / donate / recycle / warehouse — based on
   value vs. local handling cost vs. nearby demand vs. carbon.
   **Core innovation: grade at the source, decide before the item moves.**

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
Scaffolding only. NO real functionality yet — no AI, no backend logic, no real
data. Frontend uses placeholder screens and mock data. We add features in later
spec-gated iterations.