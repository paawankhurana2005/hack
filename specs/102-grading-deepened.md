# 102 — Grading Deepened (Phase 1)

## Goal
Make perception **structured, calibrated, and category-aware** — so grading feels
like real CV and produces signals rich enough to drive pricing (P2) and routing
(P3) — while keeping the deterministic worst-angle aggregation spine. The design
rule holds: **the model perceives; deterministic code aggregates, calibrates, and
decides.** Every model call still has a deterministic fallback.

## Scope
**In:** structured multi-task per-image output; a per-category defect rubric;
confidence calibration + an abstain band; a real VLM-grounded authenticity/reference
check; closed-loop capture guidance; feature-vector enrichment; eval for calibration.
**Out (later phases):** the pricing regressor (P2), EV routing (P3), the return-risk
classifier (P4), image-embedding similarity / Textract OCR / A2I queue (P6).

## What shipped

### Contracts (shared, additive — nothing changed shape)
- `grading.ts`: `IssueSeverity`, `PhotoQuality`, `DetectedIssue {type, severity,
  region}`; `GradingResult` gains optional `structuredIssues`, `qualityScore`,
  `needsReview`, `captureGuidance`. The flat `detectedIssues: string[]` is still
  always populated (flattened from structured issues) for back-compat.
- `grading-rubric.ts` (new): `CATEGORY_RUBRIC` (per-`ItemCategory` defect taxonomy +
  inspection regions), `SEVERITY_ORDINAL`/`severityToOrdinal`,
  `calibrateConfidence(p, T)` (temperature scaling on the logit), the pinned
  `CONFIDENCE_TEMPERATURE` (grid-fit on the seed), `ABSTAIN_THRESHOLD`,
  `needsReview()`, and `PHOTO_QUALITY_SCORE`/`photoQualityScore`.
- `features.ts`: `FeatureVector` gains `maxIssueSeverity`, `severeIssueCount`,
  `photoQualityScore`, `photoCount` (all sourced from the model), populated by
  `buildFeatureVector` and documented in `FEATURE_SPECS`.

### Perception (api) — model produces richer inputs only
- `nvidia-provider.ts`: the prompt is **conditioned on the category rubric** (told the
  relevant issue types + regions) and now asks for structured JSON:
  `{grade, confidence, issues:[{type,severity,region}], photoQuality, summary}`.
  Defensive parse + one retry kept; coarse-confidence fallback kept; structured issues
  also flattened to `detectedIssues` strings.
- `grading-service.ts`: **deterministic aggregation, unchanged spine** — overall grade
  = worst angle; structured issues = de-duped union keyed by `type+region` keeping the
  worst severity; confidence = mean. Then: **calibrate** the mean → set the output
  `confidence` to the calibrated value, decide `needsReview` against the abstain band,
  compute a mean `qualityScore`, and emit **capture guidance** when photos are poor
  (quality < 0.6) or thin (<2 angles) or the grade is low-confidence. ≥1 image still
  yields a result. `aggregate()` stays exported + raw-confidence so the eval measures
  the real spine.

### Authenticity / reference diff made real (api)
- `ReferenceComparator.compare` is now **async**. `VlmReferenceComparator` (new) sends
  the user's primary photo + the original listing's known specs to the VLM, asking it
  to confirm the same product, list deviations, and **read any serial/model code** —
  returning a real `authenticityConfidence` and reconciled `specMatches` (source
  `vlm-diff`). Routed through the `callModel` choke point with the deterministic
  `mockComparison` (source `mock`) as the **required fallback**. Wired in `index.ts`.

### Web (additive, low-risk)
- `review-step.tsx`: a `needsReview` / capture-guidance banner (with a photo-quality
  badge), and the detected-issues card now shows **severity badges** when structured
  issues are present (falls back to the string list otherwise). The scripted demo item
  and any older `GradingResult` still render (new fields optional).

### Eval (offline, synthetic, labelled)
- New synthetic **calibration seed** ((confidence, was-correct) pairs, mildly
  over-confident) + `calibrationMetrics`: ECE (5-bin) + Brier **before/after**
  temperature scaling, plus a **grid search** over T that picked the pinned
  `CONFIDENCE_TEMPERATURE`. Grading abstention now uses the **calibrated** confidence,
  matching the service.

## Acceptance criteria — all met
1. `pnpm -r typecheck` — green (shared, api, web; strict, no `any`). ✅
2. `pnpm eval` (no key) — `(synthetic seed)`:
   - Grading aggregation (N=12): exact 100%, within-1 100%, **abstention 25%** (now
     calibrated).
   - **Confidence calibration (N=23): pinned T=1.9 (= grid-best); ECE 0.099 → 0.024
     (−75%); Brier 0.225 → 0.218.**
   - Pricing MAE ₹186 / routing 100% (unchanged); return-risk `n/a (P4)`. ✅
3. `pnpm --filter @reloop/web build` — green; seller dashboard untouched. ✅
4. `POST /api/sell/pipeline` (real key + real image) — returns structured issues with
   severity + region, a calibrated `confidence`, `qualityScore`, and a `vlm-diff`
   reference comparison with a real authenticity confidence. ✅

## Edge cases handled
Blurry/dark/occluded photo → `photoQuality` low → `captureGuidance` asks for a better
shot (no confident grade on bad input). 1-photo vs multi-photo → completeness in the
features + a "more angles" ask. Model garbles grade → coarse fallback table. Reference
call fails / no photo → deterministic mock comparison. Low calibrated confidence →
`needsReview` (the Phase-6 HITL seam). Counterfeit/tampered serial → the VLM reads the
serial into `changedFromOriginal` and can drop `authenticityMatch`/confidence.

## Deferred to Phase 6
Image-embedding cosine similarity (Rekognition/Bedrock) for the reference diff;
Textract for serial OCR (VLM-read serial is the stand-in now); the A2I human-review
queue that consumes `needsReview`; full capture-guidance UI loop (re-capture button).

## Production path (honest)
Bedrock (Nova/Claude vision) behind the same `VlmProvider`; the `calibrate` hook hosts
conformal/temperature scaling re-fit on real grading outcomes; Rekognition custom
labels for defect detection; Textract for OCR; A2I for the abstain queue.
