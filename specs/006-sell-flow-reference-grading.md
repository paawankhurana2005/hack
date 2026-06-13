# Spec 006 — Sell flow: capture → AI grading w/ original-listing reference → pricing → Health Card → review & confirm

**Status:** SHIPPED 2026-06-13. `tsc` + `next build` clean (20 routes); live API test
confirmed real grading returns `referenceComparison`.

> Numbering: highest on disk is 005, so this is **006**.

### Build notes / deviations
- **Pricing-failure path simplified** to *Try again / Back to photos* (no "continue
  without price"). The Health Card service requires pricing to assemble, so a
  price-less card would need a contract change beyond this spec's scope — retry is
  the honest behavior. All other fallbacks shipped as specified.
- **"Graded N of M photos" note dropped:** the grading contract doesn't report how
  many photos succeeded (partial failures are aggregated server-side), so there's no
  honest number to show. The server still degrades gracefully on partial failures.
- Added a webpack `extensionAlias` (`.js`→`.ts`) in `next.config.mjs` so the web app
  can do **runtime** (non-type) imports from `@reloop/shared` (needed for `estimateImpact`).

## Goal
Turn "Sell this item" into a complete, item-centric sell experience: capture photos,
grade them with the real VLM, **compare against the item's original Amazon listing
photos + specs** (the differentiator — "it actually checked the real product"),
price it, assemble a Product Health Card, and present a single **Review & Confirm**
hero screen. The casual-seller listing is created **only on confirm**.

Reuses the existing grade / price / health-card services and the established
**server-side sequential per-photo** grading. Adds the reference comparison and an
impact estimate as new contracts in `packages/shared`.

## Scope

### Fix first (in scope)
- Remove **all pre-grading condition** from owned items: drop `conditionHint` from
  the `OwnedItem` type, the mock data, and the My Items cards. Condition is AI
  output from photos, never shown up front. Owned items carry only pre-grading
  facts: title, category, purchase date, original price, description (+ listing
  image + reference assets below).

### In scope
- Move `OwnedItem` into `packages/shared` and extend it with `originalListingImages`
  + `originalSpecs` (the grader's reference).
- New contracts in `packages/shared`: `ReferenceComparison` (on `GradingResult`),
  `GradeReference` (on `GradeRequest`), and a pure `estimateImpact()` (+ `ImpactEstimate`).
- New item-centric flow `/app/sell/[itemId]`: capture → processing → review → confirmed.
- `referenceComparison` produced in the grading-service behind a `ReferenceComparator`
  interface, with a clearly-labeled **deterministic mock** (real visual-diff slots in later).
- Frontend orchestration chaining grade → price → health-card → impact → review,
  with honest loading / partial-failure / fallback states.
- Stub listing creation on confirm, **persisted to a localStorage store** so it
  appears in My Listings.

### Out of scope
- Real marketplace/matching, buyer side, handoff/logistics, agent layer, return flow,
  real auth. Real visual diff against original pixels. Real LCA/carbon model.
- Legacy generic `/sell/*` stays on disk but **unlinked/deprecated** (cleanup later).

## Route tree + screen states
```
/app/sell/[itemId]     NEW  single client orchestrator (phases held in component state)
/app/items             EDIT "Sell" routes here (drops sessionStorage seed)
/sell/*                DEPRECATED  kept on disk, no longer linked
```
`[itemId]` loads the `OwnedItem` from mock by id; unknown id → "item not found" card →
back to My Items.

**Phases (internal state, not separate URLs):**
- `capture` — reference strip (original listing image + key specs so the user sees
  what they're matched against) + photo uploader. Per-photo states: `added →
  compressing → done` (real, client-side compress) and `error` (bad type/too large);
  remove control; 1–4 photos; "Start grading" disabled until ≥1 done.
- `processing` — the "alive" hero. Staged reveal over the **real** calls: per-photo
  grading check-ins → "Comparing against original listing…" → "Pricing…" →
  "Assembling Health Card…". States: `running`, `error` (per stage), `partial`
  (graded N of M photos).
- `review` — the hero screen (layout below). State: `ready`.
- `confirmed` — success; listing created + persisted; link to My Listings.

## Data contracts (all in `packages/shared`)

**Owned item** (`owned-item.ts`, re-exported from index):
```ts
export interface OwnedItem {
  id: ID;
  title: string;
  category: ItemCategory;
  imageUrl: string;                       // primary listing thumbnail (pre-grading fact)
  purchaseDate: string;                   // ISO
  originalPrice: Money;
  description: string;
  originalListingImages: string[];        // original Amazon listing photos (reference)
  originalSpecs: Record<string, string>;  // known specs: model, color, etc. (reference)
  // NOTE: no conditionHint — condition is graded, never pre-set.
}
```

**Reference comparison** (added to `grading.ts`):
```ts
export interface SpecMatch {
  label: string;       // e.g. "Model"
  expected: string;    // from originalSpecs
  observed: string;    // inferred, or "—" if not determinable
  match: boolean;
}
export interface ReferenceComparison {
  authenticityMatch: boolean;        // same product/model as the original listing?
  authenticityConfidence: number;    // 0..1
  changedFromOriginal: string[];     // wear / scratches / missing parts vs factory
  gradeImpact: string;               // plain-English: how deviation shaped the grade
  specMatches: SpecMatch[];
  source: 'mock' | 'vlm-diff';       // honest provenance label for the UI
}
// GradingResult gains:  referenceComparison?: ReferenceComparison;  (optional → legacy-safe)
```

**Grade request reference** (added to `sell.ts`):
```ts
export interface GradeReference {
  originalListingImages: string[];        // URLs (not base64 — small payload)
  originalSpecs: Record<string, string>;
}
// GradeRequest gains:  reference?: GradeReference;
```

**Impact** (new `impact.ts`, pure + documented):
```ts
export interface ImpactEstimate { co2SavedKg: number; ecoCredits: number; }
export function estimateImpact(category: ItemCategory, resaleValue: Money): ImpactEstimate;
```
- `co2SavedKg` = per-category embodied-carbon baseline avoided by reuse vs
  landfill+replacement (kg CO₂e), documented + tunable:
  electronics 25 · home 15 · fashion 8 · sports 6 · toys 4 · books 1 · other 5.
- `ecoCredits = round(co2SavedKg × 3 + resaleDollars × 0.1)`.
- Deterministic, no per-item magic numbers; a real LCA model can replace the table.

## Service-call sequence (frontend orchestration)
1. `POST /api/sell/grade` — `{ draft:{title,category,notes:description}, imagesBase64,
   reference:{ originalListingImages(URLs), originalSpecs } }` → `GradingResult` (now
   with `referenceComparison`). Server stays **sequential per photo**; comparison
   produced by the service's `ReferenceComparator`.
2. `POST /api/sell/price` — `{ draft, grade, detectedIssues }` → `PricingResult`.
3. `POST /api/sell/health-card` — `{ draft, grading, pricing }` → `ProductHealthCard`.
4. Client: `estimateImpact(item.category, pricing.suggestedPrice)`.
5. Assemble review from grade + reference + price + card + impact.

**Backend wiring:** `grading/types.ts` gains `ReferenceComparator` + `ReferenceInput`;
new `MockReferenceComparator` derives the comparison deterministically from the merged
assessment + `reference` (authenticityMatch true unless specs clearly conflict;
`changedFromOriginal` mapped from detectedIssues + sub-`new` grade; `specMatches` from
`originalSpecs`; `source:'mock'`). `GradingService` takes `(provider, comparator)`;
`index.ts` injects both. Existing provider defensiveness (prose retry, unknown-grade
normalization, coarse-confidence fallback) untouched. `reference` absent → comparison omitted.

## Error / fallback UX (no silent failures)
- **All photos fail / grade 502** → processing error state: "We couldn't grade these
  photos" + Try again + Back to photos.
- **Partial** (graded N of M) → proceed, review notes "graded N of M photos".
- **Reference unavailable** (future real provider errors) → omit comparison; review
  shows "Reference check unavailable" instead of section b; grade/price/card still flow.
- **Pricing fails** → inline retry; option to continue without price (Health Card issues
  without `listingPrice`, impact section hidden, honest note).
- **Health-card** (pure assembly) → effectively can't fail; retry if it does.
- **Confirm/listing** localStorage blocked → show notice but still reach confirmed state.

## Review-screen layout (hero — in order)
a. **Verdict** — grade chip + confidence + one-line summary.
b. **Reference comparison** — user photos vs `originalListingImages` side-by-side;
   `changedFromOriginal` called out; `authenticityMatch` badge; `specMatches` rows;
   small "Comparison · {source}" label.
c. **Detected issues** — de-duped honest list (brand dot rows).
d. **Price + why** — `suggestedPrice`, discount vs `originalPrice`, `factors[]` rows,
   `rationale` (trace Panel).
e. **Health Card preview** — buyer-facing card: grade + authenticity badge (if verified),
   summary, `listingPrice`, history timeline.
f. **Projected impact** — EcoCredits + CO₂ saved from `estimateImpact`, labeled derived.
g. **One confirm** — "List it for a second life" → create + persist listing → `confirmed`.

Authenticity: Health Card `authenticityVerified` stays **regex-based** (model/serial,
≥4-digit run); `referenceComparison.authenticityMatch` is shown separately in (b) as
the "matches the real product" signal.

## Affected files (planned, on approval)
- **shared:** `owned-item.ts` (new), `grading.ts` (+ReferenceComparison), `sell.ts`
  (+GradeReference on GradeRequest), `impact.ts` (new), `index.ts` (re-exports).
- **api:** `services/grading/types.ts` (+ReferenceComparator), `mock-reference-comparator.ts`
  (new), `grading-service.ts` (call comparator), `routes/sell.ts` + `index.ts` (inject,
  pass `reference`).
- **web:** `app/app/sell/[itemId]/page.tsx` (new orchestrator) + phase components
  (`Capture`, `Processing`, `Review`, `Confirmed`) under `components/sell/`;
  `lib/listings-store.ts` (new, localStorage); `mock/owned-items.ts` (drop conditionHint,
  add reference assets, import shared type); `mock/casual-listings.ts` (merge with store);
  `app/app/items/page.tsx` (drop conditionHint badge; Sell → `/app/sell/[itemId]`);
  `app/app/listings/page.tsx` (read store + seed); `lib/api-client.ts` (pass `reference`).

## Acceptance criteria
1. No owned item shows any condition before grading; "Sell" opens `/app/sell/[itemId]`.
2. Capture enforces 1–4 image-type photos with real per-photo compress states; the
   reference strip shows the original listing image + key specs.
3. Grading uses one `/api/sell/grade` call (server sequential); review shows the real
   grade, confidence, summary, de-duped issues, and the **reference comparison**
   (authenticity + changedFromOriginal + spec rows) labeled with its source.
4. Pricing + Health Card echo the grade; price/factors/rationale and a buyer-facing
   card render; impact (EcoCredits + CO₂) is computed by `estimateImpact`, not invented.
5. The review screen presents a–g in order with one confirm action.
6. Confirm creates a `Listed` listing that **appears in My Listings**; nothing is
   created before confirm.
7. Documented fallbacks behave as specified; no silent failures.
8. `tsc` + `next build` clean; visually matches homepage + My Items (no new palette).

## Resolved decisions (approved in chat)
1. New `/app/sell/[itemId]` single client orchestrator; legacy `/sell/*` deprecated/unlinked.
2. `referenceComparison` = labeled deterministic mock behind a `ReferenceComparator`
   interface; original images passed as **URLs**; contract in shared.
3. Keep the one reliable `/api/sell/grade` call; "alive" feel via staged client reveal.
4. Impact = documented per-category CO₂ table + value formula in `packages/shared`.
5. Listing created on confirm and persisted to a localStorage store (shows in My Listings).
6. Defaults accepted: `OwnedItem` → shared; `originalListingImages` reuse `/demo` assets
   with **Puma Slipstream** (top/side/profile/label) as the showcase; card authenticity
   stays regex while reference match is surfaced separately.

## Open questions
None outstanding — all core decisions resolved above. Will flag in chat if anything new
surfaces mid-build.
```
