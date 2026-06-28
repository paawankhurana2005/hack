# ReLoop Grading — How We Train Our Own Condition-Grading AI (Full Technical Writeup)

> One document, everything: the problem, the moat, every architectural choice and
> *why*, the data strategy, the training procedure, every model output, every
> evaluation metric (with plain-English definitions), what we've observed so far, and
> what to expect. Written so both an ML reviewer and a non-ML judge can follow it.

---

## 0. TL;DR (the 30-second version)

We replaced "call a vision API to grade a returned product" with **our own trained
vision model**. It takes product photos and outputs **structured condition facts**
(grade, confidence, defects, severity) — never prose. A small **DINOv2** vision
backbone does the *seeing*; four lightweight **heads** turn what it sees into numbers;
deterministic business rules make the actual decision. At inference we also **compare
the returned item's photo against its original Amazon catalog photo** in the model's
own feature space — an authenticity / "is this really that product, and how changed?"
signal **only Amazon can compute**, because only Amazon has the original listing image.

The reason we *must* own the model and not call an API: our core innovation is **"grade
at the source, before the item moves."** You cannot make a cloud API round-trip for
every doorstep return at Amazon scale — latency, cost, and offline reality forbid it.
A small model we own is therefore not a vanity flex; it's a hard requirement of the
product.

---

## 1. The Problem & Why We Train Our Own Model (the moat)

**The task:** given photos of a returned/used product, output its **condition** in a
structured, reliable, explainable way, so the downstream "Intelligent Bridge" can
decide its best next life (resell / refurbish / donate / recycle / warehouse).

**Why not just call a multimodal LLM API?**
1. **Scale & latency:** doorstep grading must be near-instant and cheap; per-item cloud
   calls don't survive Amazon's return volume.
2. **It's not a moat:** anyone can call the same API. A trained model + Amazon's data is
   defensible.
3. **The data flywheel:** every graded item becomes a labelled training example. The
   model compounds — it gets better the more Amazon uses it. Nobody else has that label
   stream.
4. **Reference anchoring:** Amazon recorded the item's *first* sale, so it has the
   **original product photo**. We can grade by *diffing against the known original* —
   an architecture a competitor literally cannot build.

**The moat in one line:** *the only condition model that runs at the source and grades
by comparing against the product's own original Amazon listing.*

---

## 2. The Design Principle (used across all of ReLoop)

> **The model PERCEIVES. Deterministic code DECIDES. The LLM only NARRATES.**

- The neural network extracts **facts** (grade, defects, severity, confidence).
- **Business rules** (glass-box, auditable) turn facts into the routing decision.
- An LLM, if used at all, writes a one-line human explanation of a decision already made.

This separation is what makes the system **reliable and auditable** — a judge can ask
"why did it route this here?" and get a deterministic answer, not "the AI felt like it."

---

## 3. Glossary (plain-English, so every term below is clear)

- **Backbone:** the big pretrained neural network that converts an image into a vector
  of numbers (an *embedding*) capturing what's in it.
- **DINOv2:** Meta's self-supervised Vision Transformer. "Self-supervised" = it learned
  from millions of unlabelled images, so its features are strong and general. We use the
  **ViT-B/14** size (~86M parameters, 768-dim output).
- **ViT (Vision Transformer):** splits an image into small patches (14×14 px here),
  turns each into a token, and uses attention to relate them — like a language model but
  for image patches.
- **Embedding:** the backbone's output vector (768 numbers) summarizing the image. Two
  similar images → similar embeddings.
- **CLS token:** a special summary token whose embedding represents the whole image.
- **Head:** a small neural network (a few layers) bolted onto the embedding to predict
  one specific thing (e.g. the grade).
- **Transfer learning:** reuse a model pretrained on a huge dataset, and only train a
  little on your task — far less data needed.
- **Frozen / linear probe:** keep the backbone's weights fixed and train only the heads.
  Fast and cheap, but limited by whatever the frozen features already encode.
- **Fine-tuning / unfreezing:** allow some backbone layers to update too, so the features
  *adapt* to your task. More powerful, needs a GPU.
- **Logits:** raw, uncalibrated scores a network outputs before turning into
  probabilities.
- **Softmax / sigmoid:** functions that squash logits into probabilities (softmax for
  "pick one of N", sigmoid for independent yes/no per class).
- **Cross-Entropy (CE), Binary Cross-Entropy (BCE), Mean-Squared-Error (MSE):** loss
  functions — math that measures how wrong a prediction is, so training can reduce it.
- **Ordinal:** categories with an order (new < like-new < good < fair < poor). Being off
  by one grade is less wrong than off by three.
