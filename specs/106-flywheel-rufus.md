# 106 — Provenance Flywheel + Rufus RAG Grounding (Phase 5)

## Goal
Close the data loop and make Rufus real retrieval. Provenance is both the trust moat
AND the training-data engine: every verified event is a labelled example. And Rufus
should retrieve the relevant Health-Card facts and answer grounded in them — with a
hallucination check — not stuff one prompt. Both stay deterministic where it matters,
with offline fallbacks.

## A. The provenance flywheel
`shared/flywheel.ts` — a pure transform from an append-only `ProvenanceChain` to
labelled training rows:
- `graded` → **GradingTrainingRow** (perception label for P1: grade, confidence,
  issue count, reference match, verified).
- `sold` → **PricingTrainingRow** (P2 label: realized resale ratio = sold price ÷
  first-listed price, with grade-at-sale + age from origin).
- `routed` → **RoutingTrainingRow** (P3 outcome: route + CO₂ + credits).

`extractTrainingRows(chain)` / `flywheelStats(chains)` introduce **no new numbers** —
they only read what each event already recorded (same discipline as `cumulativeImpact`).
**Wired:** `apps/web/src/lib/flywheel-data.ts` `collectTrainingData()` reads the live
global provenance store (`getAllChains()`) and emits the dataset; in production these
rows ship to **SageMaker Ground Truth** for scheduled retraining of P1/P2/P4. Storage
stays global and append-only, so chains follow the physical item across owners.

## B. Rufus = real RAG with a grounding check
`shared/rufus-rag.ts`:
- `buildCorpus(ctx)` — one fact per chunk (grade/summary, each issue, authenticity,
  price/discount, eco, seller, each spec, prior Q&A).
- `retrieve(question, corpus, k)` — token-overlap × **IDF** ranking; returns `[]` when
  nothing is relevant (→ deterministic fallback). The local stand-in for OpenSearch /
  Bedrock Knowledge Bases vector search; same contract.
- `isGrounded(answer, contextText)` — **hallucination check**: every multi-digit number
  the answer asserts must appear in the retrieved context (catches fabricated
  prices/specs).

`apps/api/src/services/rufus/rufus-service.ts` now: retrieve → ground the prompt in
ONLY the retrieved facts → grounding check → return; on empty retrieval, empty answer,
or a failed check, fall back to the deterministic `fallbackAnswer`. `RufusContext`
gains optional `priorQa` (retrievable conversation history); the route accepts it.

## Affected files
- **shared (new):** `flywheel.ts`, `rufus-rag.ts`; (edited) `rufus.ts` (`priorQa?`),
  `index.ts` exports.
- **api:** `services/rufus/rufus-service.ts` (RAG + grounding), `routes/rufus.ts`
  (priorQa schema).
- **web:** `lib/provenance-store.ts` (`getAllChains()`), `lib/flywheel-data.ts`
  (`collectTrainingData()`). The Rufus chat demo (local, deterministic) is unchanged.
- **api eval:** `metrics.ts` + `run.ts` — flywheel row counts + Rufus grounding checks.

## Acceptance criteria — all met
1. `pnpm -r typecheck` — green (strict, no `any`). ✅
2. `pnpm eval` — `(synthetic seed)`:
   - **Provenance flywheel: 2 sample chains → 6 labelled training rows** (grading 3 ·
     pricing 2 · routing 1) — the loop produces real training data.
   - **Rufus RAG grounding: 2/2 checks passed** (accepts a supported answer, rejects a
     fabricated-number answer). All earlier phase metrics unchanged. ✅
3. `pnpm --filter @reloop/web build` — green; seller dashboard untouched. ✅
4. `POST /api/rufus/ask` retrieves Health-Card facts, answers grounded in them, and
   falls back deterministically when retrieval is empty or the answer isn't grounded. ✅

## Edge cases handled
Re-list of an item already in a chain → `appendEvent` adds, never forks (idempotent
guard from P0). Item sold then re-graded/re-listed → chain continues (multi-life;
`sampleChains` demonstrates two owners). Question with no supporting fact → retrieval
empty → honest deterministic fallback. Model fabricates a number → grounding check
rejects → fallback. Privacy: only this item's card + this conversation are retrievable.

## Deferred to Phase 6
Bedrock Knowledge Bases / OpenSearch embeddings retrieval; SageMaker Ground Truth
labelling pipeline + scheduled retraining; surfacing flywheel yield on an internal
dashboard; wiring `priorQa` from the live Rufus chat history.
