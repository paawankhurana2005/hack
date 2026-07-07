"""Central configuration for the ai-grading synthetic dataset builder.

Every tunable knob lives here so the rest of the module stays declarative.
Paths are resolved relative to this file, so the module is runnable from
anywhere (CI, another cwd, etc.) without surprises.
"""

from __future__ import annotations

from pathlib import Path

# --------------------------------------------------------------------------- #
# Paths
# --------------------------------------------------------------------------- #
BASE_DIR: Path = Path(__file__).resolve().parent
DATA_DIR: Path = BASE_DIR / "data"
RAW_DIR: Path = DATA_DIR / "raw"
PROCESSED_DIR: Path = DATA_DIR / "processed"
DATASET_CSV: Path = DATA_DIR / "dataset.csv"
VERIFICATION_GRID: Path = DATA_DIR / "verification_grid.png"

ABO_RAW_DIR: Path = RAW_DIR / "abo"
MVTEC_RAW_DIR: Path = RAW_DIR / "mvtec"
COCO_RAW_DIR: Path = RAW_DIR / "coco_backgrounds"

# --------------------------------------------------------------------------- #
# Reproducibility
# --------------------------------------------------------------------------- #
RANDOM_SEED: int = 42

# --------------------------------------------------------------------------- #
# Dataset size
# --------------------------------------------------------------------------- #
# Number of clean ABO product images to pull and use as the base set.
NUM_ABO_IMAGES: int = 2000
# How many degraded variants we synthesise per clean image.
AUGMENTATIONS_PER_IMAGE: int = 4

# Final image size fed to CLIP (ViT-B/32 expects 224x224).
IMAGE_SIZE: int = 224

# --------------------------------------------------------------------------- #
# Grade buckets -> continuous score ranges
# Score is a 0.0 (destroyed) .. 1.0 (brand new) regression target.
# Buckets mirror ReturnGradingResult.grade in packages/shared.
# --------------------------------------------------------------------------- #
GRADE_SCORE_RANGES: dict[str, tuple[float, float]] = {
    "A": (0.80, 1.00),
    "B": (0.55, 0.79),
    "C": (0.25, 0.54),
    "Salvage": (0.00, 0.24),
}

# Target distribution across the dataset. This is a LOCAL-REROUTE return pipeline:
# items are graded at the doorstep so near-pristine ones can be re-sold locally, so
# the overwhelming majority are fine / lightly used and a small tail is damaged. The
# model must be PRECISE in the top band (most items score 0.85-0.95), so the dataset
# is deliberately A-heavy — a balanced A/B/C/Salvage mix wastes capacity on damage the
# model rarely sees and starves the band that actually matters.
GRADE_DISTRIBUTION: dict[str, float] = {
    "A": 0.70,
    "B": 0.18,
    "C": 0.08,
    "Salvage": 0.04,
}

# --------------------------------------------------------------------------- #
# Degradation recipe per grade.
# count = how many distinct defect operations are stacked.
# intensity = (min, max) severity each op is sampled within (0..1).
# --------------------------------------------------------------------------- #
GRADE_RECIPES: dict[str, dict[str, object]] = {
    # A is no longer "factory-pristine only". Near-pristine RETURNS are mostly
    # LIGHTLY USED — a faint fade, a little handling dust — not brand new. So most A
    # samples get ONE subtle global op at low intensity, which spreads A's score
    # across ~0.83-0.97 (dense in 0.85-0.95) instead of clustering it at ~0.98. A
    # pristine minority (no op) still anchors the 0.95-1.00 top. See A_LIGHT_WEAR_PROB.
    # op_count is (1,1) so A always considers exactly one light-wear op; whether it's
    # actually applied (vs left pristine) is decided by A_LIGHT_WEAR_PROB, not the count.
    "A": {"op_count": (1, 1), "intensity": (0.15, 0.55)},
    # B floor raised (0.10 -> 0.22) so even the mildest B is visibly damaged,
    # leaving A as the only truly clean class — sharpens the A/B boundary.
    "B": {"op_count": (1, 1), "intensity": (0.22, 0.40)},
    # C floor raised (0.40 -> 0.48) so C stops looking like a mild B.
    "C": {"op_count": (1, 2), "intensity": (0.48, 0.70)},
    "Salvage": {"op_count": (2, 3), "intensity": (0.70, 1.00)},
}

