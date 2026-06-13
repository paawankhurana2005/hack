# Spec 002 — Return Flow (Frontend, Mock Data)

## Goal

Replace the placeholder return flow with a complete, demoable 5-step return experience scaffolded with believable mock data. No real AI, no real API. A judge clicking through must believe the system is real.

The invariant: the customer experience is identical to a standard Amazon return — same refund, same timing, same drop-off. The intelligence is invisible. If the UI makes the user feel like extra work or turns them into a seller, the design is wrong.

## Scope

### In scope
- `packages/shared/src/return.ts` — all new return-flow type contracts
- `packages/shared/src/index.ts` — re-export new types
- `apps/web/src/app/return/page.tsx` — rewritten as order selector
- `apps/web/src/app/return/[orderId]/page.tsx` — new 5-step state machine page
- `apps/web/src/app/return/[orderId]/layout.tsx` — thin layout (no stepper; stepper is in page.tsx)
- `apps/web/src/app/return/layout.tsx` — simplified (remove stepper; keep border/header stripe only)
- `apps/web/src/lib/mocks/return-flow.ts` — all mock functions and mock orders
- Step components in `apps/web/src/components/return/`:
  - `Step1Reason.tsx`
  - `Step2Grading.tsx`
  - `Step3Bridge.tsx`
  - `Step4Handoff.tsx`
  - `Step5Done.tsx`

### Out of scope (explicitly)
- Real Claude API calls
- Real routing logic or backend endpoints
- Authentication or sessions
- Seller dashboard, Prevention pillar
- Real maps or QR code generation
- Payment / refund processing
- The sell flow (untouched)
- The old flat return pages — deleted in this spec

## Affected files

| Action | File |
|--------|------|
| Create | `packages/shared/src/return.ts` |
| Update | `packages/shared/src/index.ts` |
| Rewrite | `apps/web/src/app/return/page.tsx` |
| Create | `apps/web/src/app/return/[orderId]/page.tsx` |
| Create | `apps/web/src/app/return/[orderId]/layout.tsx` |
| Simplify | `apps/web/src/app/return/layout.tsx` |
| Create | `apps/web/src/lib/mocks/return-flow.ts` |
| Delete | `apps/web/src/app/return/grading/page.tsx` |
| Delete | `apps/web/src/app/return/bridge/page.tsx` |
| Delete | `apps/web/src/app/return/handoff/page.tsx` |
| Delete | `apps/web/src/app/return/done/page.tsx` |
| Create | `apps/web/src/components/return/Step1Reason.tsx` |
| Create | `apps/web/src/components/return/Step2Grading.tsx` |
| Create | `apps/web/src/components/return/Step3Bridge.tsx` |
| Create | `apps/web/src/components/return/Step4Handoff.tsx` |
| Create | `apps/web/src/components/return/Step5Done.tsx` |

## Data contracts

All types below go in `packages/shared/src/return.ts` and are re-exported from the package index. They are intentionally distinct from the scaffold-era `GradingResult`/`RoutingDecision` in `grading.ts`/`routing.ts` (those remain for the sell flow). The return-flow types carry a `Return` prefix on the exported names to avoid collision.

