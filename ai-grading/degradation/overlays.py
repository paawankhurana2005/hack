"""Individual degradation operations.

Every operation has the same shape:

    op(image: PIL.Image, intensity: float, rng=None) -> PIL.Image

`intensity` is 0..1 (how severe). `rng` is an optional numpy RandomState for
reproducibility; when omitted a fresh default RNG is used. Inputs are RGB PIL
images and outputs are RGB PIL images, so operations compose freely.
"""

from __future__ import annotations

import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFilter

# Human-readable label for each op, surfaced in the dataset `defects` column so
# it lines up with ReturnGradingResult.defects in packages/shared.
DEFECT_LABELS: dict[str, str] = {
    "scratches": "Surface scratches",
    "stain": "Staining",
    "discoloration": "Discoloration / fading",
    "dirt": "Dirt / grime",
    "crack": "Crack",
    "deformation": "Dent / deformation",
    "mvtec_patch": "Material defect",
}


def _rng(rng: np.random.RandomState | None) -> np.random.RandomState:
    return rng if rng is not None else np.random.RandomState()


def _to_np(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert("RGB")).copy()


def _to_img(arr: np.ndarray) -> Image.Image:
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")


# --------------------------------------------------------------------------- #
def add_scratches(image: Image.Image, intensity: float, rng=None) -> Image.Image:
    """Thin randomized line overlays, slightly darker than the surface."""
    rng = _rng(rng)
    img = image.convert("RGB")
    w, h = img.size
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    count = int(1 + intensity * 10)
    base = _to_np(img)
    mean = base.reshape(-1, 3).mean(axis=0)
    dark = tuple(int(max(0, c - 60)) for c in mean)  # darker than surface

    for _ in range(count):
        x0 = rng.randint(0, w)
        y0 = rng.randint(0, h)
        angle = rng.uniform(0, np.pi)
        length = rng.uniform(0.1, 0.5) * max(w, h)
        x1 = int(x0 + np.cos(angle) * length)
        y1 = int(y0 + np.sin(angle) * length)
        width = rng.randint(1, 2 + int(intensity * 2))
        alpha = int(80 + intensity * 120)
        draw.line([(x0, y0), (x1, y1)], fill=(*dark, alpha), width=width)

    return Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")


def add_stain(image: Image.Image, intensity: float, rng=None) -> Image.Image:
    """Irregular blob with a brown/yellow colour shift in a random region."""
    rng = _rng(rng)
    img = image.convert("RGB")
    w, h = img.size

    # Build an irregular blob mask from a perturbed polygon, then blur it soft.
    mask = Image.new("L", (w, h), 0)
    mdraw = ImageDraw.Draw(mask)
    cx, cy = rng.randint(0, w), rng.randint(0, h)
    radius = (0.08 + intensity * 0.22) * min(w, h)
    pts = []
    for k in range(12):
        ang = 2 * np.pi * k / 12
        rr = radius * rng.uniform(0.6, 1.4)
        pts.append((cx + np.cos(ang) * rr, cy + np.sin(ang) * rr))
    mdraw.polygon(pts, fill=int(120 + intensity * 100))
    mask = mask.filter(ImageFilter.GaussianBlur(radius * 0.3))

    # Brown/yellow tint layer.
    tint = Image.new("RGB", (w, h), (120, 90, 40))
    out = Image.composite(Image.blend(img, tint, 0.5), img, mask)
    return out


def add_discoloration(image: Image.Image, intensity: float, rng=None) -> Image.Image:
    """Hue shift + saturation reduction across the whole image (fading)."""
    rng = _rng(rng)
    arr = _to_np(image)
    hsv = cv2.cvtColor(arr, cv2.COLOR_RGB2HSV).astype(np.float32)
    hue_shift = rng.uniform(-15, 15) * intensity            # H in [0,179]
    sat_scale = 1.0 - 0.6 * intensity                        # fade colour
    val_scale = 1.0 - 0.1 * intensity                        # slight dulling
    hsv[..., 0] = (hsv[..., 0] + hue_shift) % 180
    hsv[..., 1] *= sat_scale
    hsv[..., 2] *= val_scale
    out = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)
    return _to_img(out)