# Fraction of grade-A samples that carry light real-world wear (a subtle global op)
# rather than being factory-pristine. This is what fills the 0.85-0.95 band the
# local-reroute model must resolve; the remaining (1 - p) stay pristine at 0.95-1.00.
A_LIGHT_WEAR_PROB: float = 0.70

# Grade-A score is driven directly by the light-wear op's INTENSITY (not op severity),
# so every A wear op maps the same way: pos = intensity / A_WEAR_NORM, score = 1 - 0.2*pos.
# With intensity 0.15-0.55 and norm 0.70, A light-wear scores span ~0.84-0.96 centered
# ~0.90 — i.e. most near-pristine returns land squarely in 0.85-0.95.
A_WEAR_NORM: float = 0.70

# --------------------------------------------------------------------------- #
# Condition-signal tuning (so the score is actually predictable from pixels).
# --------------------------------------------------------------------------- #
# Background injection pastes the product onto a random COCO scene. ON for
# DOMAIN RANDOMIZATION: showing the same product/condition over many different
# backgrounds + lighting + occlusions forces the model to ignore context and key
# on the product's condition, so it transfers to real-world photos (not just
# clean studio shots). Trade-off: a lower synthetic val metric in exchange for
# real-world robustness. Set False to train the crop-only studio-domain model.
# Crop-only (False) matches CLEAN listing / catalog photos — which is the deployment
# target here (near-pristine returns shot on a plain background). Compositing the product
# onto cluttered COCO scenes (True) adds scene variance that swamps the subtle top-band
# condition signal and makes a frozen CLIP under-score clean real photos. Flip back to
# True if the target shifts to messy doorstep photos.
BACKGROUND_INJECTION: bool = False

# Domain-randomization nuisance augmentations. These are applied independently of
# the damage, so they never change the score — they're variation the model must
# learn to ignore. COLOR_JITTER = +/- range for brightness/contrast/saturation;
# OCCLUSION_MAX_BOXES = max random "random-erasing" patches (simulate hands etc.).
COLOR_JITTER: float = 0.22
OCCLUSION_MAX_BOXES: int = 2
# Product scale range when composited onto a background (fraction of the frame).
# Wider range = more scale/context variation.
PRODUCT_SCALE_RANGE: tuple[float, float] = (0.50, 0.88)

# Per-op visual "loudness": how much visible damage each op produces per unit of
# intensity. Drives the continuous score below so heavier-looking damage -> lower
# score (instead of a random draw within the grade band).
OP_SEVERITY: dict[str, float] = {
    "scratches": 0.7,
    "stain": 0.9,
    "discoloration": 0.6,
    "dirt": 1.0,
    "crack": 1.0,
    "deformation": 0.6,
    "mvtec_patch": 0.85,
}
# Loud, unmistakable defects. Salvage is biased toward these so the worst grade
# always *looks* the worst, keeping A and Salvage far apart in feature space.
LOUD_OPS: list[str] = ["dirt", "crack", "stain"]
# WHOLE-IMAGE degradations. A frozen CLIP encoder summarises the whole image into
# one vector, so a localized scratch barely moves it — a clean A and a lightly
# scratched B look identical to CLIP. Global ops (overall fade / spread dirt)
# actually shift the embedding, so B/C are biased toward these to stay separable
# from clean A. This is the key to the A/B boundary.
GLOBAL_OPS: list[str] = ["discoloration", "dirt"]
# Normaliser mapping summed (intensity x severity) damage to a 0..1 position
# WITHIN each grade's score band. Tuned to each grade's op-count/intensity recipe.
GRADE_DAMAGE_NORM: dict[str, float] = {
    # A is scored via A_WEAR_NORM (intensity-driven), not this table — kept only so the
    # dict has an entry for every grade.
    "A": 0.48,
    "B": 0.30,
    "C": 1.10,
    "Salvage": 2.60,
}

# L2-normalise CLIP features before the regression head. Shared by train.py and
# inference.py so training and serving stay consistent.
NORMALIZE_FEATURES: bool = True

