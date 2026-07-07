"""Composes degradation operations into a single labelled training sample.

Given a clean product image and a target grade bucket, the composer:
  1. stacks the right number of defect ops at grade-appropriate intensity,
  2. composites the product onto a real indoor background (when available),
  3. simulates a phone-camera capture (rotation, blur, JPEG artifacts),
  4. samples a continuous 0..1 condition score inside the grade's range, and
  5. returns the image plus the list of defect labels applied.

The image work is randomised but seeded via the passed-in RNG, so the whole
dataset is reproducible from config.RANDOM_SEED.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageEnhance

import config
from degradation import overlays


@dataclass
class Sample:
    image: Image.Image
    score: float
    grade: str
    defects: list[str]
    category: str | None = None


def _lighting_jitter(img: Image.Image, rng: np.random.RandomState, amount: float) -> Image.Image:
    b = 1.0 + rng.uniform(-amount, amount)
    c = 1.0 + rng.uniform(-amount, amount)
    img = ImageEnhance.Brightness(img).enhance(b)
    img = ImageEnhance.Contrast(img).enhance(c)
    return img


def _segment_product_mask(arr: np.ndarray) -> np.ndarray:
    """Rough foreground mask: anything that isn't near-white catalog backdrop."""
    near_white = (arr > 235).all(axis=2)
    return ~near_white


