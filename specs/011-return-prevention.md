# 011 — Return Prevention (point-of-purchase)

## Goal
Make the 4th pillar — **Prevention** ("predict returns before they happen") — real.
The pillar was advertised on the landing page but had no feature behind it. At the
moment a shopper picks a product **variant** (e.g. a shoe size), the AI predicts how
likely that variant is to be returned and nudges them to a safer choice **before**
they buy. A return that never happens is the best outcome — no doorstep grading, no
routing, no warehouse, no carbon.

## Scope
**In scope**
- A minimal "buy new" storefront surface (the app had no new-product marketplace —
  the existing Shop is second-life/used only, with no variants).
- `/app/store` grid + `/app/store/[productId]` product page with a size selector.
- A Return-Risk panel that appears on variant selection: return rate, reason
  breakdown, confidence, and a "switch to safer size" recommendation.
- Deterministic, client-side prediction (demo-safe — no network in the demo path).

**Out of scope (future, needs explicit approval)**
- An `apps/api` endpoint backing the prediction with a real model.
- Wiring prevention into a real cart/checkout or EcoCredits.
- Seller-dashboard prevention analytics; landing-page pillar link-up.

## Affected files
**Created**
- `packages/shared/src/prevention.ts` — `ReturnRiskPrediction` + supporting types.
- `apps/web/src/mock/store-products.ts` — storefront catalog; hero shoe carries
  per-size predictions. Reuses existing `/catalog` images (no new assets).
- `apps/web/src/lib/prevention.ts` — `getReturnRisk()` glass-box lookup + tone/pct
  helpers.
- `apps/web/src/components/store/return-risk-panel.tsx` — the prevention nudge.
- `apps/web/src/app/app/store/page.tsx` — storefront grid.
- `apps/web/src/app/app/store/[productId]/page.tsx` — product page + size selector.

**Changed**
- `packages/shared/src/index.ts` — export `./prevention.js`.
- `apps/web/src/components/layout/app-nav.tsx` — add "Store" tab (first).

## Data contracts (`@reloop/shared`)
`ReturnRiskPrediction` — `{ variantLabel, riskLevel: 'low'|'moderate'|'high',
returnRate (0..1), confidence (0..1), reasons: { reason, share }[], recommendation?:
{ variantLabel, returnRate, rationale } }`.

## UI / behavior
- **Store grid** — products with brand, rating, price; predictive products tagged
  "Return insight".
- **Product page** — photo + buy panel. Sized products show size buttons. Picking a
  size renders the Return-Risk panel (re-mounts per size, fades in). High/moderate
  risk reads amber (caution, not error); low risk reads gold/confident. "Switch to
  size N" updates the selection. "Add to cart" is disabled until a size is chosen.
- **Hero demo product** — Nike Air Jordan 1 Mid (sized footwear). Size 8 = high risk
  (38%, "runs small"), recommends size 9 (6%). Size 9/10 = low; size 7/11 = moderate.
  (Renamed from "Air Zoom Pegasus 40" in iteration 013 so the title matches its real
  product photo; the size-prediction logic is unchanged.)

## Acceptance criteria
- [x] `pnpm typecheck` clean across workspace.
- [x] `pnpm --filter @reloop/web build` compiles `/app/store` and
      `/app/store/[productId]`.
- [x] Selecting size 8 on the hero shoe shows a high-risk panel recommending size 9;
      "Switch to size 9" flips it to a low-risk state.
- [x] No existing flow touched beyond the one nav line; no new assets added.

## Resolved decisions
- **Surface:** new "buy new" Store rather than bolting onto the used-goods Shop —
  prevention is about *new* purchases and needs variants.
- **Deterministic client-side** prediction over an API call — demo reliability. The
  `ReturnRiskPrediction` contract lives in `shared` so an API model can back it later
  without UI changes.
- **Framing:** customer-obsessed ("runs small — most shoppers size up"), not
  alarmist.

## Open questions
- Should the prevention nudge tie into EcoCredits / the landing-page pillar link?
- Add the `apps/api` endpoint for parity with grade/price flows?