```ts
// packages/shared/src/return.ts

export type ReturnReason =
  | "didnt_fit"
  | "changed_mind"
  | "duplicate_gift"
  | "defective"
  | "stopped_working"
  | "arrived_damaged"
  | "wrong_item"
  | "counterfeit"
  | "not_as_described";

export interface ReturnFlowState {
  orderId: string;
  reason: ReturnReason;
  photos: string[];             // base64 or object URLs

  gradingResult?: ReturnGradingResult;
  routingDecision?: ReturnRoutingDecision;
  handoff?: ReturnHandoffDetails;

  currentStep: 1 | 2 | 3 | 4 | 5;
}

export interface ReturnGradingResult {
  grade: "A" | "B" | "C" | "Salvage" | null; // null = unresolved (warehouse fallback)
  confidence: number;           // 0–1
  defects: string[];
  authenticityMatch: boolean;
  wardrobingFlag: boolean;
  functionallyVerifiable: boolean;
  rawReason: ReturnReason;
}

export interface ReturnRoutingDecision {
  decision:
    | "local_resale"
    | "refurbish"
    | "donate"
    | "recycle"
    | "warehouse"
    | "return_to_seller";
  reasoning: string;            // human-readable trace
  co2SavedKg: number;
  dwellBudgetHours: number;
  sellerType: "1P" | "3P";
  fallbackChain: ReturnRoutingDecision["decision"][];
}

export interface ReturnHandoffDetails {
  method: "locker" | "agent_pickup" | "hub_dropoff";
  locationName: string;
  locationAddress: string;
  qrCode: string;               // mock string
  confirmationId: string;
  scheduledAt?: string;         // ISO date string
}

// Scenario types used by mock functions (passed as query params for demo switching)
export type GradingScenario =
  | "high_confidence"
  | "low_confidence"
  | "auth_mismatch"
  | "wardrobing"
  | "unverifiable";

export type RoutingScenario =
  | "local_resale"
  | "refurbish"
  | "donate"
  | "recycle"
  | "warehouse"
  | "return_to_seller";

export type HandoffScenario =
  | "locker"
  | "agent_pickup"
  | "hub_dropoff"
  | "no_locker"
  | "locker_full";

export interface MockOrder {
  orderId: string;
  productName: string;
  imageUrl: string;
  orderDate: string;            // ISO date string
  priceCents: number;
  currency: string;
  sku: string;
  category: "electronics" | "apparel" | "kitchenware";
}
```

## UI / behavior

### Routes

| Route | File | Role |
|-------|------|------|
| `/return` | `app/return/page.tsx` | Order selector — pick 1 of 3 mock orders |
| `/return/[orderId]` | `app/return/[orderId]/page.tsx` | 5-step state machine |

Old flat routes (`/return/grading`, `/return/bridge`, `/return/handoff`, `/return/done`) are deleted and return 404.

---

### Architecture: the state machine

`app/return/[orderId]/page.tsx` is a `'use client'` component that owns `ReturnFlowState` in `useState`. It renders one step component at a time based on `currentStep`.

Each step component receives:

```ts
interface StepProps {
  flowState: ReturnFlowState;
  onNext: (partial: Partial<ReturnFlowState>) => void;
}
```

The parent merges partials and advances `currentStep` on each `onNext` call. Steps 2 and 3 call async mock functions on mount — no button to start them. Steps 1, 4, 5 are pure UI.

The existing `StepIndicator` component (untouched) is rendered by `[orderId]/page.tsx` directly, receiving `current={flowState.currentStep - 1}`.

`app/return/layout.tsx` is simplified: remove the `StepIndicator` and the pathname-matching logic (which targeted the now-deleted flat routes). Keep the `'use client'` import, the orange "Return flow" label stripe, and the border-bottom wrapper div.

`app/return/[orderId]/layout.tsx` is a thin server component — just `{ children }` passthrough with no additional chrome (the stepper is in page.tsx, the stripe is in the parent layout).

---

### Step 1 — Reason (pure UI)

**Renders:**
- Order summary card: product name, placeholder image (colored div with initials), order date formatted as "Ordered DD Mon YYYY", price formatted as `₹X,XXX` (priceCents ÷ 100).
- Return reason selector: radio group with 9 options and human-friendly labels:
  - `didnt_fit` → "Didn't fit"
  - `changed_mind` → "Changed my mind"
  - `duplicate_gift` → "Received as a gift / duplicate"
  - `defective` → "Item is defective"
  - `stopped_working` → "Stopped working"
  - `arrived_damaged` → "Arrived damaged"
  - `wrong_item` → "Received wrong item"
  - `counterfeit` → "Suspected counterfeit"
  - `not_as_described` → "Not as described"
- Photo upload area: drag-and-drop or click-to-upload. Min 2 / max 5 photos. Thumbnails shown after upload. File input accepts `image/*`.
- Primary CTA: "Continue" (disabled until a reason is selected).

**Edge cases:**

