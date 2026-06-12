# Spec 001 — Project Scaffold

## Goal
Stand up the entire ReLoop monorepo skeleton: a pnpm-workspace monorepo with a
Next.js web app, an Express API skeleton, and a shared types package. Deliver the
**full navigable frontend shell** for both user flows (Sell + Return) and the
Seller dashboard, using **placeholder screens and mock data only**. Establish the
Amazon-native design system (tokens, layout, nav, UI primitives) so every later
feature spec plugs into a consistent shell.

This iteration is the foundation everything else builds on. It must be navigable
end-to-end (you can click through every screen) but contain **zero real
functionality** — no AI, no backend logic, no real data, no persistence.

## Scope

### In scope
- Monorepo tooling: pnpm workspaces, root config, shared TS config, Tailwind.
- `apps/web`: Next.js (App Router) + TypeScript + Tailwind, full route tree with
  placeholder screens for Landing, User home, Sell flow, Return flow, and Seller
  dashboard.
- `apps/api`: minimal Express + TypeScript skeleton — boots, exposes a single
  `GET /health` endpoint, nothing else.
- `packages/shared`: stub data-contract **types only** (`GradingResult`,
  `RoutingDecision`, `ProductHealthCard`) plus a few supporting enums/types. No
  logic, no functions.
- Design system: design tokens (Amazon navy + orange), root layout, top nav /
  app chrome, and a small set of reusable UI primitives.
- Mock data fixtures used to render placeholder screens (clearly marked as mock).

### Out of scope (explicitly NOT in this iteration)
- Any AI / ML / grading logic.
- The Intelligent Bridge / routing decision logic.
- Real API endpoints beyond `/health` (no data endpoints, no DB).
- Auth / accounts / sessions.
- Image upload / camera / file handling.
- State management beyond local component state and route navigation.
- Forms that actually submit or validate.
- Tests, CI, deployment.

## Repo / folder structure

```
reloop/
├─ package.json                 # root, private, workspace scripts
├─ pnpm-workspace.yaml          # apps/*, packages/*
├─ tsconfig.base.json           # shared strict TS config, path aliases
├─ .gitignore
├─ .npmrc                       # (optional) pnpm settings
├─ README.md
├─ CLAUDE.md                    # (existing)
├─ specs/
│  └─ 001-scaffold.md           # (this file)
│
├─ packages/
│  └─ shared/
│     ├─ package.json           # name: @reloop/shared
│     ├─ tsconfig.json
│     └─ src/
│        ├─ index.ts            # re-exports all types
│        ├─ grading.ts          # GradingResult + supporting types
│        ├─ routing.ts          # RoutingDecision + supporting types
│        ├─ health-card.ts      # ProductHealthCard + supporting types
│        └─ common.ts           # shared primitives (ids, money, condition enum)
│
├─ apps/
│  ├─ api/
│  │  ├─ package.json           # name: @reloop/api
│  │  ├─ tsconfig.json
│  │  └─ src/
│  │     └─ index.ts            # Express app, GET /health only
│  │
│  └─ web/
│     ├─ package.json           # name: @reloop/web
│     ├─ tsconfig.json
│     ├─ next.config.ts
│     ├─ postcss.config.mjs
│     ├─ tailwind.config.ts     # imports design tokens
│     └─ src/
│        ├─ app/
│        │  ├─ layout.tsx       # root layout: fonts, <body>, app chrome
│        │  ├─ globals.css      # Tailwind directives + token CSS vars
│        │  ├─ page.tsx         # "/" Landing / entry
│        │  │
│        │  ├─ home/
│        │  │  └─ page.tsx      # "/home" User home — choose Sell or Return
│        │  │
│        │  ├─ sell/            # SELL flow (user-initiated)
│        │  │  ├─ layout.tsx    # shared sell-flow chrome (step indicator)
│        │  │  ├─ page.tsx      # "/sell" entry / intent
│        │  │  ├─ grading/page.tsx     # "/sell/grading"
│        │  │  ├─ routing/page.tsx     # "/sell/routing" (price + match prep)
│        │  │  ├─ health-card/page.tsx # "/sell/health-card"
│        │  │  ├─ handoff/page.tsx     # "/sell/handoff" local match / handoff
│        │  │  └─ done/page.tsx        # "/sell/done"
│        │  │
│        │  ├─ return/          # RETURN flow (Amazon-decided)
│        │  │  ├─ layout.tsx    # shared return-flow chrome (step indicator)
│        │  │  ├─ page.tsx      # "/return" return reason
│        │  │  ├─ grading/page.tsx     # "/return/grading" doorstep grading
│        │  │  ├─ bridge/page.tsx      # "/return/bridge" Intelligent Bridge decision
│        │  │  ├─ handoff/page.tsx     # "/return/handoff"
│        │  │  └─ done/page.tsx        # "/return/done"
│        │  │
│        │  └─ seller/          # Seller dashboard
│        │     ├─ layout.tsx    # dashboard chrome (sidebar nav)
│        │     ├─ page.tsx      # "/seller" overview
│        │     ├─ returns/page.tsx     # "/seller/returns" returns queue
│        │     ├─ inventory/page.tsx   # "/seller/inventory"
│        │     └─ insights/page.tsx    # "/seller/insights"
│        │
│        ├─ components/
│        │  ├─ ui/              # design-system primitives
│        │  │  ├─ button.tsx
│        │  │  ├─ card.tsx
│        │  │  ├─ badge.tsx
│        │  │  ├─ step-indicator.tsx
│        │  │  └─ stat.tsx
│        │  ├─ layout/
│        │  │  ├─ top-nav.tsx
│        │  │  └─ page-shell.tsx       # placeholder page wrapper w/ title
│        │  └─ placeholder.tsx         # "Coming in Spec NNN" block
│        │
│        ├─ lib/
│        │  └─ tokens.ts        # design tokens as TS (mirrors CSS vars)
│        │
│        └─ mock/
│           └─ fixtures.ts      # mock GradingResult / RoutingDecision / etc.
```

