# Spec 005 — User app shell: entity select + My Items + casual listings

**Status:** SHIPPED 2026-06-13 (UI + nav only; `tsc` + `next build` clean, 20 routes).
Built with all recommended option choices approved in chat.

> Numbering note: specs 002 and 003 each exist twice (parallel sell/return tracks).
> The highest number on disk is 004, so this is **005**. Shout if you want a
> different number or a track prefix.

## Goal
Stand up the **USER APP entry experience** as UI + navigation only: a fake
"continue as…" entity select, the User's home (**My Items** — the things they own
and can sell), and a lightweight **casual-seller** section (**My Listings**).
This is the on-ramp to selling; the actual sell/grading flow is **not** wired here
(see Open Question 1 — that flow already exists at `/sell/*`).

Everything must look like the same product as the homepage: near-black surface,
dotted grid + soft amber glow, gold accent, mono small-caps labels/chips, pill
buttons — all from the **existing** tokens and primitives. No new palette.

## Scope

### In scope
- **Entity select page** (`/login`) — demo only, no auth. Two choices: *Shop & Sell*
  (user) and *Seller* (pro). Selecting one sets a client-side role and navigates.
- **Role state** — a mock client context (details below), persisted so a refresh
  keeps you "signed in"; logout clears it and returns to `/login`.
- **User app shell** (`/app`) — its own sub-nav (My Items · My Listings) plus a
  role switch / log out control.
- **My Items** (`/app/items`) — grid of ~6 varied owned items (mock), each card with
  a **Sell** action; good empty state.
- **My Listings** (`/app/listings`) — casual-seller view: mock listings with status
  chips (Listed / Viewed / Matched / Sold); friendly empty state.
- **Sell-start stub** (`/app/sell/[itemId]`) — placeholder that says grading comes
  next. (Pending Open Question 1.)
- Documentation of the **two-tier seller model** (casual vs pro).

