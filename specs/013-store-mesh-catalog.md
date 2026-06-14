# 013 — Store + Mesh catalog: categories, search, real product images

## Goal
Make the Store (buy-new) and Amazon Mesh (borrow-nearby) surfaces feel like real,
browsable marketplaces: more products, a category filter, free-text search, and —
critically — **exact-model product images** on every item. The previous catalog
reused generic/mismatched stock (e.g. a PlayStation entry that showed an Atari, an
"Instant Pot" that was random saucepans), which is unacceptable for production.

## Scope
**In scope**
- Expand `store-products.ts` to ~22 products across 8 groups; expand `mesh.ts` to
  ~16 borrowable listings across 6 groups.
- A shared `FilterBar` (search box + category chips + result count) on `/app/store`
  and the `/app/mesh` Borrow tab. Filtering is client-side over title/brand/group/
  description (Store) and title/group/blurb (Mesh).
- Replace all Store/Mesh imagery with real, exact-model photos sourced from
  Wikimedia Commons, each visually verified to depict the correct product, saved
  under `apps/web/public/catalog/`.
- Consistent image treatment: white tile + `object-contain` so every product is
  shown in full (no cropping) and mixed-background shots read uniformly.
- Fix the prevention hero image mismatch: rename "Nike Air Zoom Pegasus 40" →
  "Nike Air Jordan 1 Mid" to match its real photo (size-prediction logic unchanged).
- Correct the Mesh dormant-inventory images (the lend nudge) to real photos.

**Out of scope (unchanged this iteration)**
- The prevention model, the Mesh engine math, EcoCredits wiring, and all routing.
- Any `apps/api` work; payments; real auth.
- Image attribution file (Commons CC images) — flagged below as a follow-up.

## Affected files
**Created**
- `apps/web/src/components/catalog/filter-bar.tsx` — shared search + category chips.
- `apps/web/public/catalog/*` — 24 new verified product images (iphone-15-pro,
  galaxy-s23, pixel-8-pro, ipad-air, macbook-air, airpods-pro, apple-watch-series,
  sony-wh1000xm, bose-qc, jbl-charge, ps5-console, xbox-series-x, switch-oled,
  canon-r5, gopro-hero, dji-mavic, kindle-paperwhite, dyson-v10, nespresso,
  benq-projector, camping-tent, pressure-cooker, samsung-tv-led, dewalt-drill).

**Changed**
- `packages/shared/src/mesh.ts` — add `group: string` to `MeshListing`.
- `apps/web/src/mock/store-products.ts` — categorized catalog + `group`, real
  images, renamed footwear hero. Adds `storeGroups`.
- `apps/web/src/mock/mesh.ts` — categorized listings + `group`, real images, fixed
  dormant images. Adds `meshGroups`.
- `apps/web/src/app/app/store/page.tsx` — FilterBar + filtered grid + white tiles.
- `apps/web/src/app/app/mesh/page.tsx` — FilterBar on the Borrow tab + filtering.
- `apps/web/src/components/mesh/{listing-card,dormant-card}.tsx`,
  `app/app/store/[productId]/page.tsx`, `app/app/mesh/[listingId]/page.tsx` —
  white-tile `object-contain` image treatment.
- `specs/011-return-prevention.md` — note the hero rename.

## Data contracts (`@reloop/shared`)
- `MeshListing.group: string` — display category for the borrow-side filter.
  (Store's `StoreProduct.group` lives in the web mock, alongside `storeGroups`.)

## UI / behavior
- **Store** — chips: All · Phones · Laptops & Tablets · Audio · Gaming · Cameras ·
  Wearables · Home · Footwear. Search matches title/brand/group/description; empty
  state when nothing matches. Footwear hero keeps the "Return insight" badge.
- **Mesh › Borrow** — chips: All · Cameras · Gaming · Audio & TV · Home · Tools ·
  Outdoors. Search matches title/group/blurb. Lend tab unchanged.
- **Images** — every card and detail page renders the product on a white tile with
  padding and `object-contain`, so the exact model is always fully visible.

## Acceptance criteria
- [x] `pnpm typecheck` clean across workspace.
- [x] `pnpm --filter @reloop/web build` compiles all routes.
- [x] Every `/catalog/*` path referenced by Store/Mesh exists on disk (0 missing).
- [x] Every product image was visually verified to depict the exact named model.
- [x] Category chips + search filter the Store grid and the Mesh Borrow grid;
      result count + empty states behave.

## Resolved decisions
- **Wikimedia Commons** as the image source — reliably downloadable (curl), license-
  clean, and each file was opened and eyeballed before shipping. Retailer CDNs (e.g.
  Amazon) were not reliably reachable by the available fetch tooling.
- **Catalog curated to products with verified-good images.** Items with no clean
  Commons photo (e.g. modern baby gear) were dropped rather than shipped mismatched.
- **White-tile `object-contain`** over `object-cover` — guarantees the full, exact
  model is shown and unifies mixed-background sources.
- **Prevention hero renamed** to match its existing photo instead of re-sourcing a
  Pegasus shot — keeps the prevention feature/logic untouched.

## Open questions / follow-ups
- Add a `CREDITS.md`/attribution for the Commons CC-BY images before public launch.
- Persist the selected category/search in the URL (`?q=&cat=`) for shareable links?
- Add a few more sized products with predictions (currently only the footwear hero)?