def _square_resize(im: Image.Image) -> Image.Image:
    """Pad to a square (white) then resize to the model input size."""
    w, h = im.size
    s = max(w, h, 1)
    canvas = Image.new("RGB", (s, s), (255, 255, 255))
    canvas.paste(im, ((s - w) // 2, (s - h) // 2))
    return canvas.resize((config.IMAGE_SIZE, config.IMAGE_SIZE))


def _crop_to_product(clean: Image.Image, degraded: Image.Image) -> Image.Image:
    """Crop to the product's bounding box (from the clean image's foreground mask)
    so CLIP sees the item, not the catalog backdrop."""
    arr = np.asarray(clean.convert("RGB"))
    mask = _segment_product_mask(arr)
    ys, xs = np.where(mask)
    if len(xs) == 0:  # couldn't find a product — just resize
        return degraded.resize((config.IMAGE_SIZE, config.IMAGE_SIZE))
    pad = int(0.08 * max(degraded.size))
    x0 = max(0, int(xs.min()) - pad)
    y0 = max(0, int(ys.min()) - pad)
    x1 = min(degraded.width, int(xs.max()) + pad)
    y1 = min(degraded.height, int(ys.max()) + pad)
    return _square_resize(degraded.crop((x0, y0, x1, y1)))


def _composite_on_background(
    product: Image.Image, background: Image.Image, rng: np.random.RandomState
) -> Image.Image:
    """Paste the product (white backdrop removed) onto a scaled background crop."""
    size = config.IMAGE_SIZE
    bg = background.convert("RGB").resize((size, size))

    # Scale the product to occupy a believable chunk of the frame.
    scale = rng.uniform(*config.PRODUCT_SCALE_RANGE)
    pw = ph = int(size * scale)
    prod = product.convert("RGB").resize((pw, ph))
    arr = np.asarray(prod)
    mask = _segment_product_mask(arr)
    mask_img = Image.fromarray((mask * 255).astype(np.uint8), "L")

    canvas = bg.copy()
    ox = rng.randint(0, size - pw + 1)
    oy = rng.randint(0, size - ph + 1)
    canvas.paste(prod, (ox, oy), mask_img)
    return canvas


def _domain_randomize(img: Image.Image, rng: np.random.RandomState) -> Image.Image:
    """Score-independent nuisance variation (lighting/white-balance + occlusions)
    so the model learns to ignore context and key on the product's condition."""
    j = config.COLOR_JITTER
    img = ImageEnhance.Brightness(img).enhance(1.0 + rng.uniform(-j, j))
    img = ImageEnhance.Contrast(img).enhance(1.0 + rng.uniform(-j, j))
    img = ImageEnhance.Color(img).enhance(1.0 + rng.uniform(-j, j))

    n = int(rng.randint(0, config.OCCLUSION_MAX_BOXES + 1))
    if n:
        arr = np.asarray(img).copy()
        h, w, _ = arr.shape
        for _ in range(n):
            bw = rng.randint(int(0.08 * w), int(0.25 * w) + 1)
            bh = rng.randint(int(0.08 * h), int(0.25 * h) + 1)
            x = rng.randint(0, w - bw + 1)
            y = rng.randint(0, h - bh + 1)
            arr[y:y + bh, x:x + bw] = rng.randint(0, 256, 3)
        img = Image.fromarray(arr)
    return img


def _camera_sim(img: Image.Image, rng: np.random.RandomState) -> Image.Image:
    from PIL import ImageFilter

    # Rotation ±N degrees.
    angle = rng.uniform(-config.CAMERA_MAX_ROTATION_DEG, config.CAMERA_MAX_ROTATION_DEG)
    img = img.rotate(angle, resample=Image.BICUBIC, expand=False, fillcolor=(128, 128, 128))

    # Slight blur.
    radius = rng.uniform(*config.CAMERA_BLUR_RADIUS)
    if radius > 0.05:
        img = img.filter(ImageFilter.GaussianBlur(radius))

    # JPEG recompression artifacts.
    quality = int(rng.randint(config.CAMERA_JPEG_QUALITY[0], config.CAMERA_JPEG_QUALITY[1] + 1))
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=quality)
    buf.seek(0)
    return Image.open(buf).convert("RGB")


def _category_pools(category: str | None) -> tuple[list[str], list[str], list[str]]:
    """(full, global, loud) op pools for a category — so a grade's defects are drawn
    from what actually happens to THAT product type. Falls back to all synthetic ops."""
    full = list(config.CATEGORY_DEFECTS.get(category, [])) if category else []
    if not full:
        full = list(overlays.SYNTHETIC_OPS)
    glob = [o for o in config.GLOBAL_OPS if o in full] or list(config.GLOBAL_OPS)
    loud = [o for o in config.LOUD_OPS if o in full] or full
    return full, glob, loud


def _choose_ops(
    grade: str, rng: np.random.RandomState, has_mvtec: bool, category: str | None = None
) -> list[str]:
    full, glob, loud = _category_pools(category)
    recipe = config.GRADE_RECIPES[grade]
    lo, hi = recipe["op_count"]  # type: ignore[misc]
    n = int(rng.randint(lo, hi + 1)) if hi > 0 else 0

    # A: near-pristine but usually LIGHTLY USED. Most A samples get exactly one subtle
    # GLOBAL op (fade / light dust) — global so a frozen CLIP embedding actually shifts,
    # low-intensity so the item still reads as grade A. A pristine minority gets none.
    if grade == "A":
        if n == 0 or rng.rand() >= config.A_LIGHT_WEAR_PROB:
            return []
        return [glob[rng.randint(len(glob))]]

    if n == 0:
        return []

    # B: a single WHOLE-IMAGE degradation so the mildest damage still moves CLIP's
    # global embedding (otherwise B is indistinguishable from clean A).
    if grade == "B":
        idx = rng.choice(len(glob), size=min(n, len(glob)), replace=False)
        return [glob[i] for i in idx]

    # Salvage: loud, unmistakable (category-appropriate) defects so it always looks wrecked.
    if grade == "Salvage":
        pool = list(loud)
        if has_mvtec:
            pool = pool + ["mvtec_patch"]
        idx = rng.choice(len(pool), size=min(n, len(pool)), replace=False)
        return [pool[i] for i in idx]

    # C: guarantee at least one global op (so it shifts the embedding), then fill the
    # rest from the category pool for variety.
    first = glob[rng.randint(len(glob))]
    rest_pool = [o for o in full if o != first]
    if has_mvtec:
        rest_pool = rest_pool + ["mvtec_patch"]
    k = min(n - 1, len(rest_pool))
    rest_idx = rng.choice(len(rest_pool), size=k, replace=False) if k > 0 else []
    return [first] + [rest_pool[i] for i in rest_idx]


def compose(
    clean: Image.Image,
    grade: str,
    *,
    category: str | None = None,
    backgrounds: list[Image.Image] | None = None,
    mvtec_patches: list[Image.Image] | None = None,
    rng: np.random.RandomState | None = None,
) -> Sample:
    """Produce one labelled, degraded sample for `grade` (defects drawn from `category`)."""
    rng = rng if rng is not None else np.random.RandomState()
    backgrounds = backgrounds or []
    mvtec_patches = mvtec_patches or []
    recipe = config.GRADE_RECIPES[grade]
    int_lo, int_hi = recipe["intensity"]  # type: ignore[misc]

    img = clean.convert("RGB")
    defects: list[str] = []
    applied: list[tuple[str, float]] = []  # (op_name, intensity) for scoring

    ops = _choose_ops(grade, rng, has_mvtec=bool(mvtec_patches), category=category)
    for op_name in ops:
        intensity = float(rng.uniform(int_lo, int_hi))
        if op_name == "mvtec_patch":
            patch = mvtec_patches[rng.randint(0, len(mvtec_patches))]
            img = overlays.apply_mvtec_patch(img, patch, intensity, rng)
        else:
            img = overlays.SYNTHETIC_OPS[op_name](img, intensity, rng)
        defects.append(overlays.DEFECT_LABELS[op_name])
        applied.append((op_name, intensity))

    # Grade A: pristine — only gentle lighting variation, no defects.
    img = _lighting_jitter(img, rng, amount=0.12 if grade == "A" else 0.06)

    # Background: inject a real scene (optional) or crop to the product so the
    # condition signal isn't diluted by a random room.
    if config.BACKGROUND_INJECTION and backgrounds:
        bg = backgrounds[rng.randint(0, len(backgrounds))]
        img = _composite_on_background(img, bg, rng)
        # Domain randomization only makes sense with real-world context present.
        img = _domain_randomize(img, rng)
    else:
        img = _crop_to_product(clean, img)

    # Camera simulation (all grades).
    img = _camera_sim(img, rng)
    if img.size != (config.IMAGE_SIZE, config.IMAGE_SIZE):
        img = img.resize((config.IMAGE_SIZE, config.IMAGE_SIZE))

    # Score derives from the *visible* damage (intensity x loudness), placed
    # within the grade's band so heavier-looking items score lower — i.e. the
    # target is actually predictable from the pixels.
    lo, hi = config.GRADE_SCORE_RANGES[grade]
    if grade == "A":
        # Grade A: pos comes straight from the light-wear intensity (uniform mapping,
        # independent of which op) so A concentrates in 0.85-0.95. Pristine A (no op)
        # sits near the top of the band.
        if not applied:
            pos = float(rng.uniform(0.0, 0.30))
        else:
            pos = min(1.0, applied[0][1] / config.A_WEAR_NORM)
    elif not applied:
        pos = float(rng.uniform(0.0, 0.30))
    else:
        dmg = sum(inten * config.OP_SEVERITY[op] for op, inten in applied)
        pos = min(1.0, dmg / config.GRADE_DAMAGE_NORM[grade])
    score = hi - pos * (hi - lo)

    return Sample(image=img, score=round(score, 4), grade=grade, defects=defects, category=category)
