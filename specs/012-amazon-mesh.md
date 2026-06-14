# 012 — Amazon Mesh (hyperlocal P2P lending)

## Goal
Activate the dormant inventory already sitting in customers' homes. Instead of a
"temporary need" purchase becoming a return that ships to a warehouse, a nearby
neighbor borrows the thing that's already here. The owner earns passive income, the
borrower pays a fraction of buying new, Amazon takes a platform fee — a whole
purchase-return loop is eliminated with **no new inventory and no new logistics**.
Two sides ship together so the demo shows the full round-trip:
- **Lend (proactive hero):** scan purchase history for idle items, match each to live
  nearby demand, nudge the owner to lend ("your DSLR has sat idle 6 months — a
  neighbor 800m away wants it this weekend for ₹600").
- **Borrow:** browse verified nearby listings, rent for a fraction of new, Amazon
  brokers the handoff + deposit + buyer protection.

## Scope
**In scope**
- New self-contained **Mesh** nav tab with Lend / Borrow sub-tabs.
- Lend: dormant-inventory nudge cards + one-tap "Lend it" (records a booking,
  surfaces lender payout).
- Borrow: neighborhood grid + `/app/mesh/[listingId]` rent flow with a days
  selector and a live, glass-box quote (total, deposit, platform fee, savings vs
  new).
- Earnings flow into the existing **EcoCredits** ledger (Rewards), like resale.
- Deterministic, client-side math + mock neighborhood — demo-safe, no network.

**Out of scope (future, needs explicit approval)**
- Reactive **return-intercept** ("lend instead of return") inside the `/return`
  flow — deferred to keep that flow stable this iteration.
- An `apps/api` endpoint backing dormancy / demand with real models.
- Real payments, deposits, identity, or last-mile logistics.
- Seller-dashboard Mesh analytics; landing-page pillar link-up.

## Affected files
**Created**
- `packages/shared/src/mesh.ts` — `MeshListing`, `DormantSignal`, `MeshDemand`,
  `MeshBooking`, `MeshRole`.
- `apps/web/src/lib/mesh.ts` — glass-box engine: `suggestDailyRate`, `quote`,
  `formatDistance`, and the per-user `recordBooking`/`getBookings` store (posts
  EcoCredits via `earnFor`).
- `apps/web/src/mock/mesh.ts` — dormant inventory per user + shared borrowable
  pool. Reuses existing `/catalog` images (no new assets).
- `apps/web/src/components/mesh/dormant-card.tsx` — the lend nudge.
- `apps/web/src/components/mesh/listing-card.tsx` — the borrow grid card.
- `apps/web/src/app/app/mesh/page.tsx` — hub with Lend / Borrow tabs.
- `apps/web/src/app/app/mesh/[listingId]/page.tsx` — borrow / rent flow.

**Changed**
- `packages/shared/src/index.ts` — export `./mesh.js`.
- `apps/web/src/components/layout/app-nav.tsx` — add "Mesh" tab (after Shop).

## Data contracts (`@reloop/shared`)
- `DormantSignal` — an idle owned item Mesh suggests lending: `{ id, title,
  category, imageUrl, newPrice, idleMonths, suggestedDailyRate, deposit, demand:
  MeshDemand[], projectedMonthlyEarn }`.
- `MeshDemand` — a nearby wanter: `{ borrowerName, distanceM, purpose, days }`.
- `MeshListing` — a borrowable item: `{ id, title, category, imageUrl, blurb,
  lenderName, lenderInitials, distanceM, dailyRate, deposit, newPrice, rating,
  lentCount, availability }`.
- `MeshBooking` — a confirmed lend/borrow: `{ id, role: 'lend'|'borrow', title,
  imageUrl, counterpartyName, days, dailyRate, total, deposit, platformFee,
  lenderNet, at }`.

## Glass-box engine (`lib/mesh.ts`)
- `suggestDailyRate(newPrice)` — ~3% of new price/day, rounded to ₹10.
- `quote(dailyRate, deposit, newPrice, days)` — `total = dailyRate × days`;
  `platformFee = 15% of total` (Amazon's margin); `lenderNet = total − fee`;
  `savedVsNew` / `savedPct` vs buying new.
- `recordBooking()` persists per user (`reloop.<account>.mesh.bookings`) and posts
  EcoCredits to Rewards (lenders earn on the payout; borrowers earn for choosing
  circular, mirroring buy-second-life).

## UI / behavior
- **Lend tab** — a passive-income hero (sum of projected monthly earnings) over a
  grid of dormant items. Each card shows idle months, the top nearby wanter + their
  reason, the lender payout, and projected monthly earn. "Lend it" confirms inline
  (brokered-handoff copy) and posts EcoCredits.
- **Borrow tab** — grid of nearby listings tagged with distance and "Save X% vs
  new". Each links to the rent flow: photo + lender trust card on the left; days
  selector (1/2/3/7) + live quote + "Request to borrow" on the right, confirming to
  a brokered-handoff state.
- **Hero demo (as Aarav):** idle Canon DSLR, 6 months untouched, Nikhil 800m away
  wants it 2 days at ₹600/day → "Lend it → earn ₹1,020".

## Acceptance criteria
- [x] `pnpm typecheck` clean across workspace.
- [x] `pnpm --filter @reloop/web build` compiles `/app/mesh` and
      `/app/mesh/[listingId]`.
- [x] Lend tab shows the signed-in user's dormant items; "Lend it" confirms and
      records a booking → EcoCredits appear in Rewards.
- [x] Borrow flow recomputes the quote per day count and shows savings vs new.
- [x] One nav line added; no existing flow touched; no new assets.

## Resolved decisions
- **Full round-trip** (Lend + Borrow) in one iteration — the loop is the pitch.
- **Self-contained Mesh tab**, return-intercept deferred — don't destabilize
  `/return` now.
- **Earnings into EcoCredits** via `earnFor()` — consistent with resale earnings.
- **Mock neighbors**, not the 4 demo accounts — those live in different cities,
  while Mesh is "800m away".
- **Deterministic client-side** math — demo reliability; the contracts live in
  `shared` so an API/model can back it later without UI changes.

## Open questions
- Add the reactive return-intercept ("lend instead of return") in `/return`?
- Surface Mesh bookings as their own list (active loans / returns due) beyond the
  Rewards ledger?
- Tie a landing-page pillar / `apps/api` endpoint in for parity with grade/price?
