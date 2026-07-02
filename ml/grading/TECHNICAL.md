# ReLoop Grading — Full Technical Documentation

*The "eyes" of ReLoop: a single, edge-deployable vision model that looks at a product
photo and emits **structured condition facts** (grade, defects, severity, confidence).
Deterministic code downstream prices it, decides its route, and writes the health card.
The model perceives; logic decides; the LLM only narrates.*

This document covers the whole system end to end — **model → dataset → fine-tuning →
inputs/outputs → serving → evaluation** — at both the ML and the engineering level.

---

## 0. Why a trained model at all (the one-paragraph "why")

ReLoop's pitch is *"grade at the source, before the item moves."* At Amazon scale you
cannot round-trip every doorstep return to a cloud VLM — too slow, too expensive, and it
won't run on a driver's handheld or a returns-counter device. So the grader has to be a
**small model we own and can deploy at the edge.** Owning it is also the moat: nobody else
has the label engine (Amazon's catalog as the clean reference + the return flywheel as the
correction signal). A hosted VLM is a great *baseline narrator*; it is not a defensible
product.

---

## 1. System map (where the model sits)

```
  USER PHOTO(S)                         ORIGINAL AMAZON CATALOG IMAGE
       │                                          │
       ▼                                          ▼
┌──────────────────────────  GRADING MODEL (this repo, ml/grading)  ─────────────────┐
│  DINOv2 ViT-B/14 backbone  ──►  shared 768-d embedding  ──►  4 heads                │
│        (same encoder runs BOTH images → one feature space for the diff)             │
└──────────────┬───────────────────────────────────────────────┬────────────────────┘
               │ structured facts (grade, defects, severity,    │ embeddings
               │ damage, confidence)                            │ (returned vs original)
               ▼                                                ▼
        per-photo GradingOutput                       EmbeddingComparator (cosine/…)
               │                                                │ similarity
               └───────────────►  serve.py (Flask)  ◄───────────┘
                                       │  /assess  → VlmAssessment JSON
                                       ▼
                    apps/api  LocalModelProvider (implements VlmProvider)
                                       │
                              GradingService  ── aggregates multi-photo → worst-angle grade,
                                       │          calibrates confidence, builds GradingResult
                                       ▼
            PricingService → HealthCardService → apps/web Sell/Return flow → Health Card
```

The **contract** between Python and TypeScript is frozen: `reloop_grading/schema.py` maps
1:1 onto `packages/shared/src/grading.ts` (`GradingResult`). The model can change
completely and nothing downstream changes.

---

## 2. The model

### 2.1 Backbone — DINOv2 ViT-B/14 (`facebook/dinov2-base`)

- A Vision Transformer pretrained **self-supervised** (no labels) by Meta on 142M images.
  Self-supervised pretraining is the key: it learned general visual structure
  (materials, edges, textures, object parts) without ever being told "this is a shoe,"
  which is exactly the transferable substrate we want.
- We take the **CLS token** — one 768-dimensional vector summarizing the whole image
  (`backbone.py` → `encoder.pooler_output`, fallback `last_hidden_state[:,0]`).
- **One shared embedding** feeds every head *and* the inference-time reference comparator,
  so the returned image and the catalog image are compared in the **same feature space**.

### 2.2 Heads — small MLPs on top of the embedding (`heads.py`)

| Head | Output tensor | Meaning | Activation |
|---|---|---|---|
| **GradeHead** | `(B, 5)` logits | the 5 ordinal grades: new ▸ like-new ▸ good ▸ fair ▸ poor | softmax (at predict) |
| **ConfidenceHead** | `(B,)` logit | predicted **P(grade is correct)** — learned self-trust, not just softmax max | sigmoid |
| **DefectHead** | `(B,12)` + `(B,12)` | multi-label **presence** over 12 defect classes + a **per-class severity** | sigmoid each |
| **SeverityHead** | `(B,)` | global **damage_score** ∈ [0,1] (overall, drives the grade prior) | sigmoid |