> Note: the monorepo root is the existing `/Users/damankhurana/hack` working
> directory. The `reloop/` label above is illustrative; files land at the repo
> root (no extra nesting).

## Full route tree (User app + Seller dashboard)

| Route | Flow | Screen (placeholder) |
|---|---|---|
| `/` | Entry | Landing — brand, one-liner, "Get started" → `/home` |
| `/home` | User home | Choose **Sell** or **Return** (two big cards) |
| **Sell flow** | | |
| `/sell` | Sell · 1 | Entry / intent — what are you selling |
| `/sell/grading` | Sell · 2 | AI grading (placeholder photo/grade UI) |
| `/sell/routing` | Sell · 3 | Routing — suggested price + match prep |
| `/sell/health-card` | Sell · 4 | Product Health Card preview |
| `/sell/handoff` | Sell · 5 | Local match / handoff arrangement |
| `/sell/done` | Sell · 6 | Done — confirmation |
| **Return flow** | | |
| `/return` | Return · 1 | Return reason |
| `/return/grading` | Return · 2 | Doorstep grading (before it moves) |
| `/return/bridge` | Return · 3 | Intelligent Bridge decision (resale/refurbish/donate/recycle/warehouse) |
| `/return/handoff` | Return · 4 | Handoff arrangement |
| `/return/done` | Return · 5 | Done — confirmation |
| **Seller dashboard** | | |
| `/seller` | Seller | Overview (stat cards) |
| `/seller/returns` | Seller | Returns queue (placeholder table) |
| `/seller/inventory` | Seller | Inventory (placeholder) |
| `/seller/insights` | Seller | Insights (placeholder) |

Each flow `layout.tsx` renders a **step indicator** showing the phase order so
the flow reads as a coherent journey even though screens are placeholders. Each
placeholder screen has: a title, a one-line description of what it WILL do, a
"Coming in Spec NNN" marker, and prev/next navigation to wire the flow together.

## Data contracts (`packages/shared`) — types only

Stubs only — **no logic**. Exact field sets may be refined in later specs; these
establish the shape and the single source of truth. Strict TS, no `any`.

```ts
// common.ts
export type ID = string;

export type ConditionGrade = 'new' | 'like-new' | 'good' | 'fair' | 'poor';

export interface Money {
  amountCents: number;
  currency: 'USD';
}

// grading.ts — "the eyes"
export interface GradingResult {
  id: ID;
  productId: ID;
  grade: ConditionGrade;
  confidence: number;          // 0..1
  detectedIssues: string[];    // e.g. ["scuff on corner"]
  photoUrls: string[];
  gradedAt: string;            // ISO timestamp
}

// routing.ts — "the brain" (Intelligent Bridge)
export type RoutingPath =
  | 'local-resale'
  | 'refurbish'
  | 'donate'
  | 'recycle'
  | 'warehouse';

export interface RoutingFactor {
  label: string;               // e.g. "Nearby demand"
  value: string;               // human-readable, e.g. "High"
  weight: number;              // 0..1, for the glass-box explanation
}

export interface RoutingDecision {
  id: ID;
  productId: ID;
  chosenPath: RoutingPath;
  rationale: string;           // LLM-narrated explanation (stub string)
  factors: RoutingFactor[];    // the inputs the rules considered
  estimatedValue: Money;
  carbonSavedKg: number;
  decidedAt: string;           // ISO timestamp
}

// health-card.ts — "the trust layer"
export interface HealthCardEvent {
  label: string;               // e.g. "Graded", "Verified authentic"
  at: string;                  // ISO timestamp
}

export interface ProductHealthCard {
  id: ID;
  productId: ID;
  title: string;
  grade: ConditionGrade;
  authenticityVerified: boolean;
  history: HealthCardEvent[];
  healthCardUrl: string;       // shareable link (stub)
}
```

