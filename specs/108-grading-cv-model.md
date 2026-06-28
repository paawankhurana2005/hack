# 108 — Grading CV Model (own the eyes)

## Goal
Replace the "call a VLM API to grade" approach with **our own trained vision model**,
so grading is a real, defensible, edge-deployable moat — not an API wrapper. A
DINOv2-based single-image grader produces structured condition facts; a Siamese-style
embedding comparison runs at inference (returned vs. original Amazon catalog image).
This is the literal answer to *"grade at the source, before the item moves"*: you
cannot do a cloud round-trip per doorstep return at Amazon scale.

The design rule holds: **the model perceives; deterministic code aggregates,
calibrates and decides; the LLM only narrates.** Every model call keeps a deterministic
fallback (the existing VLM/grading-service path stays as the fallback impl).

## Scope
**In:**
- A modular PyTorch package `ml/grading/` (separate from the pnpm/TS monorepo).
- DINOv2 ViT-B/14 backbone (transfer learning, frozen → optional unfreeze) + 4 heads:
  Grade, Confidence, Defect (multi-label + severity), Severity (global damage_score).
- Supervision assembled from ABO (clean) + synthetic damage (exact labels) + MVTec/VisA
  (real defects + masks) + SOP (viewpoint-invariance consistency only).
- Inference module with an `EmbeddingComparator` interface (cosine/euclid/absdiff
  default; Siamese-swappable) + a confidence↔similarity reconciliation rule.
- Eval harness: grade accuracy, macro-F1, defect-F1, confusion matrix, ECE +
  temperature calibration, clean-vs-damaged cosine-similarity distribution.
- CPU smoke test, torch-free unit tests, README.

**Out (later):**
- Real large-scale training run + GPU/SageMaker deployment + Feature Store.
- Marketplace weak-label scrape (StockX/eBay/Poshmark) ingestion.
- Wiring the trained model into `apps/api/grading-service.ts` behind the existing
  `ReferenceComparator`/provider seam (the contract is already compatible).
- A *trained* Siamese network for the comparator (interface is in place).
- Human-in-the-loop review queue (explicitly dropped for this build).

## Affected files
- New: everything under `ml/grading/**` (Python; not part of pnpm workspaces).
- No TS changes. The model output maps 1:1 onto `packages/shared/src/grading.ts`
  `GradingResult` via `schema.GradingOutput.to_grading_result_partial()`.

## Data contracts
No `packages/shared` types added/changed. The Python `schema.py` is kept in lock-step
with `grading.ts` + `grading-rubric.ts`:
- grades = `ConditionGrade` (`new..poor`, ordinal),
- severity continuous [0,1] → `IssueSeverity` buckets (`minor|moderate|severe`),
- defects → canonical taxonomy normalized from the per-category rubric,
- `needsReview` / `qualityScore` / `structuredIssues` all populated by the model.

## UI / behavior
No UI in this iteration (training/eval/inference library + CLI). The structured JSON is
demo-ready and drops into the existing grading pipeline later.

## Acceptance criteria
- `python tests/test_schema.py` passes (contract bridge correct).
- `python scripts/smoke_test.py` runs end-to-end on CPU: downloads a few real ABO
  images, generates synthetic damage, trains 1 epoch, checkpoints, evaluates, and emits
  structured JSON for single-image + reference-diff inference.
- Eval report includes all six required metrics.
- Inference output is structured JSON (no natural language) and carries `model_version`.
- A future Siamese comparator can replace `CosineComparator` without changing
  `GradingInference` outputs or downstream APIs.

## Resolved decisions
- **No Siamese at train time** — single-image heads; Siamese-style compare at inference
  only; reference image is *optional* (graceful no-reference path).
- **No human-in-the-loop** this build — `confidence`/`needs_review` remain as internal
  signals/flags, but no review queue.
- **Supervision is assembled** (clean + synthetic + defect-masks); SOP is consistency-only.
- **Package lives in `ml/grading/`** as standalone Python — kept out of pnpm so it
  doesn't affect web/api builds or deploys.

## Open questions
- Compute/host for the real training run (local GPU vs Colab vs SageMaker) — deferred.
- Category scope to go deep on first (sneakers leaning) — affects synthetic + scrape.
- Whether to wire the trained model into `apps/api` now or after a quality run.
