# ReLoop

An AI layer that gives returned, unused, or outgrown products a second life —
instead of being hauled back to a warehouse or written off. Built for the Amazon
hackathon.

## Monorepo layout

```
apps/web        Next.js (App Router) + TS + Tailwind — the user app + seller dashboard
apps/api        Node + Express + TS — API skeleton (currently GET /health only)
packages/shared TypeScript data contracts (GradingResult, RoutingDecision, ProductHealthCard)
specs/          Spec-first iteration docs (build is gated on approved specs)
```

## Getting started

```bash
pnpm install

# web app (http://localhost:3000)
pnpm dev:web

# api skeleton (http://localhost:4000)
pnpm dev:api
```

## Current status

**Scaffold only (Spec 001).** Every screen is a placeholder — no AI, no backend
logic, no real data. Features land in later spec-gated iterations. See
`specs/001-scaffold.md`.