The 12-class defect taxonomy (`schema.py`): scratch, dent, crack, chip, stain, tear,
discoloration, missing_part, wear, contamination, rust, deformation. Every dataset's
own vocabulary is mapped into this superset by `normalize_defect()`.

Heads are deliberately tiny (one hidden layer, GELU, dropout) — the philosophy of
transfer learning is **the backbone does the heavy lifting, the heads just read it off**.

### 2.3 Inputs and outputs (exact)

**Input** (`dataset.build_transform`, eval path): one RGB image → resize to 1.15×224 →
center-crop 224 → ImageNet-normalize → tensor `(1, 3, 224, 224)`.

**Raw forward output** (`model.forward`, used for training): a dict of the head tensors
above + the `embedding`.

**Structured prediction** (`model.predict`, used at inference) → `GradingOutput`:
```jsonc
{
  "grade": "Poor", "grade_key": "poor",
  "confidence": 0.73,            // 0.5*(sigmoid(conf_logit) + calibrated softmax-max)
  "damage_score": 0.71,          // from SeverityHead
  "defects": [ {"type": "wear", "severity": 0.58} ],   // presence ≥ 0.5, sorted worst-first
  "needs_review": false,         // true when confidence < ABSTAIN_THRESHOLD (0.55)
  "model_version": "reloop-grading-dinov2b-v0.1.0",
  "similarity": 0.61             // only when a reference image was supplied
}
```
This object maps straight onto the TS `GradingResult` via `to_grading_result_partial()`.
**The model never emits a sentence** — `serve.py` / the LLM narrate from these facts.

---

## 3. Fine-tuning — the part you asked about

You know **LoRA**. LoRA is *one point* on a spectrum of how much of a pretrained network
you let move. Here's the whole spectrum, then what we actually do and why.

### 3.1 The spectrum of transfer learning

| Strategy | What trains | Pros | Cons |
|---|---|---|---|
| **Linear probe / feature-extraction** | only the new heads; backbone 100% frozen | cheapest, no overfit, can cache embeddings | backbone features are *fixed* — if they don't encode "damage," you're stuck |
| **Partial fine-tune (block unfreezing)** ← **we do this** | heads + the **last N transformer blocks** (+ final norm); early blocks frozen | adapts the *semantic* layers to "condition," keeps generic low-level features, modest compute | more params than LoRA; still a real fine-tune |
| **Full fine-tune** | all ~86M backbone params | max capacity | needs lots of labels, easy to overfit, expensive, can erase pretrained knowledge |
| **PEFT / LoRA / adapters** | tiny injected low-rank matrices (A·B), base frozen | <1% trainable params, swappable adapters per domain | extra dependency/abstraction; gains over block-unfreeze are marginal at our scale |

### 3.2 What we do: **two-stage partial fine-tune with differential learning rates**

Implemented in `backbone.set_freeze()` + `train.py`:

