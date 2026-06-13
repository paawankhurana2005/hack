# Spec 007 — Real demo items + premium live sell flow + app-wide INR (₹)

**Status:** SHIPPED 2026-06-13. `tsc` + `next build` clean; live API confirmed INR
pricing (Puma priced ₹8,999 → ₹5,399); USD audit clean. Assets optimized 8 MB → ~460 KB.

> Numbering: highest on disk is 006, so this is **007**. Builds on the 006 sell flow
> (`/app/sell/[itemId]` orchestrator, `ReferenceComparison` + `OwnedItem` + impact
> contracts already in `packages/shared`).

## Goal
Make the sell flow demo-ready and India-native: replace dummy My Items with **two real
shoes** (live photo upload, no pre-filled user photos), convert the **entire app to INR
(₹)** including pricing logic, add a **premium item-detail screen**, make the **AI
analysis state alive and intelligent**, and turn the **Health Card into a showpiece**.

## Scope

### In scope
- **Data reset:** delete all dummy owned items; add two real ones (Under Armour
  Charged Assert from `demo/original/`, Puma Slipstream from existing assets). No
  pre-set condition. INR prices.
- **App-wide INR**: display + formatting + symbols, and the pricing-service logic
  (clamps, fallback table, money helpers, LLM prompt). Money stays integer minor
  units (paise). Full USD audit (see "Currency changes").
- **Sell flow** `detail → capture → analysis → review → confirmed`:
  - new **item-detail** screen (3a),
  - **live** photo upload 1–4 (3b),
  - **premium analysis** state surfacing real steps + per-photo + reference run (3c),
  - INR pricing (3d), **showpiece Health Card** (3e), **review & confirm** (3f).
- **Review reference display = hybrid** (Q2): user's live photos + one "as listed"
  cover + the comparison conclusion (no raw original grid).
- Copy `demo/original/*` to clean web paths.

### Out of scope
- Real marketplace/matching, buyer side, handoff/logistics, real auth, real visual
  diff (reference comparison stays the labeled mock from 006). Legacy `/sell/*` stays
  deprecated (but is converted to ₹ in the currency audit).

## Route tree + screen states
```
/app/items                 EDIT  now lists exactly 2 real items (UA, Puma)
/app/sell/[itemId]         EDIT  orchestrator gains a "detail" phase first
```
**Phases (component state):**
- `detail` — item hero: cover image, title, category, purchase date, original ₹ price,
  description, known specs. NO condition. CTA "Start selling →".
- `capture` — live upload 1–4 (base64 JPEG), per-photo added→compressing→done, validation.
- `analysis` — premium "alive" inspection (design below).
- `review` — verdict, reference conclusion, issues, ₹ price+why, Health Card preview,
  impact, one confirm.
- `confirmed` — showpiece Health Card + impact; listing created (stub, status Listed).

## Data: the two real items (mock, `apps/web/src/mock/owned-items.ts`)
1. **Under Armour Charged Assert 10** — category `sports`; cover `/demo/ua-charged/front.png`
   (best of the 3 = 3/4 front); `originalListingImages = [front, side, sole]`;
   `originalSpecs = { Model: 'Charged Assert 10', "Style #": '3026175-101', Color: 'White', Size: 'US 10' }`;
   purchaseDate `2024-02-10`; originalPrice **₹6,999**; description "Everyday running
   shoes. Replaced with a newer pair."
2. **Puma Slipstream Sneakers** — category `fashion`; cover `/demo/puma-slipstream/profile.jpg`;
   `originalListingImages = [profile, side, top, label]`;
   `originalSpecs = { Model: '392434-01', Color: 'White/Vapor Gray', Size: 'US 9' }`;
   purchaseDate `2023-12-02`; originalPrice **₹8,999**; description "Retro court
   sneakers. Grew out of the style."

Assets: copy `demo/original/{image.png, image copy.png, image copy 2.png}` →
`/demo/ua-charged/{front.png, side.png, sole.png}` (clean, space-free). `demo/user's/`
stays unused — uploads are live.

## Data contracts (`packages/shared`)
Already present from 006: `OwnedItem` (+ `originalListingImages`, `originalSpecs`),
`ReferenceComparison`/`SpecMatch` on `GradingResult`, `GradeReference`, `estimateImpact`.
**Only contract change here:** `Money.currency: 'USD'` → **`'INR'`** in `common.ts`.

## Currency changes (every place — the audit)
1. `packages/shared/common.ts` — `Money.currency` literal `'USD'` → `'INR'`.
2. `packages/shared/impact.ts` — rebalance for ₹ magnitudes:
   `ecoCredits = round(co2SavedKg×3 + rupees×0.002)` (was `×0.1` on USD).
3. `apps/api/.../pricing/pricing-service.ts` — clamps `RETAIL_MIN/MAX` →
   **₹100 (10 000 paise) – ₹5,00,000 (50 000 000 paise)**; `usd()`→`inr()` (currency
   'INR'); `fmt()` → `₹` (en-IN). GRADE_FACTOR + DEMAND_ADJUST unchanged.