# --------------------------------------------------------------------------- #
# Grade-A bias correction (post-hoc). A frozen CLIP systematically UNDER-scores
# grade A (predicts ~0.82 for items truly ~0.92) because it can't fully separate
# pristine from lightly-worn — both land ~0.82. This adds up to +A_SCORE_BIAS to
# scores in the A region, ramped in over [lo, hi] so lower grades are untouched and
# there's no jump at the A/B boundary. Trade-off: nudges borderline B toward A, which
# is acceptable for local rerouting (a lightly-worn item is still resellable). Applied
# in inference AND evaluate so metrics stay honest. Set A_SCORE_BIAS=0 to disable.
A_SCORE_BIAS: float = 0.08
A_BIAS_RAMP_LO: float = 0.80
A_BIAS_RAMP_HI: float = 0.85

# --------------------------------------------------------------------------- #
# Fine-tuning (train.py). A FROZEN CLIP can't resolve subtle top-band condition
# (it lumps a lightly-worn A with a mildly-damaged B), so we unfreeze the vision
# encoder's TAIL and train it end-to-end with a small backbone LR. This is what makes
# the 0.85-0.95 band actually separable. Kept modest so it finishes on CPU.
# --------------------------------------------------------------------------- #
# 0 = frozen CLIP (head-only). Fine-tuning the encoder on synthetic composites overfit
# the synthetic domain and generalized WORSE to real photos, so we keep CLIP frozen and
# fix the real problem (domain match) in the data instead.
FINETUNE_UNFREEZE_LAST_N: int = 0      # CLIP vision blocks to unfreeze (0 = frozen)
FINETUNE_EPOCHS: int = 4
FINETUNE_BATCH: int = 16
# Subsample the dataset for the fine-tune so end-to-end CPU training is tractable
# (None = use all). Stratified by grade.
FINETUNE_MAX_SAMPLES: int | None = 2000
LR_HEAD: float = 1e-3
LR_BACKBONE: float = 1e-5              # 100x smaller — nudge CLIP, don't wreck it

# --------------------------------------------------------------------------- #
# Product categories — each asks for its own photos and gets its own wear model.
# The grader is trained per-category so a shoe's sole abrasion and a phone's screen
# scratch are modelled with the defects that actually occur on that product type.
# --------------------------------------------------------------------------- #
CATEGORIES: list[str] = ["footwear", "electronics", "apparel", "home"]

# ABO `product_type` value -> our category, matched by UPPERCASE substring (first hit
# wins). ABO has hundreds of product types; we map the ones that fit and skip the rest.
CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "footwear": ["SHOE", "BOOT", "SANDAL", "SNEAKER", "FOOTWEAR", "SLIPPER"],
    "electronics": [
        "CELLULAR_PHONE", "TABLET", "HEADPHONE", "EARBUD", "EARPHONE", "SPEAKER",
        "PORTABLE_ELECTRONIC", "LAPTOP", "CAMERA", "MONITOR", "KEYBOARD",
        "SMARTWATCH", "ELECTRONIC_DEVICE", "E_READER",
    ],
    "apparel": [
        "SHIRT", "DRESS", "PANTS", "TROUSER", "JACKET", "COAT", "SWEATER", "HOODIE",
        "OUTERWEAR", "SKIRT", "APPAREL", "JEAN", "BLOUSE", "SHORT",
    ],
    "home": [
        "HOME", "KITCHEN", "COOKWARE", "DINNERWARE", "CHAIR", "TABLE", "SOFA", "LAMP",
        "RUG", "MUG", "DRINKING_CUP", "BOWL", "PLATE", "FURNITURE", "DECOR",
        "BED_AND_BATH", "OTTOMAN", "STOOL", "VASE", "CLOCK",
    ],
}
# Excluded even if a keyword matches: a phone CASE/COVER is an accessory, not the
# device — its front/back-screen wear model doesn't apply, so we don't grade it here.
CATEGORY_EXCLUDE_KEYWORDS: list[str] = ["_CASE", "_COVER", "_SKIN", "_PROTECTOR"]

# How many clean ABO product images to pull PER category. Kept modest for a fast build;
# bump back up (e.g. 500) for a full-quality run. Categories that come up short (e.g.
# electronics is case-heavy in ABO) are reported in the build summary so we can rebalance.
NUM_ABO_PER_CATEGORY: int = 200