1. **Stage 1 — warmup (heads only).** For the first `warmup_frozen_epochs` (3 on Colab)
   the **backbone is fully frozen** and only the heads train. This stops randomly-init
   heads from sending garbage gradients into the pretrained backbone before they've
   learned anything. (During this stage `backbone.forward` even runs under `no_grad` — no
   backbone gradients are computed at all, so it's fast and memory-light.)
2. **Stage 2 — unfreeze the tail.** After warmup we unfreeze the **last `N` transformer
   blocks** (config `unfreeze_last_n_blocks: 4`) + the final layernorm, and rebuild the
   optimizer. Early blocks (generic edges/textures — useful for *any* image) stay frozen;
   late blocks (high-level semantics) adapt to *"what does damage look like."*
3. **Differential learning rates** (`_build_optimizer`): heads at `lr_heads = 1e-3`, the
   unfrozen backbone at `lr_backbone = 1e-5` — **100× smaller**, so we *nudge* the
   pretrained features instead of destroying them. Single AdamW, two param groups,
   weight decay 1e-4, grad-clip 1.0.

### 3.3 Why this, and not LoRA (and why LoRA is the easy upgrade)

The single most important empirical finding in this project:

> **A frozen DINOv2 is nearly invariant to subtle damage.** Same product, lightly damaged,
> stays at cosine ≈ 0.95 to its clean version — so a linear probe physically *cannot*
> grade fine condition (it caps around ~0.30 accuracy regardless of dataset). The moment
> we unfreeze the tail, the embedding becomes **damage-sensitive** (similarity drops to
> ~0.58 on damaged pairs) and grade accuracy jumps to ~0.54.

So the bottleneck was **"is the backbone allowed to move at all"**, not **"how
parameter-efficiently does it move."** Block-unfreezing is the *minimal* change that flips
the backbone from frozen→adaptive, with zero extra dependencies. LoRA solves a *different*
problem (fitting many domains cheaply / tiny memory) that we don't have yet at this scale.

**LoRA is a drop-in next step, not a rewrite.** Our backbone is a stock HuggingFace
`Dinov2Model`, so LoRA slots in exactly where `set_freeze()` lives:
```python
from peft import LoraConfig, get_peft_model
self.encoder = get_peft_model(self.encoder,
    LoraConfig(r=8, target_modules=["query", "value"]))  # the rest of the pipeline is unchanged
```
That's the upgrade path when we want **per-vertical adapters** (a "sneakers" adapter, an
"electronics" adapter) swappable at inference without shipping a whole model each.

---

## 4. The dataset & supervision (the moat, and the hard part)

**There is no public "used-product photo → condition grade" dataset.** If there were, this
wouldn't be defensible. So we *assemble* supervision from several real datasets — each
teaching one capability — plus a synthetic generator that manufactures the graded examples
nobody else has. All sources map into one `UnifiedSample` shape (`data/sample.py`).

