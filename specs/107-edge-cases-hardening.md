# 107 — Edge-Case Sweep + "What if the AI is wrong?" Hardening (Phase 6)

## Goal
Answer "what happens when it breaks?" exhaustively, in code: a human-in-the-loop path
for uncertain/risky items, drift monitoring, a PII redaction boundary, idempotent
writes, and a tested edge-case matrix across both flows — plus the one-screen
failure-modes table below for the pitch.

## What shipped
- **Human-in-the-loop (A2I)** — `shared/review.ts` `reviewDecision(signals)` routes
  low-confidence grades (P1 abstain band), high-value-unverified items, authenticity
  mismatches, and fraud signals to a human queue. `web/lib/review-queue.ts` is the
  per-user queue; the sell flow enqueues on `needsReview` with a clean resume path.
- **Drift & calibration monitoring** — `shared/monitor.ts` PSI + thresholds; a stable
  distribution → `continue`, a shifted one → `fallback` (never keep trusting a drifted
  model). Maps to CloudWatch / SageMaker Model Monitor.
- **PII redaction boundary** — `shared/pii.ts` `PiiRedactor` interface + `NoopPiiRedactor`
  stand-in (auditable boundary now; AWS Rekognition face/text redaction in prod).
- **Idempotency everywhere** — provenance append guard (P0) + now `credits-store.earnFor`
  takes an idempotency key, so retries / cold-start re-fires never double-credit; the
  sell flow keys the listing credit on `itemId + price`.
- **Async + cold-start** — every model call already degrades to a deterministic fallback
  (the pipeline trace shows `fallback`); no screen blocks on the Render ~50s cold start.
- **Rate-limit discipline** — grading stays sequential-per-image (concurrent calls from
  one key hang); documented in `grading-service.ts`.
- **Edge-case matrix** — `apps/api/src/eval/edge-cases.ts` (`pnpm test:edge`):
  **35/35 assertions pass**, non-zero exit on any failure.

## One-screen: failure modes & fallbacks (the pitch slide)
| Failure | Detected by | Fallback / response |
| --- | --- | --- |
| Grading model down / times out | pipeline stage timeout | conservative `fair` grade, `needsReview` → HITL |
| One bad photo (blur/dark) | per-photo quality | capture guidance asks for a better shot |
| Model returns prose / bad JSON | `callModel` parse + retry | deterministic provider fallback |
| Low grading confidence | calibrated confidence < abstain band | **human review queue (A2I)** |
| No price reference (long-tail) | request has no reference | LLM retail + grade-factor policy, wider interval |
| Predicted price below salvage floor | `belowFloor` signal | clamp up; routing may beat reselling |
| High-value + unverified item | hard gate / `reviewDecision` | warehouse verification + **HITL** |
| Counterfeit / not-as-described / 3P | routing hard rule | return to seller (never optimized away) |
| Hazmat / restricted | routing hard rule | certified disposal (recycle) |
| Reason ↔ grade mismatch | fraud signal | warehouse fraud review + **HITL** |
| Authenticity mismatch | reference diff | warehouse + **HITL** |
| New product, no return history | `confidenceFor(ratingCount)` | lower confidence, priors dominate |
| Rufus has no supporting fact | empty retrieval | honest "not on the card" fallback |
| Rufus fabricates a number | grounding check | reject → deterministic fallback answer |
| Retry / cold-start re-fire | idempotency keys | no double-write to provenance or credits |
| Model drift over time | PSI watchdog | widen intervals → fall back to policy |
| Faces / address in a photo | PII boundary | Rekognition redaction before storage |
| AWS data layer down | best-effort client | localStorage stays the source of truth |

## Affected files
- **shared (new):** `review.ts`, `monitor.ts`, `pii.ts` (+ `index.ts` exports).
- **web:** `lib/review-queue.ts` (new), `lib/credits-store.ts` (idempotency key),
  `components/sell/sell-session.tsx` (enqueue review + keyed credit).
- **api:** `eval/edge-cases.ts` (new, `pnpm test:edge`), `eval/metrics.ts` + `run.ts`
  (drift block). `package.json` scripts (`test:edge`).

## Acceptance criteria — all met
1. `pnpm -r typecheck` — green (strict, no `any`). ✅
2. `pnpm test:edge` — **35/35 edge cases pass** (grading, pricing, routing hard rules +
   EV, provenance/flywheel, HITL, drift, PII, Rufus grounding). ✅
3. `pnpm eval` — adds the **drift watchdog** (stable PSI 0 → continue; shifted PSI 3.4 →
   fallback); all prior phase metrics intact. ✅
4. `pnpm --filter @reloop/web build` — green; seller dashboard untouched. ✅
5. Low-confidence and high-value/fraud items have a concrete HITL path (review queue),
   and the failure-modes table above is the pitch's "what if it's wrong" answer. ✅

## Production path
A2I human-review loops; CloudWatch + SageMaker Model Monitor for drift/calibration
alarms; Rekognition redaction at the S3 upload boundary; UUIDv5 idempotency keys; the
sequential-per-key VLM discipline carries to Bedrock batch limits.