### Out of scope (do not touch this phase)
- Real authentication / passwords / sessions.
- Photo upload, AI grading, pricing, health card (the real `/sell/*` flow stays
  as-is; we don't modify it).
- The buy/shop catalog.
- The pro Seller dashboard internals (`/seller/*`) — we only *link* to it.
- Any backend logic or AI calls. All data is mock.

## Route tree (proposed)
```
/login                     NEW  entity select ("Continue as…")
/app                       NEW  user-app layout; index redirects → /app/items
  /app/items               NEW  My Items (owned items, Sell action)
  /app/listings            NEW  My Listings (casual seller, status chips)
  /app/sell/[itemId]       NEW  placeholder sell-start stub
/seller/*                  EXISTING  pro dashboard (unchanged; linked from /login)
/  /sell/*  /return/*  /home   EXISTING  (see Open Questions 2 & 3)
```

## Role state (mock — how it's held)
- New client context `RoleProvider` in `src/lib/role-context.tsx`, exposing
  `{ role: 'user' | 'seller' | null, setRole, logout }`.
- Persisted to `localStorage` (`reloop.role`). Read in `useEffect` after mount to
  avoid SSR hydration mismatch; treat as `null` until hydrated.
- `setRole('user')` → navigate `/app/items`; `setRole('seller')` → `/seller`.
- `logout()` → clear storage + `router.push('/login')`.
- Provider mounted in the root layout so both `/app` and `/seller` can read it.
- **Not** a route guard — pages remain directly reachable (demo). Role only drives
  nav/redirects and which "you" is shown. (Open Question 4: do you want a soft
  redirect to `/login` when role is null?)

## Data contracts (mock shapes)
Mock-only this phase, so they live in `apps/web/src/mock/` alongside the existing
`demo-items.ts` / `fixtures.ts`. They **reuse** `Money` and `ItemCategory` from
`@reloop/shared` (single source of truth for shared bits). They can graduate to
`packages/shared` when a backend exists (Open Question 5).

```ts
// src/mock/owned-items.ts
export interface OwnedItem {
  id: string;
  title: string;
  category: ItemCategory;        // from @reloop/shared
  imageUrl: string;              // placeholder asset under /public
  purchaseDate: string;          // ISO
  originalPrice: Money;          // from @reloop/shared
  description: string;           // short
  conditionHint: string;        // e.g. "Lightly used · works perfectly"
}

// src/mock/casual-listings.ts
export type ListingStatus = 'listed' | 'viewed' | 'matched' | 'sold';
export interface CasualListing {
  id: string;
  title: string;
  imageUrl: string;
  listedPrice: Money;
  status: ListingStatus;
  views?: number;
  listedAt: string;             // ISO
}
```
~6 owned items (varied — e.g. Sony headphones, Nike runners, Nanit baby monitor,
Instant Pot, LEGO set, Dyson vacuum). ~4 listings spanning all four statuses.

## UI / behavior
- **`/login`** — full-screen hero echoing the landing: `GridBackdrop` + radial
  amber glow, ReLoop mark, a mono eyebrow ("Select identity / demo"), then two
  large selectable cards (Shop & Sell · Seller) with gold pill CTAs. No top nav on
  this page.
- **`/app` shell** — sub-nav bar (mono small-caps tabs: My Items · My Listings),
  active tab in gold; right side shows current role + a "Switch / Log out" pill →
  `logout()`.
- **My Items** — `PageShell` (eyebrow "Your stuff", title "My Items"); responsive
  card grid. Each `Card`: image, title, mono category + purchase-date line,
  original price, one-line description, condition hint (`Badge`), and a primary
  **Sell** `Button`. Empty state: friendly mono message + illustration block.
- **My Listings** — `PageShell` (title "My Listings"); cards with image, title,
  listed price, a status `Badge` (listed→neutral, viewed→accent, matched→accent,
  sold→success), and view count. Empty state explains casual selling. A short note
  panel documents casual vs pro.
- **Sell-start stub** — `PageShell` + `Placeholder` component ("Grading comes
  next"), Back to My Items. (Pending OQ1.)

## Component reuse plan (no new palette / primitives unless noted)
- Layout/headers: `PageShell`, `Eyebrow`, `Mono`, `GridBackdrop` (`ui/section.tsx`).
- Surfaces & actions: `Card`, `Button`, `Badge` (status chips), `Stat` (optional
  listing counts), `Placeholder` (sell stub).
- New, small: `RoleProvider` (context) and an `/app` sub-nav component
  (`components/layout/app-nav.tsx`) styled exactly like the existing chrome.
- Reuse `Money`/`ItemCategory` from `@reloop/shared`; price formatting mirrors the
  existing `fmt` helper pattern (USD, cents → `$X.XX`).

## Two-tier seller model (documented)
- **Casual seller** — every user. Lightweight, lives *inside* the user app
  (`/app/listings`). Items they've sent for a second life; minimal, near-invisible.
- **Pro seller** — high-volume, the full dashboard at `/seller/*` (insights,
  inventory, returns queue). Reached by choosing "Seller" at `/login`.

## Affected files (planned, on approval)
- New: `src/app/login/page.tsx`, `src/app/app/layout.tsx`,
  `src/app/app/items/page.tsx`, `src/app/app/listings/page.tsx`,
  `src/app/app/sell/[itemId]/page.tsx`, `src/app/app/page.tsx` (redirect).
- New: `src/lib/role-context.tsx`, `src/components/layout/app-nav.tsx`,
  `src/mock/owned-items.ts`, `src/mock/casual-listings.ts`.
- New: placeholder images under `public/` (or reuse existing demo images).
- Edit: `src/app/layout.tsx` (wrap `RoleProvider`); possibly `top-nav.tsx` and the
  landing CTAs (Open Questions 2 & 3).

## Acceptance criteria
1. `/login` shows two on-brand choices; picking one sets role and lands on the
   right home (`/app/items` or `/seller`).
2. Refreshing keeps the chosen role; "Log out" returns to `/login`.
3. `/app/items` renders ≥6 varied mock items, each with a working **Sell** action
   reaching the agreed target (stub or existing flow — per OQ1).
4. `/app/listings` shows mock listings with all four status chips and a friendly
   empty state.
5. App sub-nav switches between My Items and My Listings; role switch/log out works.
6. Visually indistinguishable in language from the homepage (grid+glow, gold, mono
   chips, pills) — no new colors/fonts; `tsc` + `next build` clean.

## Resolved decisions (as shipped)
1. **Sell action → reuse existing `/sell`**, pre-seeded. The card's Sell button writes
   `{title, category, notes}` to `sessionStorage` (`reloop.sellSeed`); `SellFlowProvider`
   reads it once on mount. No `/app/sell/[itemId]` stub was created.
2. **`/home` → redirect** to `/app/items` (server redirect, 307).
3. **Front door = `/login`.** Landing "Try the demo" and top-nav "Get Started" now point there.
4. **Soft redirect** in the app layout: `/app/*` → `/login` when role is null (after hydration).
5. **Types** `OwnedItem`/`CasualListing` live in `web/src/mock` (mock-only).
6. **Nav**: global TopNav kept (auto-hidden on `/login`); app sub-nav added beneath on `/app/*`.
   `/app` index does a client-side redirect to `/app/items` (reliable under the client layout).

## Original open questions
1. **Sell action target (most important).** The real sell+grading flow already
   exists at `/sell/*`. Should a card's **Sell** button (a) route to a *placeholder
   stub* as the brief literally says, or (b) route to the **existing** `/sell`
   intent screen, optionally pre-seeded with the item? Recommendation: **(b)** —
   reuse what's built; it's more coherent and demos better. I'll do (a) only if you
   want this phase fully isolated.
2. **`/home` overlap.** `/home` is today's "What would you like to do?" (Sell /
   Return chooser). My Items supersedes it. Recommendation: redirect `/home` →
   `/app/items` (keep Return reachable elsewhere), or leave `/home` untouched.
3. **Entry point.** Should the landing "Get Started" (and top-nav) point to
   `/login` now? Recommendation: yes — `/login` becomes the front door.
4. **Soft guard.** When `role` is null, soft-redirect `/app/*` → `/login`? (Demo
   still allows direct URL access otherwise.) Recommendation: yes, gentle redirect.
5. **Type location.** Keep `OwnedItem`/`CasualListing` in `web/src/mock` for now
   (mock-only), or put them in `packages/shared`? Recommendation: web/mock until a
   backend exists.
6. **Global TopNav vs app sub-nav.** On `/app/*`, do we hide the global TopNav in
   favor of the app sub-nav, or keep both? Recommendation: keep global TopNav,
   add the app sub-nav beneath it (like the sell/return sub-bars).
```