# Required + optional capture angles per category. The app asks for these; at inference
# each photo is graded and the scores are aggregated (worst-angle bounds the item).
# `id` is the angle tag, `diagnostic` is what that angle is FOR.
CATEGORY_CAPTURE: dict[str, list[dict[str, object]]] = {
    "footwear": [
        {"id": "sole", "label": "Sole", "required": True, "diagnostic": "tread & outsole abrasion"},
        {"id": "top", "label": "Top", "required": True, "diagnostic": "upper creasing, scuffs, toe box"},
        {"id": "heel", "label": "Heel", "required": False, "diagnostic": "heel drag & counter wear"},
    ],
    "electronics": [
        {"id": "front", "label": "Front", "required": True, "diagnostic": "screen scratches, cracks"},
        {"id": "back", "label": "Back", "required": True, "diagnostic": "casing dents, wear"},
        {"id": "edges", "label": "Edges", "required": False, "diagnostic": "port & frame damage"},
    ],
    "apparel": [
        {"id": "front", "label": "Front", "required": True, "diagnostic": "stains, pilling, holes"},
        {"id": "back", "label": "Back", "required": True, "diagnostic": "stains, wear, seams"},
        {"id": "label", "label": "Label", "required": False, "diagnostic": "size/care tag, authenticity"},
    ],
    "home": [
        {"id": "overall", "label": "Overall", "required": True, "diagnostic": "overall condition & finish"},
        {"id": "surface", "label": "Surface", "required": False, "diagnostic": "scratches, chips, coating wear"},
        {"id": "base", "label": "Base", "required": False, "diagnostic": "rust, base wear, residue"},
    ],
}

# Defect ops that actually occur on each category — the composer draws a grade's ops
# from this pool so the damage is product-appropriate (op names -> degradation.overlays).
CATEGORY_DEFECTS: dict[str, list[str]] = {
    "footwear": ["scratches", "dirt", "discoloration", "stain", "deformation"],
    "electronics": ["scratches", "crack", "discoloration", "dirt"],
    "apparel": ["stain", "discoloration", "dirt", "deformation"],
    "home": ["scratches", "stain", "dirt", "crack", "discoloration"],
}


def category_for_product_type(product_type: str) -> str | None:
    """Map an ABO product_type string to one of CATEGORIES, or None if it doesn't fit."""
    if not product_type:
        return None
    pt = product_type.upper()
    if any(x in pt for x in CATEGORY_EXCLUDE_KEYWORDS):
        return None
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(k in pt for k in keywords):
            return category
    return None


# --------------------------------------------------------------------------- #
# Source download sizes
# --------------------------------------------------------------------------- #
# COCO indoor backgrounds to keep after filtering.
NUM_COCO_BACKGROUNDS: int = 200
# Max defect-texture patches to keep per MVTec category (these are overlays,
# not training images, so a handful per category is plenty).
MVTEC_PATCHES_PER_CATEGORY: int = 40
MVTEC_CATEGORIES: list[str] = [
    "leather",
    "carpet",
    "tile",
    "wood",
    "metal_nut",
    "bottle",
]
# COCO things that imply an indoor / home environment. ("desk" and "floor"
# are not COCO classes, so we approximate "home" with these four.)
COCO_INDOOR_CATEGORIES: list[str] = ["couch", "chair", "dining table", "bed"]

# --------------------------------------------------------------------------- #
# Camera / capture simulation applied to every generated image
# --------------------------------------------------------------------------- #
CAMERA_MAX_ROTATION_DEG: float = 5.0
# Blur max reduced (1.2 -> 0.7): heavy blur smears away fine damage and erases
# the A/B distinction disproportionately.
CAMERA_BLUR_RADIUS: tuple[float, float] = (0.0, 0.7)
CAMERA_JPEG_QUALITY: tuple[int, int] = (60, 95)

# Network
DOWNLOAD_TIMEOUT_S: int = 60
DOWNLOAD_RETRIES: int = 3


def ensure_dirs() -> None:
    """Create every directory the pipeline writes to. Idempotent."""
    for d in (
        DATA_DIR,
        RAW_DIR,
        PROCESSED_DIR,
        ABO_RAW_DIR,
        MVTEC_RAW_DIR,
        COCO_RAW_DIR,
    ):
        d.mkdir(parents=True, exist_ok=True)
