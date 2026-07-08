# Spec 025 — Angle-aware doorstep grading

## Goal
Wire the `ai-grading` module's per-category **capture spec** through the whole
return flow so the AI actually asks the user for the photos it was trained to
diagnose (Sole/Top/Heel, Front/Back/Edges, …) and flags a missing **required**
angle for in-person verification. Before this, the upload step was a generic
"drop up to 5 photos, optional" box: the angle intelligence existed only inside
`ai-grading/config.py` (`CATEGORY_CAPTURE`) and `serve.py`'s `/grade` endpoint,
and nothing reachable from the app ever used it — so grading felt "the same as
before."

## Scope
**In:**
- A shared capture spec (mirror of `ai-grading/config.py`) as the single source
  of truth for required/optional angles per category.
- Angle-tagged photo capture UI in the return flow (one slot per angle).
- Angle-tagged grade request end-to-end (web → `/api/grade`).
- App-side "missing required angle → needs in-person review" gate, surfaced in
  the grade result and the doorstep-assessment card.

**Out (unchanged):**
- The trained model's own weights/serving. Photos are still graded per-image via
  the existing `VlmProvider` seam (trained-local `/assess`, NVIDIA fallback). We
  deliberately do NOT call `serve.py`'s `/grade` endpoint — doing so would bypass
  `GradingService`'s calibration/abstain/health-card pipeline and break the VLM
  fallback (NVIDIA has no `/grade`). The angle aggregation + missing-required gate
  live in TS instead, giving the same behavior fallback-safe.
- The Sell flow (`/api/sell/*`) — untouched.

## Affected files
- `packages/shared/src/grading-capture.ts` *(new)* — `GradingCategory`,
  `CaptureAngle`, `CATEGORY_CAPTURE`, `toGradingCategory`, `captureSpecFor`,
  `requiredAngles`, `missingRequiredAngles`, `angleLabels`, `AngleImage`.
- `packages/shared/src/index.ts` — export the new module.
- `packages/shared/src/return.ts` — `ReturnGradingResult` gains optional
  `needsReview`, `missingAngles`, `captureGuidance`.
- `apps/api/src/routes/grade.ts` — accept `images:[{angle,imageBase64}]` (legacy
  `photos:string[]` still tolerated), resolve the category, and fold the
  missing-required-angle gate into the response.
- `apps/web/src/lib/api-client.ts` — `gradeReturnItem` now sends angle-tagged
  images + category.
- `apps/web/src/components/return/BuyerStep1.tsx` — per-angle capture slots
  (label, Required/Optional badge, diagnostic hint) driven by the capture spec;
  exports `CapturedAngle`.
- `apps/web/src/components/return/ReturnFlowClient.tsx` — thread `CapturedAngle[]`.
- `apps/web/src/components/return/BuyerStep2Pickup.tsx` — send angle-tagged
  images to the API; render the missing-angle review banner.

## Data contracts
- `CaptureAngle { id, label, required, diagnostic }`, keyed by
  `GradingCategory = 'footwear' | 'electronics' | 'apparel' | 'home'`.
- Category vocabularies (`ItemCategory`, `MockOrder.category`, SKU-derived) are
  folded onto the 4 buckets via `toGradingCategory` (e.g. `fashion→apparel`,
  `sports→footwear`, `kitchenware/books→home`, `toys→electronics`; unknown →
  `electronics`). Web and API use the SAME resolver so required-angle sets never
  drift (the web sends its resolved category; the API trusts it, else falls back
  to the SKU mapping).
- `/api/grade` request: `{ images:[{angle,imageBase64}], reason, sku?, category? }`.
- `ReturnGradingResult` adds `needsReview?`, `missingAngles?` (labels),
  `captureGuidance?`.

## UI / behavior
- **Step 1:** the photo card renders one slot per angle for the item's category.
  Required angles are badged. A live amber hint lists any missing required angles
  once the user has added at least one photo. Photos remain optional overall
  (doorstep grading is still the concept) — a skipped required angle just routes
  to in-person verification rather than blocking submission.
- **Step 2:** the doorstep-assessment card shows a "verified in person at pickup"
  banner when `missingAngles` is non-empty.

## Acceptance criteria
- `pnpm -r typecheck` passes (shared/api/web). ✅
- `POST /api/grade` with an angle-tagged body returns a grade with
  `needsReview:true` + `missingAngles:["Back"]` + guidance when a required angle
  is absent; legacy `photos` bodies still succeed; malformed bodies → 400. ✅
  (verified live against the running API.)
- The return upload screen shows category-specific angle slots instead of one
  generic dropzone.

## Resolved decisions
- **Orchestrate angles in TS, not via `serve.py /grade`** — keeps the glass-box
  `GradingService` pipeline and the VLM fallback intact (see Scope/Out).
- **Don't hard-block on missing required angles** — preserves the "grade at the
  doorstep" product concept; the gate degrades to in-person verification.

## Notes — running the trained grader (unchanged, still opt-in)
The trained head only grades if `ai-grading/serve.py` is running and the API
points at it (`GRADING_PROVIDER=trained-local`, `GRADING_MODEL_URL=…:8000`).
Otherwise the API falls back to the hosted VLM (or mock). This spec makes the
angle experience work regardless of which provider answers.