- **Multi-label:** an item can have several defects at once (scratch *and* stain).
- **Siamese comparison:** run two images through the *same* network and compare their
  embeddings to measure similarity.
- **Cosine similarity:** a number from −1 to 1 measuring how aligned two embedding
  vectors are (1 = identical direction). Our main "same product?" signal.

---

## 4. The Architecture

```
                         ┌── Grade Head        → 5 ordinal grades (new … poor)
   Photo ─► DINOv2 ─► embedding (768-d) ──┼── Confidence Head   → P(this grade is correct)
            (ViT-B/14)                    ├── Defect Head       → which defects + their severity
                                          └── Severity Head     → overall damage score (0–1)

   At INFERENCE (extra step):
     original catalog photo ─► DINOv2 ─► embedding A   ┐
     returned product photo ─► DINOv2 ─► embedding B   ┘ → cosine / euclidean / abs-diff
                                                          → "same product? how changed?"
```

### 4.1 The four heads — what each outputs and why

| Head | Output | Loss used | Why it exists |
|---|---|---|---|
| **Grade** | one of `new, like-new, good, fair, poor` | Cross-Entropy | the headline condition label; maps directly to Amazon's `ConditionGrade` |
| **Confidence** | a number 0–1 = "probability my grade is right" | BCE vs. live correctness | so the system knows when to *trust itself* vs. flag uncertainty |
| **Defect** | for each of 12 defect types: present? + how severe (0–1) | BCE (present) + MSE (severity) | the *evidence* behind the grade — what's actually wrong and where |
| **Severity** | a single overall **damage_score** 0–1 | MSE | a continuous condition signal that feeds pricing (a 0.14 vs 0.6 matters) |

**The 12 canonical defect types:** scratch, dent, crack, chip, stain, tear,
discoloration, missing_part, wear, contamination, rust, deformation. (Per-category
Amazon rubrics — e.g. "screen scratch", "sole wear" — are normalized into these.)

**Why a learned Confidence head and not just "the top softmax score"?** Raw softmax is
over-confident. We train a dedicated head to predict *whether the grade is actually
correct*, giving an honest self-trust score. Below a threshold we flag `needs_review`.

---

## 5. Why DINOv2, and Why "Frozen → Unfreeze"

- **Why DINOv2:** it's a state-of-the-art *self-supervised* vision model — its features
  are excellent out-of-the-box, so we need far less labelled data (transfer learning).
- **Stage 1 — frozen (linear probe):** we first train only the heads on top of the
  frozen backbone. This is cheap (runs on a laptop) and a great fast-iteration harness.
- **Stage 2 — unfreeze the last 4 blocks (fine-tune):** we then let the top of the
  backbone update. **This matters a lot for grading** (see §11): DINOv2 is *designed* to
  be invariant to small appearance changes — but condition grading *is* a small
  appearance change (a scratch, a scuff). So the frozen features partly ignore the very
  signal we need; unfreezing lets the network *become sensitive to damage*.

This two-stage schedule (warm up heads while frozen, then unfreeze) is a standard,
stable way to fine-tune without wrecking the pretrained features.

---

## 6. Single-Image Training, Siamese **Only at Inference** (the deliberate choice)

- **Training:** purely **single-image**. The heads learn condition from one photo. Simple,
  robust, and the model works even when there's no reference image.
- **Inference:** we add a **Siamese-style comparison** — run the original catalog photo
  and the returned photo through the *same* encoder and compare embeddings (cosine +
  euclidean + absolute difference). This yields a **similarity** signal.
- **Why this split?** (a) It keeps training simple and the model usable with no reference
  (long-tail items with no Amazon listing still grade fine — graceful degradation).
  (b) The comparison is a *bonus* authenticity/condition cross-check, not a crutch.
  (c) It's **swappable**: today it's a training-free cosine comparator; tomorrow a *trained*
  Siamese network can replace it **without changing any downstream API** (extensibility).

**The reconciliation rule (where the comparison earns its keep):** if the grade head
says "like-new" but the returned photo is *very dissimilar* to the original (low
similarity), we **don't trust the grade** — we cut the confidence and flag for review.
This catches wrong-item / not-as-described / swapped-product fraud.

---

## 7. The Data Strategy & Supervision (the hard part — and the moat)

**The core problem:** there is **no public dataset of "used product photo → condition
grade."** If there were, this wouldn't be a moat. So we *assemble* supervision from
several real datasets, each teaching a different capability, plus a synthetic generator
that manufactures the graded examples nobody else has.

