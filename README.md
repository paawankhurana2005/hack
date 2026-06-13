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

## Configuration

The API needs an NVIDIA inference key. Copy the examples and fill them in:

```bash
cp apps/api/.env.example apps/api/.env        # add NVIDIA_API_KEY
cp apps/web/.env.local.example apps/web/.env.local
```

`.env` files are gitignored — never commit a real key.

## Current status

**Specs 001–004** are built. The Sell flow is live through **entry → grading →
pricing → health card** (real `meta/llama-3.2-90b-vision-instruct` grading +
`meta/llama-3.3-70b-instruct` pricing; the health card is deterministic
assembly). Handoff → done are still placeholders. See `specs/`.

## Credits

Demo product images under `apps/web/public/demo/` are from
[Unsplash](https://unsplash.com) (free to use, no attribution required).