| Source | What it is | What it teaches | Labels derived |
|---|---|---|---|
| **ABO** (Amazon Berkeley Objects) | clean Amazon catalog photos | what pristine looks like + product breadth + the **reference** side of the diff | grade=new, damage=0 |
| **Synthetic damage** (ours) | controlled scratches/stains/dirt/wear painted on clean photos | the **graded spectrum** new→poor + clean↔damaged pairs | **exact** grade/severity/defect (we chose them) |
| **MVTec AD** | industrial defect images + pixel masks | real defects + *where* they are | defect type + severity from mask area |
| **VisA** (Amazon Science) | defect images + anomaly masks | defect localization & robustness | defect type + severity from mask area |
| **SOP** (Stanford Online Products) | many photos per product, different angles | **viewpoint invariance** (don't call a new angle "damage") | none (consistency signal only) |
| **Kaputt** (Amazon Science) | real retail-logistics defect photos (query/reference) | real damage on real goods + the reference↔returned pairing | defect type + severity from `major_defect` |
| **Sneakers** (`ipogorelov/sneakers`) | ~40k real sneaker photos (brand/model) | **in-domain shoes** + on-shoe synthetic damage | grade=new (clean) / **exact** synthetic (damaged) |

### 4.1 How we get labels without a labelled grading dataset

- **Clean photos → `new`, damage 0, empty defect vector.** Teaches "good item → no defects."
- **Synthetic damage is the keystone.** `data/synthetic.py` *applies* a known defect at a
  known intensity to a clean image, so the grade, severity, and defect type are **exact and
  free**. It fills the rare fair/poor classes and creates the clean↔damaged pairs the
  comparator is validated on. `damage_score → grade` uses a fixed ladder
  (<0.05 new, <0.20 like-new, <0.45 good, <0.70 fair, else poor).
  - *Center bias:* products sit center-frame, so we pull synthetic damage toward the
    central region (`_cxy`, triangular) — otherwise "dirt" lands on the background (wall,
    box) and the label lies. This was a real bug we fixed.
- **MVTec/VisA/Kaputt:** "good" images are clean; defect images get a type from the folder
  / annotation and a **severity proportional to mask area or the major-defect flag**.
- **SOP:** no grade — used only so the model learns *"same product, different angle → similar
  embedding."*

### 4.2 Per-task label masking (the subtlety that makes mixing work)

Different sources label different things (SOP has no grade; a clean image has no defect
mask to learn severity from). So every sample carries **masks** — `has_grade`,
`has_damage`, `has_defect` — and the loss **only supervises the tasks a source actually
labels** (`losses.py`, `_masked_mean`). This lets us blend heterogeneous data without
teaching the model garbage on the fields a source can't supply.

### 4.3 The data flywheel (why this gets better with use)

Every real return is a *new labelled example*: the catalog image is the clean reference,
the doorstep photo is the query, and the eventual human/resale outcome is the correction.
That loop — not a one-time dataset — is the long-term moat. (RL belongs on the **decision**
layers, e.g. dynamic pricing as an offline bandit; grading stays **supervised** because
human corrections are *labels*, not rewards.)

---

## 5. The loss (`losses.py`)

One multi-task objective, every term masked to the sources that label it:

```
total =  w_grade · CE(grade)             [masked by has_grade]
      +  w_conf  · BCE(confidence vs. online correctness)   [masked by has_grade]
      +  w_defect· BCE(defect presence)  [masked by has_defect]
      +  w_sev   · MSE(severity on PRESENT defects only)
      +  w_damage· MSE(damage_score)     [masked by has_damage]
      +  w_cons  · (1 − cosine(view_a, view_b))   [SOP pairs, in the trainer]
```
Default weights (`configs/sneakers.yaml`): grade 1.0, **defect 0.9** (bumped — the defect
head was the weak link), severity 0.5, damage 0.5, confidence 0.3, consistency 0.3.

Two clever bits:
- **Confidence is trained against *online correctness*.** Each step we check whether the
  grade argmax was right (detached) and train the confidence head to predict that — so it
  learns genuine self-trust, not a copy of the softmax max.
- **Severity is supervised only where a defect is actually present** (`present * has_defect`
  mask) — regressing severity on absent defects would be meaningless.

---

## 6. Inference (`inference.py`) — single image + the "Siamese at inference"

We deliberately **do not train a Siamese network.** We train a strong single-image grader,
then do a **Siamese-style embedding comparison only at inference**:

1. **Grade the returned photo** → structured `GradingOutput` (Section 2.3).
2. **Embed the original catalog image** through the *same* encoder.
3. **Compare** with `CosineComparator` → similarity / euclidean / abs-diff.
4. **Reconcile:** if the grade claims *pristine* (new/like-new) but similarity < 0.60, the
   item doesn't match its own listing — we **multiply confidence by 0.6 and flag for
   review**. (Anti-fraud / wrong-item / "looks nothing like the listing" guard.)

The comparator is a `Protocol` (`EmbeddingComparator`) — the cosine version is training-free
and ships today; a *trained* Siamese can replace it later **without changing any output or
downstream API**. Calibration is applied here too: grade logits are divided by a fitted
**temperature** before softmax.

---

## 7. The serving & engineering system

### 7.1 Model server — `serve.py` (Flask)
- Loads a checkpoint (`GRADING_CKPT`), holds the model in memory, runs on **CPU** (reliable
  single-image latency; this is the edge profile).
- `POST /assess { imageBase64, referenceBase64? }` → `VlmAssessment`-shaped JSON
  (grade, confidence, detectedIssues, structuredIssues[{type,severity,region}], summary).
- The summary is honest: it will **not** say "no visible defects" when the grade is below
  like-new (that self-contradiction was a bug).

### 7.2 API integration — `apps/api`
- `LocalModelProvider` implements the existing `VlmProvider` interface and POSTs to
  `serve.py`. A single env switch routes grading to us: `GRADER=local` +
  `LOCAL_GRADER_URL`. Default stays the hosted VLM, so prod is unaffected unless the flag
  is set.
- `GradingService` loops the photos, **aggregates to the worst-angle grade**, calibrates
  confidence, and assembles the final `GradingResult`. Reference comparison currently runs
  on the VLM comparator; the model's own embedding-diff is exposed via `serve.py`.

### 7.3 Contracts & checkpoints
- **Single source of truth:** all data shapes live in `packages/shared` (TS) and
  `schema.py` (Py) kept in lock-step. Strict TypeScript, no `any`.
- **Checkpoint registry** (`registry.py`): every checkpoint stores `state_dict`, the full
  `config`, the fitted `temperature`, and a stamped `model_version` (which flows into the
  provenance chain, so every grade is auditable). Two safety features:
  - **Backup-on-save:** an existing `grading_model.pt` is archived as
    `grading_model.<timestamp>.pt` before a new one is written — a re-run can never clobber
    prior weights.
  - **Schema-tolerant load:** `Config.from_dict` ignores unknown keys, so a checkpoint
    saved with a different config schema (fields added/removed across versions) still loads
    instead of crashing.
- **Edge-deployable by construction:** ViT-B/14 + tiny heads (~86M params, ~340 MB fp32)
  runs on CPU; quantization/distillation are the obvious next steps for handheld latency.

---

## 8. Evaluation — every metric, and what's actually "truth" (`evaluate.py`)

| Metric | What it answers |
|---|---|
| **Grade accuracy** | exact-match over the 5 grades (masked to samples with a grade) |
| **Grade macro-F1** | accuracy without letting the common classes hide the rare ones (fair/poor) |
| **Defect F1** (multi-label) | does the defect head fire the right defects (micro over 12 classes) |
| **Confusion matrix** | *where* it errs — off-by-one (good↔fair) is fine; new↔poor is not |
| **ECE** + **temperature scaling** | calibration: does "70% confident" actually mean 70% right? We grid-search a single temperature (0.5–3.0) that minimizes ECE and bake it into the checkpoint |
| **Cosine-similarity distribution** | same-product-damaged vs different-products — validates the comparator/embedding |

**Honesty about what's measured.** Grade accuracy / F1 are computed on a **synthetic
validation split** — it's an *in-distribution sanity check*, **not** field accuracy (no
hand-labelled real gold set yet). The metric that is genuinely "real" is the
**cosine-similarity separation**: it directly shows whether the embedding learned to *see*
damage (same-product-damaged dropping well below clean-vs-clean baseline is the signal that
matters). When we say "0.54 grade / 0.81 F1," we mean *on synthetic val* — and we say so.