| Source | What it is | What it teaches | Labels we derive |
|---|---|---|---|
| **ABO** (Amazon Berkeley Objects) | ~398k clean Amazon catalog photos, ~576 product types | what pristine products look like + product-domain breadth + the **reference** side of the diff | grade = top, damage = 0 |
| **Synthetic damage** (our generator) | we paint controlled scratches/cracks/dents/stains/etc. onto clean ABO photos | the **graded spectrum** (new→poor) and clean↔damaged pairs | **exact** grade, severity, defect type (we chose them!) |
| **MVTec AD** | industrial defect images with pixel masks | real scratches/cracks/contamination + where they are | defect type + severity from mask area |
| **VisA** (Amazon Science) | defect images + anomaly masks | defect localization & robustness | defect type + severity from mask area |
| **SOP** (Stanford Online Products) | many photos *per product* from different angles | **viewpoint invariance** — don't confuse a new camera angle with damage | none (used as a consistency signal only) |
| **Kaputt** (Amazon Science) | real retail-logistics defect photos (query/reference pairs + masks) | real damage on real packaged goods + the reference↔returned pairing | defect type + severity from `major_defect` flag |
| **Sneakers** (`ipogorelov/sneakers`) | ~40k real sneaker photos (brand/model), studio + real-world shots | **in-domain shoes** — clean anchors + center-biased synthetic damage *on the shoe* | grade=new (clean) / **exact** synthetic labels (damaged) |

### 7.1 How we get labels without a labelled grading dataset

- **Clean ABO photos** → labelled `new`, `damage_score = 0`, no defects.
- **Synthetic damage** → we *apply* a known defect at a known intensity, so the grade,
  severity, and defect type are **exact and free**. This is the keystone: it fills the
  rare "fair/poor" classes and creates the clean↔damaged pairs the comparator is
  validated on. (We map `damage_score` → grade with a fixed ladder:
  <0.05 new, <0.20 like-new, <0.45 good, <0.70 fair, else poor.)
- **MVTec/VisA** → "good" images are clean; "anomaly" images get a defect type from the
  folder name and a **severity proportional to the defect's mask area** (bigger defect =
  worse).
- **SOP** → no grade; used purely so the model learns *"same product, different angle"*
  should give *similar* embeddings (a **consistency loss**), so viewpoint changes aren't
  mistaken for condition changes.

### 7.1b The domain-gap fix (why a worn shoe first graded "fair / no defects")

When we first ran the model on a **real, visibly dirty/worn sneaker**, it graded it
*Fair* but reported *"no visible defects."* That contradiction was honest evidence of a
**domain gap**, not a wiring bug: the model had only ever seen **ABO catalog**,
**synthetic-on-catalog**, and **Kaputt packaged goods** — **never a sneaker.** Its grade
head guessed "worn" from the overall dinginess, but its defect head had no concept of
shoe dirt/scuffing/sole-wear because it had never been shown one.

The fix is data, in-domain:
- **Real sneakers** (`ipogorelov/sneakers`, ~40k brand-labelled photos) pulled straight
  from their parquet batches → **clean anchors** that teach "this is what a good shoe
  looks like."
- **Center-biased synthetic damage on the shoe.** Our generator previously scattered
  defects across the whole frame, so on a sneaker photo the "dirt"/"stain" often landed
  on the *background* (wall, box) while the label claimed the item was damaged. We added a
  triangular **center bias** so damage lands on the **product region** — now a synthetic
  "Fair" sneaker actually *looks* worn, and the defect head learns the right association.
- The backbone tail is **unfrozen** so it becomes damage-*sensitive* (a frozen DINOv2 is
  near-invariant to subtle wear — that was the earlier accuracy ceiling).

This is exactly the "data flywheel" story: each real return makes the next grade better,
and the gap is closed by **showing the model the domain**, not by hand-tuning rules.

### 7.2 Per-task label masking (important subtlety)

Different sources label different things (SOP has no grade; clean images have no defect
severity to learn from a mask). So every training example carries **masks** —
`has_grade`, `has_damage`, `has_defect` — and the loss **only supervises the tasks a
source actually labels.** This lets us mix heterogeneous data cleanly without teaching
the model garbage.

---

## 8. The Training Procedure

1. **Assemble** the unified dataset from the sources above (with label masks).
2. **Stage 1 (warm-up, frozen backbone):** train only the heads for a few epochs.
3. **Stage 2 (fine-tune):** unfreeze the last 4 DINOv2 blocks; continue training heads +
   those blocks at a smaller learning rate.