| Trigger | UI response | `onNext` effect |
|---------|-------------|-----------------|
| No photos uploaded | Soft warning banner: "Without photos, your item will be graded at the warehouse. Your refund isn't affected." CTA label becomes "Continue without photos". | `photos: []`, `currentStep: 4`, `routingDecision: { decision: "warehouse", reasoning: "Graded at warehouse (no photos provided)", co2SavedKg: 0, dwellBudgetHours: 72, sellerType: "1P", fallbackChain: [] }` |
| Reason = `counterfeit` or `not_as_described` | Amber-bordered inline alert: "This return will be escalated for seller review. Your refund is protected." CTA = "Submit escalation". | `currentStep: 5`, `routingDecision: { decision: "return_to_seller", reasoning: "Escalated for seller review per Amazon policy.", co2SavedKg: 0, dwellBudgetHours: 0, sellerType: "3P", fallbackChain: [] }` |
| Reason = `wrong_item` | Inline info note (navy-700 bg): "This item will be returned to inventory. Your refund is protected." Proceed through Steps 2–4. | Mock routing will always return `warehouse`. |
| Reason = `arrived_damaged` | Inline info note: "A shipping claim will be opened on your behalf." Proceed through Steps 2–4. | Mock routing will lean toward `recycle`. |

---

### Step 2 — Doorstep Grading (async)

**On mount:** immediately call `mockGradeItem(reason, photos, gradingScenario)`. No button.

**Loading state (1500–2500ms):** `animate-pulse` skeleton card. Copy: "Inspecting your item…" / sub-copy "AI is reviewing your photos".