4. `apps/api/.../pricing/nvidia-market-provider.ts` — prompt asks for **INR**
   (`estimatedRetailInr`, "Indian Rupees"); `parseUsd`→`parseInr`; retry copy → INR;
   `CATEGORY_DEFAULT_USD` → `CATEGORY_DEFAULT_INR`: electronics ₹12,000 · home ₹5,000 ·
   fashion ₹4,000 · sports ₹5,000 · toys ₹2,500 · books ₹500 · other ₹4,000;
   returns `estimatedRetailCents` = inr × 100 (paise).
5. `apps/api/.../pricing/types.ts` — comment "USD cents" → "INR paise" (field name kept,
   it's generic minor units).
6. `apps/api/.../routes/sell.ts` — `moneySchema` currency `z.literal('USD')` → `'INR'`.
7. `apps/web/src/lib/money.ts` — `formatMoney` → `₹` + `en-IN` grouping.
8. `apps/web/src/mock/owned-items.ts` + `casual-listings.ts` — `usd()`→`inr()`, INR values.
9. Legacy `apps/web/src/app/sell/routing|health-card/page.tsx` — local `fmt` `$`→`₹`.
10. Audit return-flow + fixtures for any `currency: 'USD'` Money constructors → `'INR'`
    (return UI already prints ₹; this aligns the stored value).
11. Grep sweep: no `'USD'`, `$`-money, or `en-US` currency formatting left anywhere.

## Service-call sequence (unchanged chain, INR-aware)
`grade` (one call, server sequential per photo, + reference) → `price` (INR) →
`health-card` → client `estimateImpact(category, suggestedPrice)` → review.

## Analysis-state design (3c — the hero moment)
`ProcessingStep` upgraded from a checklist to a live inspection:
- The photo currently under inspection shown as a thumbnail with the **scan-line**
  animation (reuse `animate-scan`) + corner brackets (landing PillarEyes language).
- A rotating "what it's checking" caption during grading: structural integrity →
  authenticity vs original → wear/scratch detection → serial/spec match.
- Ordered checklist with live status: Grading photos (per-photo "photo i of n") →
  Comparing to original listing → Estimating ₹ price → Assembling Health Card.
- Terminal `Panel` chrome ("inspection.live · REC ●"); honest — driven by the real
  grade→price→card awaits, no fabricated latency.
- Per-stage error → inline message + Try again / Back to photos.

## Health Card layout (3e — showpiece, buyer-facing)
A premium `HealthCard` component (reused in review preview + confirmed), echoing the
landing PillarTrust card:
- Header: "Product Health Card" + card id (mono), a glowing **VFD** authenticity ring
  when verified.
- Verdict row: grade chip + confidence.
- Key honest detected issues (top few).
- Authenticity: regex-verified badge + reference "product match" signal.
- Price block: listing **₹** price + discount vs original.
- Condition summary (one line, buyer-facing).
- Event timeline: Graded → Priced → [Verified] → Issued (gold-dot rail).
- Stamped footer (model + timestamp) + shareable `healthCardUrl` (copy).
- Rotated/glow treatment for the "showpiece" feel.

## Review & confirm (3f)
a. Verdict (grade + confidence + summary). b. **Reference conclusion (hybrid):** user's
live photos + one "as listed on Amazon" cover + authenticity match %, changed-from-
original, spec checks, deviation→grade (no raw original grid). c. Detected issues.
d. ₹ price + glass-box factors + rationale + discount vs original. e. **Health Card
preview** (the showpiece component). f. Projected impact (EcoCredits + CO₂, derived).
g. One confirm: "List it for a second life" → create listing (status Listed) → confirmed.

## Error / fallback UX
- Grade fails → analysis error + Try again / Back to photos. Partial photo failures
  handled server-side. Pricing fails → Try again / Back. Health-card (pure) → retry.
- Reference unavailable → conclusion section shows graceful "reference check
  unavailable", grade still stands. No silent failures.

## Acceptance criteria
1. My Items shows exactly the two real shoes; no condition shown pre-grading.
2. Clicking Sell → item-detail screen; "Start selling" → live upload (not pre-filled).
3. Analysis looks alive: per-photo scan + rotating checks + reference run; produces
   grade/confidence/issues/summary + referenceComparison.
4. Every price/figure in the app is ₹; pricing-service clamps + fallback are INR; no
   USD/`$`/`en-US` currency left (grep clean).
5. Health Card renders as a premium buyer-facing showpiece with the specified details.
6. Review shows the hybrid reference conclusion + one confirm; listing created only on
   confirm and appears in My Listings.
7. Impact (EcoCredits + CO₂) derived from real INR value + category math.
8. `tsc` + `next build` clean; matches the homepage aesthetic; no new palette.

## Resolved decisions (approved in chat)
- Q1: Two items — **Under Armour Charged Assert** (`demo/original`, named honestly to the
  image) + **Puma Slipstream** (existing assets). Dummies deleted.
- Q2: **Hybrid** reference display (user photos + one cover + conclusion; no raw grid).
- Q3: INR — `Money.currency='INR'`; clamp ₹100–₹5,00,000; category fallback table above;
  UA ₹6,999 / Puma ₹8,999; LLM prompts INR; EcoCredits rebalanced `co2×3 + rupees×0.002`.
- Defaults accepted: item-detail screen first; assets copied to `/demo/ua-charged/*`;
  currency audit covers legacy `/sell/*` + return Money constructors.

## Open questions
None outstanding — will flag in chat if anything new surfaces mid-build.
```