`index.ts` re-exports everything from the four modules.

## Design system

### Tokens (Amazon navy + orange)
Defined once in `lib/tokens.ts` and as CSS variables in `globals.css`, consumed
via `tailwind.config.ts`.

- **Surfaces:** `navy-900 #131A22`, `navy-800 #232F3E` (primary surface),
  `navy-700 #2F3B4C`, `navy-600 #3A4A5E`.
- **Accent (orange):** `orange-500 #FF9900` (primary), `orange-600 #EC7211`
  (hover/active).
- **Text:** `text-primary #FFFFFF`, `text-muted #C7D0DA`.
- **Semantic:** `success #2E8B57`, `warning #FFB020`, `danger #D14343`.
- **Radius/spacing/typography:** one scale, defined as tokens.

### Layout & nav
- Root `layout.tsx`: dark navy background, app font, persistent **TopNav**
  (ReLoop wordmark + links to Home / Sell / Return / Seller).
- Flow layouts (`sell`, `return`): a **StepIndicator** across the top showing the
  phase sequence and current step.
- Seller layout: simple sidebar nav (Overview / Returns / Inventory / Insights).

### Reusable UI primitives (`components/ui`)
- `Button` — primary (orange) / secondary (navy outline) variants.
- `Card` — navy surface, rounded, subtle border.
- `Badge` — for grades / paths (color-coded).
- `StepIndicator` — numbered/labeled steps with active state.
- `Stat` — big number + label for the seller dashboard.
- Plus `PageShell` (title + description wrapper) and `Placeholder`
  ("Coming in Spec NNN") in `components/layout` / `components`.

All primitives are presentational, styled purely from tokens.

## Mock data
`apps/web/src/mock/fixtures.ts` exports one sample each of `GradingResult`,
`RoutingDecision`, and `ProductHealthCard` (typed against `@reloop/shared`) so
placeholder screens can render realistic-looking cards. Clearly commented as mock.

## Acceptance criteria — "scaffold complete"
1. `pnpm install` succeeds at the repo root; workspaces resolve
   (`@reloop/web`, `@reloop/api`, `@reloop/shared`).
2. `pnpm --filter @reloop/web dev` starts Next.js; the app loads at `/`.
3. Every route in the route tree above renders its placeholder screen without
   errors and is reachable by clicking through the UI (TopNav + flow prev/next +
   the Sell/Return choice on `/home`).
4. Both flows show a working **StepIndicator** reflecting the correct phase order.
5. The Seller dashboard renders all four screens via its sidebar.
6. `apps/api` boots (`pnpm --filter @reloop/api dev`) and `GET /health` returns
   `{ status: "ok" }`.
7. `@reloop/shared` exports `GradingResult`, `RoutingDecision`,
   `ProductHealthCard` (+ supporting types); `apps/web` imports them in
   `mock/fixtures.ts` and type-checks.
8. Strict TypeScript passes (`tsc --noEmit`) across all packages with **no `any`**.
9. The UI visibly uses the design tokens (navy surfaces, orange accents) and
   shared primitives — not default/unstyled markup.
10. No real functionality is present: no AI, no data endpoints, no persistence,
    no auth — every screen is explicitly a placeholder.

## Open questions
1. **Package namespace** — OK to use `@reloop/*` for workspace package names?
2. **Tailwind version** — default to Tailwind v4 (CSS-first config) or pin v3
   (`tailwind.config.ts` as shown)? Spec assumes v3-style config; tell me if you
   prefer v4.
3. **Landing scope** — should `/` be a minimal entry screen (brand + CTA) or a
   slightly richer marketing-style hero? I've assumed minimal.
4. **Seller dashboard depth** — are the four screens (Overview / Returns /
   Inventory / Insights) the right set, or do you want a different breakdown?
5. **Sell flow naming** — I split routing and health-card into separate steps
   (`/sell/routing` then `/sell/health-card`). Confirm that ordering matches your
   mental model, or should the health card come before routing?
```