**On resolve — result card:**
- Grade badge: A = green (#2E8B57), B = yellow (#FFB020), C = amber (#EC7211), Salvage = red (#D14343). All on `bg-navy-800`.
- Defect list (bulleted, or "No defects detected" if empty).
- Authenticity row: "✓ Matches product records" (green text) or "⚠ Mismatch detected" (amber text).
- Confidence bar: `<div>` with percentage width. Label: ≥0.8 = "High", 0.6–0.8 = "Medium", <0.6 = "Low".
- If `wardrobingFlag = true`: muted sub-line "Condition assessed as [grade] based on photos." (non-accusatory; refund is unaffected).
- CTA: "Continue".

**Edge cases:**

| Condition | First occurrence | Second occurrence (retryCount === 1) |
|-----------|-----------------|--------------------------------------|
| `confidence < 0.6` | Show retake prompt: "We need a clearer photo to complete grading. Please retake photo." Re-upload clears photos and calls mock again with same scenario. | "We'll complete grading at the warehouse. Your return is unaffected." `gradingResult.grade = null`, advance to Step 4 with `decision: "warehouse"`. |
| `authenticityMatch = false` | Amber left-border card: "These photos don't appear to match your product. Your return has been flagged for review." | — (advance normally; routing forces `warehouse`) |
| `functionallyVerifiable = false` | Info note on grade card: "Functional condition not verified by visual grading. Item will be tested before resale." | — (advance; routing forces `refurbish`) |
| Mock throws | "Unable to grade at this time. Proceeding with standard return." | — (advance to Step 4 with `decision: "warehouse"`) |

---

### Step 3 — Intelligent Bridge (async)

**On mount:** immediately call `mockRouteItem(gradingResult, reason, sku, routingScenario)`.

**Loading state (2000ms):** pulse skeleton. Copy: "Finding the best path for your item…" / sub-copy "Comparing local demand, handling costs, and carbon impact."

**On resolve — the demo centrepiece:**

| Field | Render |
|-------|--------|
| Decision badge | Full-width, prominent. Label + color: `local_resale`=green, `refurbish`=yellow, `donate`=blue, `recycle`=teal, `warehouse`=muted navy, `return_to_seller`=orange |
| Reasoning trace | Verbatim `reasoning` string, styled as a navy-700 quote card with left border |
| CO₂ saved | Green pill badge "X.Xkg CO₂ saved". Only shown if `co2SavedKg > 0` |
| Fallback chain | Muted small text: "If no buyer in Xh → [next] → [next]". Built from `fallbackChain` array |
| 3P note | If `sellerType === "3P"` and `decision !== "return_to_seller"`: small muted note "Seller has opted into local routing." |

CTA: "Continue".

**Edge cases:**
- `decision === "return_to_seller"` (3P seller not opted in): info card "This item will be returned to the seller per their policy. Your refund is unaffected."
- `decision === "recycle"` (all paths blocked): "This item will be responsibly recycled. No landfill." with green leaf glyph.
- Mock throws: catch → warehouse fallback. Never block the return.

All 6 routing outcomes must be triggerable via the `routingScenario` query param.

---

### Step 4 — Handoff (pure UI)

**Normal path** (non-warehouse): renders from `flowState.handoff`.

| `method` | Primary copy |
|----------|-------------|
| `locker` | "Drop off at [locationName], [locationAddress]. Your item will be collected within 24 hours." |
| `agent_pickup` | "An Amazon agent will collect your item on [scheduledAt formatted as 'DD Mon, h:mm a']. No extra steps needed." |
| `hub_dropoff` | "Drop off at [locationName], [locationAddress]. Open 9am–8pm." |

All three show:
- QR code block: bordered `bg-navy-700` div, `confirmationId` rendered in monospace centered inside it (simulate QR placeholder).
- Confirmation ID: large monospace text, visually distinct.
- Static map placeholder: grey rectangle (`bg-navy-700`) labeled "Map" in muted text.

CTA: "I've arranged my drop-off" → `onNext({ currentStep: 5 })`.

**Warehouse path** (`routingDecision.decision === "warehouse"`, no `handoff` details): "Hand your item to the Amazon delivery agent when they arrive for your standard return pickup." No QR, no map. CTA: "Done" → `onNext({ currentStep: 5 })`.

**Fallback notes (shown as muted banners above the main copy):**
- Scenario `no_locker`: `mockHandoff` returns `agent_pickup`. Banner: "No lockers available nearby — an agent will collect from you."
- Scenario `locker_full`: `mockHandoff` returns `hub_dropoff`. Banner: "Nearest locker is full — drop off at this hub instead."

---

### Step 5 — Done (pure UI)

- Refund status card: "Your refund of ₹[priceCents÷100 formatted] is being processed. Expected by [today + 5 days, formatted as 'DD Mon YYYY']."
- Item destination line — copy keyed on `routingDecision.decision`:

| `decision` | Copy |
|-----------|------|
| `local_resale` | "Your [productName] is headed to a new home nearby." |
| `refurbish` | "Your item is going to be professionally refurbished." |
| `donate` | "Your item will be donated to a local charity." |
| `recycle` | "Your item will be responsibly recycled." |
| `warehouse` | "Your item is being processed at our returns center." |
| `return_to_seller` | "Your item is being returned to the seller." |

- CO₂ badge: "You saved [co2SavedKg]kg of CO₂ on this return." Only if `decision` is `local_resale` or `donate` AND `co2SavedKg > 0`.
- Health Card teaser: only if `decision === "local_resale"`. Small navy-700 card with lock icon: "A verified condition report has been created for your item's next owner."
- CTA: "Return to Orders" → `/home`.

---

### Mock data — `apps/web/src/lib/mocks/return-flow.ts`

**Mock orders:**

```ts
export const mockOrders: MockOrder[] = [
  {
    orderId: "ORD-1001",
    productName: "Sony WH-1000XM5 Wireless Headphones",
    imageUrl: "",   // placeholder div used in UI
    orderDate: "2026-05-28T00:00:00Z",
    priceCents: 249900,
    currency: "INR",
    sku: "B09XS7JWHH",
    category: "electronics",
  },
  {
    orderId: "ORD-1002",
    productName: "Men's Slim Fit Oxford Shirt",
    imageUrl: "",
    orderDate: "2026-06-01T00:00:00Z",
    priceCents: 129900,
    currency: "INR",
    sku: "B08ZYXKLMN",
    category: "apparel",
  },
  {
    orderId: "ORD-1003",
    productName: "Prestige 5L Pressure Cooker",
    imageUrl: "",
    orderDate: "2026-06-05T00:00:00Z",
    priceCents: 89900,
    currency: "INR",
    sku: "B07PQRSTUV",
    category: "kitchenware",
  },
];
```

**`mockGradeItem(reason, photos, scenario?): Promise<ReturnGradingResult>`** — 1500–2500ms delay. Scenario → output mapping:

| Scenario | grade | confidence | wardrobingFlag | authenticityMatch | functionallyVerifiable |
|----------|-------|-----------|----------------|------------------|----------------------|
| `high_confidence` (default) | "A" | 0.92 | false | true | true |
| `low_confidence` | "B" | 0.45 | false | true | true |
| `auth_mismatch` | "C" | 0.78 | false | false | true |
| `wardrobing` | "C" | 0.81 | true | true | true |
| `unverifiable` | "B" | 0.80 | false | true | false |

**`mockRouteItem(gradingResult, reason, sku, scenario?): Promise<ReturnRoutingDecision>`** — 2000ms delay. Scenario maps to `decision`; each has a canned `reasoning` string, `co2SavedKg`, `dwellBudgetHours`, `sellerType`, and `fallbackChain`. Example for `local_resale`:

```ts
{
  decision: "local_resale",
  reasoning: "Value ₹2,499 exceeds local handling cost ₹380. 8 buyers within 4km. Reselling locally saves 2.4kg CO₂ vs warehouse round-trip.",
  co2SavedKg: 2.4,
  dwellBudgetHours: 48,
  sellerType: "1P",
  fallbackChain: ["donate", "recycle"],
}
```

All 6 scenarios have similarly detailed reasoning strings.

**`mockHandoff(decision, scenario?): ReturnHandoffDetails | null`** — sync. Returns `null` for `decision === "warehouse"`. Otherwise returns realistic mock with Bengaluru-area location names. Scenarios `no_locker` and `locker_full` override `method` to `agent_pickup` and `hub_dropoff` respectively.

**Demo scenario switching:** The `[orderId]/page.tsx` reads `?grading=<GradingScenario>&routing=<RoutingScenario>&handoff=<HandoffScenario>` from `useSearchParams` and passes them to the mock functions. This allows live demo switching without code changes.

## Acceptance criteria

- [ ] `/return` renders an order selector with 3 mock orders; clicking one navigates to `/return/[orderId]`
- [ ] All 5 steps render and advance correctly via the `onNext` / `Partial<ReturnFlowState>` merge pattern
- [ ] Skipping photos advances directly to Step 4 (`decision: "warehouse"`), skipping Steps 2–3
- [ ] `counterfeit`/`not_as_described` reasons advance directly to Step 5 (escalation done screen)
- [ ] Steps 2 and 3 show `animate-pulse` skeleton on mount; resolve after mock delay without any button press
- [ ] Low-confidence grading shows retake prompt once; second low-confidence falls back to warehouse
- [ ] All 6 routing decision variants render with correct badge color, reasoning trace, and CO₂ badge
- [ ] All 3 handoff methods (`locker`, `agent_pickup`, `hub_dropoff`) render correctly
- [ ] Warehouse path in Step 4 shows standard pickup copy — no QR, no map
- [ ] Step 5 destination copy varies correctly across all 6 `decision` values
- [ ] CO₂ badge appears only for `local_resale` and `donate` with `co2SavedKg > 0`
- [ ] Health Card teaser appears only for `local_resale`
- [ ] Mock throw in Step 2 or 3 degrades to warehouse path — return is never blocked
- [ ] `StepIndicator` `current` prop equals `flowState.currentStep - 1` at all times
- [ ] No `any` types; all mock return types match `packages/shared/src/return.ts` exactly
- [ ] Old flat return pages are deleted; `/return/grading` etc. return 404
- [ ] `?grading=wardrobing&routing=donate` query params change grading/routing scenarios correctly
- [ ] Flow is demoable end-to-end with zero real API calls

## Open questions

1. **Mock images** — `imageUrl` is empty string in mock orders. Recommendation: render a solid-color `<div>` with the product category initials as text (no external image dependencies). Confirm before implementing if a different approach is preferred.

2. **INR formatting** — Prices are in paise (`priceCents`). Recommendation: format as `₹X,XXX` by dividing by 100 and using `toLocaleString("en-IN")`. Confirm if USD or a different locale is preferred for the demo.

3. **`retryCount` mechanism for low-confidence** — The spec calls for re-prompting once on low confidence. Recommendation: track `retryCount` in local state within `Step2Grading.tsx`. The second call to `mockGradeItem` should force `low_confidence` scenario again (to simulate persistent failure) regardless of the URL query param. Confirm if a different retry simulation approach is preferred.