4. **Multi-task loss** = weighted sum of:
   - Grade Cross-Entropy (masked by `has_grade`)
   - Confidence BCE vs. live correctness (masked by `has_grade`)
   - Defect presence BCE (masked by `has_defect`)
   - Defect severity MSE — only on defects that are actually present
   - Overall damage MSE (masked by `has_damage`)
   - **SOP consistency** = `1 − cosine(view_A, view_B)` — pulls different views of the
     same product together.
5. **Checkpoint** with a stamped `model_version` (flows into provenance, so every grade
   is auditable and reproducible).

**Two ways we run it:**
- **Local (M1 laptop), frozen + cached embeddings:** because the backbone is frozen, we
  run it over the images **once**, cache the 768-d embeddings, then train heads in
  *seconds* per epoch. Free, offline, great for sweeping ideas. (~0.12s/epoch.)
- **Colab (free T4 GPU), unfrozen fine-tune:** the real run — unfreezes the backbone,
  turns on the consistency loss, uses more data. ~10–15 min.

---

## 9. The Model's Output (every field explained)

For each image the model returns **structured JSON** (no natural language):

```json
{
  "grade": "Good",            // human label
  "grade_key": "good",        // canonical Amazon ConditionGrade (new|like-new|good|fair|poor)
  "confidence": 0.91,         // 0–1, calibrated; how much to trust the grade
  "damage_score": 0.14,       // 0–1 overall condition signal (feeds pricing)
  "defects": [                // multi-label evidence, sorted worst-first
    { "type": "scratch", "severity": 0.12 }
  ],
  "similarity": 0.95,         // (inference w/ reference) cosine vs original catalog photo
  "needs_review": false,      // calibrated confidence below the abstain band → flag
  "model_version": "reloop-grading-dinov2b-v0.1.0"  // for provenance/audit
}
```

This maps **1:1 onto Amazon's existing `GradingResult` contract** — so nothing
downstream (pricing, routing, the health card) has to change. `damage_score` →
`qualityScore`; each `defect` → a `structuredIssue` with its severity bucketed to
`minor/moderate/severe`; `needs_review` → `needsReview`.

---

## 10. The Inference Pipeline (end-to-end)

```
Returned photo ─► DINOv2 ─► embedding ─► 4 heads ─► structured grade JSON
                                   │
Original catalog photo ─► DINOv2 ─► embedding ─► cosine/euclid/absdiff ─► similarity
                                   │
                          Reconciliation rule
              (pristine grade + low similarity ⇒ cut confidence + flag)
                                   │
                          → deterministic Business Rules (routing)
```

- Works **with or without** a reference image (graceful no-reference path).
- The comparator is an **interface** — `CosineComparator` today, a trained Siamese
  network tomorrow, same outputs.

---

## 11. Evaluation — Every Metric, Defined

We report a full panel so improvements are measurable and honest:

- **Grade Accuracy** — % of items whose grade is exactly right. *Baseline to beat:* the
  "always predict the most common grade" rate (~0.29 here). Below that = no real signal.
- **Macro-F1 (grade)** — F1 = balance of precision & recall; "macro" = averaged equally
  across the 5 grades, so rare grades count as much as common ones. Punishes a model that
  only learns the easy/common classes.
- **Defect-F1** — same idea for the multi-label defect detection (did we catch the right
  defects?).
- **Confusion Matrix** — a 5×5 table: for each true grade, what did we predict? The
  diagonal = correct; off-diagonal shows *how* it errs (e.g. confusing good↔fair).
- **Confidence Calibration (ECE)** — Expected Calibration Error: when the model says
  "90% sure," is it right ~90% of the time? Lower ECE = more honest confidence.
- **Temperature scaling** — a one-number post-fix (`T`) applied to the logits that
  *recalibrates* over-confident probabilities. We grid-search `T` to minimize ECE and
  report ECE **before vs. after**.
- **Cosine-Similarity Distribution** — the comparator's proof: cosine similarity for
  **same product but damaged** vs. **two different products**. A big gap = the embedding
  cleanly tells "same item, worn" from "different item."

---

## 12. Results So Far (honest)

### 12.1 Local frozen run (M1, ABO + synthetic, linear probe) — a useful *negative* result
| Metric | Value | Read |
|---|---|---|
| Grade accuracy | **0.277** | **below the ~0.29 majority baseline** → no real grade signal |
| Grade macro-F1 | 0.244 | poor |
| Defect-F1 | 0.457 | mediocre |
| ECE (raw → calibrated) | 0.599 → 0.387 | over-confident, helped a bit by temperature |
| Cosine: same-product-damaged | **0.949** | the comparator barely sees the damage… |
| Cosine: different-products | **0.093** | …but cleanly separates different products |