def add_dirt(image: Image.Image, intensity: float, rng=None) -> Image.Image:
    """Brown-tinted gaussian noise sprinkled across the surface."""
    rng = _rng(rng)
    arr = _to_np(image).astype(np.float32)
    h, w, _ = arr.shape
    sigma = 10 + intensity * 60
    noise = rng.normal(0, sigma, (h, w, 1)).astype(np.float32)
    tint = np.array([90, 70, 40], dtype=np.float32) - 64.0   # brownish bias
    arr += noise + noise * (tint / 64.0)
    # Only apply to a random fraction of pixels for a speckled look.
    density = 0.2 + 0.6 * intensity
    keep = rng.rand(h, w, 1) < density
    base = _to_np(image).astype(np.float32)
    out = np.where(keep, arr, base)
    return _to_img(out)


def add_crack(image: Image.Image, intensity: float, rng=None) -> Image.Image:
    """Dark bezier-curve cracks radiating from a random origin."""
    rng = _rng(rng)
    arr = _to_np(image)
    h, w, _ = arr.shape

    def bezier(p0, p1, p2, n=60):
        t = np.linspace(0, 1, n)[:, None]
        return (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t ** 2 * p2

    branches = int(1 + intensity * 4)
    ox, oy = rng.randint(0, w), rng.randint(0, h)
    for _ in range(branches):
        p0 = np.array([ox, oy], dtype=np.float32)
        p2 = np.array([rng.randint(0, w), rng.randint(0, h)], dtype=np.float32)
        p1 = (p0 + p2) / 2 + rng.uniform(-1, 1, 2) * 0.3 * max(w, h)
        pts = bezier(p0, p1, p2).astype(np.int32)
        thickness = 1 + int(intensity * 2)
        cv2.polylines(arr, [pts], False, (20, 20, 20), thickness, cv2.LINE_AA)
    return _to_img(arr)


def add_deformation(image: Image.Image, intensity: float, rng=None) -> Image.Image:
    """Elastic warp on a random region — simulates dents / warping."""
    rng = _rng(rng)
    arr = _to_np(image)
    h, w, _ = arr.shape

    # Displacement fields, smoothed so the warp is locally coherent.
    from scipy.ndimage import gaussian_filter

    amp = (3 + intensity * 25)
    sigma = max(4.0, min(h, w) * 0.08)
    dx = gaussian_filter(rng.uniform(-1, 1, (h, w)), sigma) * amp
    dy = gaussian_filter(rng.uniform(-1, 1, (h, w)), sigma) * amp

    # Confine the warp to a random rectangular region.
    rx0, ry0 = rng.randint(0, w // 2), rng.randint(0, h // 2)
    rx1 = rng.randint(rx0 + w // 4, w)
    ry1 = rng.randint(ry0 + h // 4, h)
    region = np.zeros((h, w), dtype=np.float32)
    region[ry0:ry1, rx0:rx1] = 1.0
    region = gaussian_filter(region, sigma * 0.5)
    dx *= region
    dy *= region

    yy, xx = np.meshgrid(np.arange(h), np.arange(w), indexing="ij")
    map_x = (xx + dx).astype(np.float32)
    map_y = (yy + dy).astype(np.float32)
    out = cv2.remap(arr, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    return _to_img(out)


def apply_mvtec_patch(
    image: Image.Image, patch_image: Image.Image, intensity: float, rng=None
) -> Image.Image:
    """Alpha-blend a real MVTec defect texture onto the product at random scale/pos."""
    rng = _rng(rng)
    img = image.convert("RGBA")
    w, h = img.size

    scale = rng.uniform(0.15, 0.45)
    pw = max(8, int(w * scale))
    ph = max(8, int(h * scale))
    patch = patch_image.convert("RGB").resize((pw, ph))
    patch = patch.rotate(rng.uniform(0, 360), expand=True)
    pw, ph = patch.size

    opacity = int((0.3 + 0.6 * intensity) * 255)
    alpha = Image.new("L", patch.size, opacity)
    patch_rgba = patch.convert("RGBA")
    patch_rgba.putalpha(alpha)

    x = rng.randint(0, max(1, w - pw))
    y = rng.randint(0, max(1, h - ph))
    img.alpha_composite(patch_rgba, (int(x), int(y)))
    return img.convert("RGB")


# Registry of the synthetic (no-asset-needed) operations, keyed by name.
SYNTHETIC_OPS = {
    "scratches": add_scratches,
    "stain": add_stain,
    "discoloration": add_discoloration,
    "dirt": add_dirt,
    "crack": add_crack,
    "deformation": add_deformation,
}