---

## 9. End-to-end recap (one pass)

1. User uploads photo(s) in the Sell/Return flow (`apps/web`).
2. `apps/api` (`GRADER=local`) → `serve.py` → tensor `(1,3,224,224)`.
3. DINOv2 → 768-d embedding → 4 heads → `GradingOutput` (grade, defects, severity,
   confidence, needs_review).
4. (If a catalog image exists) same encoder embeds it → cosine comparison → reconcile.
5. `GradingService` aggregates multi-photo → `GradingResult` → Pricing → Health Card →
   shown on the Review screen. The grade + version land in the provenance chain.

---

## 10. Honest limitations & what's next

- **Domain coverage** is the live frontier: the Kaputt model already grades a worn shoe
  **Poor + detects `wear`** (the earlier "Fair / no defects" failure is fixed), but it
  reports generic `wear · overall` rather than localized "sole wear" / "dirt." The
  **sneaker run** (`configs/sneakers.yaml`: real shoes + on-shoe synthetic damage) is the
  fix for specificity.
- **No real gold set yet** → no field-accuracy number; building a small hand-labelled
  sneaker gold set is the highest-value next task.
- **Reference comparator is training-free** (cosine) → a trained Siamese is the upgrade.
- **Fine-tuning headroom:** block-unfreeze works; **LoRA per-vertical adapters** is the
  efficiency upgrade when we go multi-category.
- **Latency:** CPU fp32 today; quantization/distillation for true handheld edge next.

*One line for the room:* **the model perceives, deterministic logic decides, the LLM
narrates — and every real return makes the next grade better.**