**Diagnosis (this is the key insight):** the `0.949` is the smoking gun. **A frozen
DINOv2 embedding hardly moves when the item is damaged**, because DINOv2 is *built* to
ignore small appearance changes. That's *great* for the "same product?" comparator
(0.95 vs 0.09 — a real, demoable result), but *fatal* for grading from a frozen
backbone: the grade signal is exactly the small change DINOv2 throws away, so the heads
can only memorize the training set (train loss fell to ~0.25 while val stayed at chance).
The confusion matrix confirmed it — only the most-visible class ("poor") was learned.

**This is not a bug.** It's the frozen linear-probe hitting its ceiling, and it tells us
precisely what to do: **fine-tune the backbone** so it becomes damage-sensitive.

### 12.2 Colab unfrozen run (T4 GPU, +SOP consistency, +real defects optional) — in progress
This is the fix for 12.1: unfreezing the last 4 blocks lets the features adapt to damage.
We expect grade accuracy and macro-F1 to rise meaningfully and ECE to drop.

---

## 13. Expected Results (honest ranges, not hype)

- **Grade accuracy** should move **clearly above the ~0.29 baseline** once the backbone
  is unfrozen — the explicit success criterion for "the fine-tune worked." On the
  in-distribution synthetic val set we'd expect a substantial jump (target ≳ 0.5, often
  higher); the exact number depends on synthetic realism and data volume.
- **Defect-F1** should rise as the features sharpen and as real MVTec/VisA defects are
  added.
- **ECE** should fall (better-calibrated confidence) after temperature scaling.
- **Cosine separation** (the authenticity moat) is *already* strong (~0.95 vs ~0.09) and
  is the most defensible single result we can show today.

**Critical honesty for the pitch:** grade/F1 here are measured on a **synthetic**
validation split (we have no hand-labelled "gold" set yet), and local defect supervision
is synthetic. So treat them as *in-distribution sanity*, not field accuracy. The honest,
strong claims are: **(1) the authenticity/comparator signal works now; (2) the grading
heads need the fine-tune, which the GPU run provides; (3) real field accuracy comes from
the provenance flywheel labelling real grades over time.**

---

## 14. Edge Cases We Handle

- **No reference image** (long-tail item, no Amazon listing) → grade from the single
  image alone, wider uncertainty. (Reference is optional, not required.)
- **Wrong/swapped item** → low similarity vs. original + pristine grade ⇒ confidence cut
  + flagged (fraud signal).
- **Heterogeneous labels** → per-task masking, so each source only supervises what it
  actually knows.
- **Over-confidence** → temperature calibration + an abstain threshold.
- **Viewpoint vs. damage confusion** → SOP consistency loss.
- **Reproducibility/audit** → every prediction stamped with `model_version`.

---

## 15. Extensibility & Amazon Mapping

- **Swap the comparator:** drop in a trained Siamese network behind the same interface —
  no downstream change.
- **Deeper fine-tune / bigger data:** one config flag (`unfreeze_last_n_blocks`).
- **The flywheel:** every real graded/sold/routed event is a labelled training row →
  the model self-improves with use (the data moat).
- **Production services:** SageMaker (train/host the model + Feature Store), SageMaker
  Ground Truth (turn provenance into labelled training sets), Rekognition (PII redaction
  on photos), CloudWatch / Model Monitor (drift & calibration tracking).

---

## 16. Limitations & What's Next (say this out loud — it builds trust)

- No hand-labelled **gold evaluation set** yet → headline accuracy is on synthetic data.
  *Next:* hand-label a few hundred real used items for a clean test set.
- Synthetic damage is an approximation of real wear. *Next:* add MVTec/VisA at volume +
  a marketplace scrape (StockX/eBay) for real worn items.
- Defect *localization* (exact region) is coarse. *Next:* patch-token heads + the masks
  we already parse from MVTec/VisA.
- Backbone fine-tuned, not trained from scratch (by design — transfer learning is the
  right call with limited data).

---

## 17. The Lines That Win the Room

1. *"We grade at the source, before the item moves — which is impossible with a cloud
   API at Amazon scale, so we had to train our own model."*
2. *"We grade by diffing the return against its **own original Amazon listing photo** —
   an authenticity check only the platform that recorded the first sale can do."*
3. *"The model perceives, deterministic rules decide, the LLM only narrates — so every
   decision is auditable."*
4. *"Every graded item is a labelled training example — the system gets better the more
   Amazon uses it."*
5. *"Our embedding already separates 'same item, damaged' (0.95) from 'different item'
   (0.09) — the authenticity moat works today; the GPU fine-tune sharpens the grade."*
