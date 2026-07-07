# ai-grading

Self-contained module that **builds a synthetic image dataset for training a
product-condition grading model**. The model's job (trained separately) is to
look at user-uploaded product photos and output a continuous condition score
from **0.0 (destroyed) → 1.0 (brand new)**, which maps onto ReLoop's grade
buckets (`A` / `B` / `C` / `Salvage`) used by `ReturnGradingResult` in
`packages/shared`.

The hard part of training such a model is data: you need *the same product* in a
range of conditions, which doesn't exist off the shelf. This module manufactures
it — it takes clean catalog photos and synthetically ages them with realistic,
parameterised damage, recording an exact condition score for each result.

**No scraping.** Every source is a public, freely redistributable dataset.

## How it works

```
clean product (ABO)  ──►  stack defects (scratches, stains, cracks, …)
                          ──►  paste onto real home background (COCO)
                          ──►  simulate phone capture (blur, JPEG, rotation)
                          ──►  sample a 0..1 score inside the grade's range
                          ──►  save image + label row
```

### Sources (all public, no scraping)
- **Amazon Berkeley Objects (ABO)** — clean product photos (the base images).
  Pulled object-by-object from the public AWS Open Data S3 bucket, small variant
  only.
- **COCO 2017** — real indoor/home scenes (couch / chair / dining table / bed)
  used as backgrounds for **domain randomization**: each product is composited
  onto a random scene with random lighting/occlusion so the model learns to
  ignore context and key on condition (this is what lets it transfer to real
  photos, not just clean studio shots). Toggle via `BACKGROUND_INJECTION` in
  `config.py` — set it `False` to train the crop-only studio-domain model.
- **MVTec AD** *(optional)* — real material-defect textures (leather, carpet,
  tile, wood, metal_nut, bottle) alpha-blended on for extra realism. Disabled by
  default because the archive is ~4.9 GB; enable with an env var (see below).

### Grade buckets → score ranges
| Grade   | Score range | Recipe |
|---------|-------------|--------|
| A       | 0.80–1.00   | no defects, lighting variation only |
| B       | 0.55–0.79   | 1 defect, low–medium intensity |
| C       | 0.25–0.54   | 1–2 defects, medium–high intensity |
| Salvage | 0.00–0.24   | 2–3 defects, high intensity |

The dataset is balanced to a realistic return mix (~15% A, 35% B, 35% C, 15%
Salvage). All of this is tunable in [`config.py`](./config.py).

## Run it

```bash
pip install -r requirements.txt
python build_dataset.py      # downloads sources + generates the dataset
python verify_dataset.py     # sanity-checks the output
```

`build_dataset.py` runs end to end with no manual steps. Re-running is safe:
downloaded sources are skipped if already present.

To also pull the optional MVTec defect textures:

```bash
AI_GRADING_DOWNLOAD_MVTEC=1 python build_dataset.py
```

## Output

```
data/
├── raw/                     # downloaded sources (gitignored)
│   ├── abo/                 # clean product images
│   ├── coco_backgrounds/    # indoor scenes
│   └── mvtec/               # defect texture patches (if enabled)
├── processed/               # generated 224×224 training images (gitignored)
├── dataset.csv              # the labelled dataset
└── verification_grid.png    # sample montage from verify_dataset.py
```

`dataset.csv` columns:

| column | meaning |
|--------|---------|
| `image_path`   | path to the generated image, relative to this module |
| `score`        | condition score, 0.0–1.0 (regression target) |
| `grade`        | bucket label: A / B / C / Salvage |
| `defects`      | JSON array of defect labels applied (feeds `ReturnGradingResult.defects`) |
| `source_image` | the clean ABO image it was derived from |

Images are 224×224 (CLIP ViT input size).

## How it connects to the grading pipeline

The ReLoop API already has a grading contract and a swappable provider seam:

- `packages/shared/src/return.ts` → `ReturnGradingResult` (`grade`, `confidence`,
  `defects`, …) — the contract this model ultimately fills.
- `apps/api/src/routes/grade.ts` → today calls a hosted VLM; the longer-term plan
  is a purpose-trained CLIP regressor.

This module produces the **training data** for that regressor. The intended next
steps (out of scope here) are:

1. Train a CLIP image encoder + small regression head on `dataset.csv` to predict
   `score`.
2. Threshold `score` into A/B/C/Salvage using the same ranges in `config.py`,
   producing a `ReturnGradingResult`.
3. Serve it behind the existing `/api/grade` provider seam.

The score→grade thresholds and the `defects` vocabulary are deliberately shared
with `config.py` so training, inference, and the app stay in lockstep.

## Module layout

```
ai-grading/
├── config.py              # every tunable parameter
├── build_dataset.py       # one-command end-to-end builder
├── verify_dataset.py      # histogram + sample-grid sanity check
├── downloaders/           # abo / mvtec / coco (idempotent, fault-tolerant)
└── degradation/
    ├── overlays.py        # individual defect operations
    └── composer.py        # combines ops → labelled sample
```

## Notes
- Everything is seeded from `config.RANDOM_SEED` for reproducibility.
- Downloads are wrapped in retries/try-except and skip-if-present. A failed
  optional source (MVTec, COCO) degrades gracefully — the build still completes
  using the synthetic overlays.
