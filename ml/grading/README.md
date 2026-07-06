# ReLoop Grading — DINOv2 condition grader

A production-shaped, **single-image** product-condition grading model for Amazon
returns. DINOv2 ViT-B/14 backbone + multiple prediction heads → **structured facts,
not prose**. A Siamese-style embedding comparison runs **only at inference** (returned
image vs. original Amazon catalog image), and is swap-in replaceable by a trained
Siamese network later without touching any downstream API.

> Design rule (shared with the rest of ReLoop): **the model perceives; deterministic
> code aggregates, calibrates and decides; the LLM only narrates.**

## Output (maps 1:1 onto the TS `GradingResult` in `packages/shared`)
```json
{
  "grade": "Good", "grade_key": "good",
  "confidence": 0.91,
  "damage_score": 0.14,
  "defects": [{ "type": "scratch", "severity": 0.12 }],
  "similarity": 0.95,
  "needs_review": false,
  "model_version": "reloop-grading-dinov2b-v0.1.0"
}
```

## Architecture
```
            ┌── Grade Head        (5 ordinal grades: new..poor)
 Image ──► DINOv2 ──► embedding ──┼── Confidence Head   (P(correct), calibrated)
            (ViT-B/14, frozen)    ├── Defect Head       (multi-label + severity)
                                  └── Severity Head     (global damage_score)

 INFERENCE: original & returned images → SAME encoder → cosine / euclid / absdiff
            → reconciliation (pristine grade + low similarity ⇒ distrust)
```

## Datasets & supervision
None of the public sets carry used-condition grades — that's the moat. Supervision is
assembled:
| Source | Role | Labels used |
|---|---|---|
| **ABO** (Amazon Berkeley Objects) | clean catalog / reference side | top grade, zero damage |
| **Synthetic damage** on ABO | graded spectrum + clean↔damaged pairs | **exact** grade/severity/defect |
| **MVTec AD** | real scratches/cracks/dents | defect type + mask-area severity |
| **VisA** (Amazon Science) | defect localization/robustness | defect type + mask-area severity |
| **SOP** (Stanford Online Products) | viewpoint invariance | none (consistency loss only) |

ABO + SOP are pulled automatically from the HF datasets-server (no full download).
MVTec/VisA are read from a local canonical download via `--data-root` (skipped if
absent, so training still runs on ABO + synthetic).

## Quickstart
```bash
pip install -r requirements.txt

# wiring proof on CPU (downloads a few ABO images + DINOv2-base weights)
python scripts/smoke_test.py

# real training
python -m reloop_grading.train --config configs/default.yaml \
       [--data-root /path/to/mvtec_visa]

# evaluation report (accuracy, macro-F1, defect-F1, confusion, ECE, similarity dist)
python -m reloop_grading.evaluate --checkpoint runs/grading/grading_model.pt
```

## Serving (spec 023 — wired into apps/api)
`serve.py` puts a trained checkpoint behind a tiny Flask server matching the
exact `VlmAssessment` contract `apps/api`'s `VlmProvider` expects — this is
what both the Sell and Return flows call for grading when `GRADING_PROVIDER`
is not overridden away from its `trained-local` default.

```bash
# from repo root
pnpm dev:grader   # shells into ml/grading && python serve.py
# or directly:
cd ml/grading && GRADING_CKPT=~/Downloads/grading_model.pt python serve.py
```

Requires a one-time `pip install -r requirements.txt` in this directory —
pnpm does not manage the Python environment. `apps/api` points at
`GRADING_MODEL_URL` (default `http://127.0.0.1:8000`) and automatically falls
back to the NVIDIA-hosted VLM if this server is slow or unreachable (see
`apps/api/src/services/grading/fallback-provider.ts`). Render/production sets
`GRADING_PROVIDER=chat-vlm` in its dashboard env, since nothing deploys this
Flask server there today.

## Tests
```bash
python tests/test_schema.py          # torch-free contract tests
python tests/test_model_shapes.py    # head/loss shapes (auto-skips without torch)
```

## Layout
```
reloop_grading/
  schema.py      # canonical grades/defects/severity ↔ TS GradingResult
  config.py      # typed config (+ YAML)
  backbone.py    # DINOv2 ViT-B/14 + freeze schedule + shared embedding
  heads.py       # Grade / Confidence / Defect / Severity heads
  model.py       # GradingModel.forward + predict (structured JSON)
  losses.py      # masked multi-task loss + consistency
  train.py       # two-stage (frozen → unfreeze) trainer
  inference.py   # GradingInference + EmbeddingComparator (Siamese-swappable)
  evaluate.py    # metrics + temperature calibration
  registry.py    # checkpoint save/load + model_version stamping
  data/          # download · synthetic · adapters · dataset
```

## Extensibility
- **Swap the comparator:** implement `EmbeddingComparator.compare()` (e.g. a trained
  Siamese head) and pass it to `GradingInference`; outputs and downstream APIs are
  unchanged.
- **Fine-tune deeper:** set `backbone.unfreeze_last_n_blocks` > 0 (two-stage schedule
  handles it).
- **Production data path:** SageMaker for training/hosting + Feature Store; the
  provenance flywheel turns every real grade into a future training row.
```
