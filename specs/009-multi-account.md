# Spec 009 — Multi-account demo (1 seller, 2 users) + cross-user resale

## Goal
Turn the "everything in one place" app into a coherent multi-account demo: one
seller and two users, each with their own screens and data, so the story reads
cleanly on stage — a user returns or resells items they bought from the seller,
and one user's resale listing can be bought by the other. No existing
functionality is altered; it's reorganised behind a real identity + ownership
layer.

## Accounts
- `user_aarav` — Aarav Shah (Bengaluru)
- `user_meera` — Meera Iyer (Pune)
- `seller_urban` — UrbanThread Store (the brand the users bought from)

Login (`/login`) picks an identity (no password). Stored in `reloop.account`.
Switch any time from the app/seller nav.

## Data model
**Shared (global) — the marketplace:**
- `reloop.market.sold` — sold listing ids (so a listing sells across users).
- `reloop.listings` — user-created resale listings (each tagged `sellerId`).
- `reloop.seller.sales` — sale records (price, credits, CO₂) keyed by listing id.

**Per-user (namespaced `reloop.<accountId>.*`):**
- `…credits.ledger` — seller earns + voucher redemptions.
- `…purchases` — what this user bought (drives their buyer EcoCredits).

`lib/storage.ts` provides `currentAccountId()` + `nsKey()`. `lib/accounts.ts` is
the registry. `lib/market.ts` aggregates the static catalog + user listings into a
buyable feed (`ShopEntry`), excluding the viewer's own listings.

## Ownership & the two tabs
`mock/owned-items.ts` tags each item with `ownerId` + `returnEligible`:
- Aarav: Under Armour shoes (resell) · boAt headphones (return, ORD-2001).
- Meera: Puma sneakers (resell) · Canon camera (return, ORD-2002).

`/app/items` shows two tabs:
- **Eligible for return** → `/return/<orderId>` (return flow; eligible items added
  to `mockOrders`).
- **Resell** → `/app/sell/<itemId>` (sell flow — grading, pricing, agent listing).

## Cross-user resale
A user's sell-flow listing is stored with `sellerId`, the Health Card, impact, and
original price — enough to render and sell in the Shop. The other user sees it in
their Shop, buys it; the sale marks it sold (global), records the buyer's purchase
+ credits, and pays the **seller's** ledger via `earnFor(sellerId, …)`. The seller
then sees it Sold with payout + credits in their own My Listings / Rewards.

A seeded listing (Aarav's Nike Pegasus) makes this work out of the box; live
selling works too.

## Affected files
- New: `lib/accounts.ts`, `lib/storage.ts`, `lib/market.ts`.
- Identity: `lib/role-context.tsx` (account-aware, keeps `useRole`/`role`),
  `app/login/page.tsx`, `components/layout/app-nav.tsx`, `app/seller/layout.tsx`,
  `components/layout/top-nav.tsx` (hidden inside `/app` + `/seller`).
- Data: `lib/credits-store.ts` (+`earnFor`), `lib/marketplace-store.ts`
  (per-user purchases), `mock/casual-listings.ts` (+sellerId/card/impact),
  `mock/seed-listings.ts` (Aarav), `mock/owned-items.ts` (per-user + eligibility),
  `lib/mocks/return-flow.ts` (return orders).
- Surfaces: `app/app/items/page.tsx` (tabs), `app/app/shop/page.tsx` +
  `app/app/shop/[itemId]/page.tsx` + `components/shop/shop-detail.tsx`
  (market entries + seller crediting), `app/app/listings/page.tsx`
  (per-seller), `components/sell/sell-session.tsx` (stamp listing).

## Demo script
1. Login as **Aarav** → My Items: Resell tab (UA) + Return tab (headphones).
2. (Optional) Resell the UA → it lists + the agent watches it.
3. Switch to **Meera** → Shop shows Aarav's listing → buy it.
4. Switch back to **Aarav** → My Listings: Sold, payout + EcoCredits; Rewards updated.
5. **UrbanThread** seller → the pro returns dashboard.

## Acceptance criteria
- Each account has separate items, listings, purchases, credits.
- A listing by one user is buyable by the other; the seller gets paid.
- Return-eligible items open the return flow; others open the sell flow.
- No flow (grading, pricing, agent, return, rewards) is broken; `tsc` green.
