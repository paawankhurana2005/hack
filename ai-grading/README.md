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

## Use it in the app (wiring) — the fast path

The trained head ships in git (`data/model_best.pt`, <1 MB — the frozen CLIP backbone
is downloaded from Hugging Face on first run), so grading works right after a clone.
`apps/api` already routes `/api/grade` through a `trained-local` provider that POSTs each
photo to `GRADING_MODEL_URL/assess`; `serve.py` speaks exactly that protocol, so **no app
code changes are needed** — just run the server and point the API at it:

```bash
# 1) start the grader (this folder)
cd ai-grading
pip install -r requirements.txt          # first time
python serve.py                          # -> http://127.0.0.1:8000

# 2) run apps/api with these env vars (defaults already point at :8000)
GRADING_PROVIDER=trained-local
GRADING_MODEL_URL=http://127.0.0.1:8000
GRADER_LENIENCY=0     # this model is calibrated — don't let the app bump grades
GRADER_FLOOR=poor     # allow the full range (the app's default 'fair' clips Salvage)
```

**Graceful fallback:** if the grader is down or the model is missing, `apps/api`'s
`FallbackVlmProvider` automatically falls back to the hosted VLM (or mock mode), so the
app always runs. To force the hosted VLM instead, set `GRADING_PROVIDER=chat-vlm`.

### Endpoints (`serve.py`)
| Route | Body | Returns |
|---|---|---|
| `GET /health` | — | `{status, ready}` |
| `POST /assess` | `{ imageBase64 }` | ConditionGrade JSON (**the app protocol** — one photo → `new\|like-new\|good\|fair\|poor`, mapped to A/B/C/Salvage by `conditionGradeToReturnGrade`) |
| `POST /grade` | `{ category, images: {angle: b64} }` | richer multi-angle: one score (worst-angle bounded), per-angle breakdown, and a `missing_required` review flag |

Try it standalone:
```bash
python inference.py footwear sole:../shoesDemo/sole.jpg top:../shoesDemo/top.jpg
```

**Retrain** (optional — the shipped head already works): `python build_dataset.py &&
python train.py`. The frozen-model checkpoint stays tiny (head-only); a fine-tuned one
(`config.FINETUNE_UNFREEZE_LAST_N > 0`) also stores the vision weights and gets large.

The score→grade thresholds and `defects` vocabulary are shared via `config.py`, so
training, inference, and the app stay in lockstep.

## Module layout

```
ai-grading/
├── config.py              # every tunable parameter (categories, capture spec, bias)
├── build_dataset.py       # one-command end-to-end dataset builder
├── verify_dataset.py      # histogram + sample-grid sanity check
├── model.py               # GraderModel (CLIP + head), calibrate, save/load checkpoint
├── train.py               # train the condition head (+ optional CLIP fine-tune)
├── evaluate.py            # bucket accuracy, confusion, in-band MAE
├── inference.py           # grade_image / grade_images (multi-angle) + capture spec
├── serve.py               # HTTP server for the app (/assess, /grade)
├── downloaders/           # abo (category-aware) / mvtec / coco (fault-tolerant)
└── degradation/
    ├── overlays.py        # individual defect operations
    └── composer.py        # combines ops → labelled sample
```

## Notes
- Everything is seeded from `config.RANDOM_SEED` for reproducibility.
- Downloads are wrapped in retries/try-except and skip-if-present. A failed
  optional source (MVTec, COCO) degrades gracefully — the build still completes
  using the synthetic overlays.
