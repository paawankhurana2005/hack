"""Synthetic damage generator — the keystone of supervision.

Takes a CLEAN catalog image (e.g. ABO) and applies a controlled, known-severity
defect. Because we choose the defect type and intensity, the label is EXACT — this
manufactures graded (image, grade, defect, severity) examples across the whole
condition spectrum that no public dataset provides. It also produces the clean<->damaged
pairs the inference embedding-comparator is validated against.
"""
from __future__ import annotations

import random
from dataclasses import dataclass

from PIL import Image, ImageDraw, ImageFilter

from ..schema import grade_from_damage

# defect types we can synthesize -> canonical taxonomy names
SYNTH_DEFECTS = ("scratch", "crack", "dent", "stain", "contamination", "wear", "discoloration")


@dataclass
class DamagedExample:
    image: Image.Image
    defect_type: str
    severity: float      # 0..1
    damage_score: float  # 0..1
    grade: str


def _rng(seed: int) -> random.Random:
    return random.Random(seed)


def _scratch(img: Image.Image, sev: float, rng: random.Random) -> Image.Image:
    d = ImageDraw.Draw(img, "RGBA")
    w, h = img.size
    n = 1 + int(sev * 5)
    for _ in range(n):
        x0, y0 = rng.randint(0, w), rng.randint(0, h)
        x1, y1 = x0 + rng.randint(-w // 3, w // 3), y0 + rng.randint(-h // 3, h // 3)
        width = max(1, int(1 + sev * 3))
        shade = int(120 + 80 * rng.random())
        d.line([(x0, y0), (x1, y1)], fill=(shade, shade, shade, int(120 + 120 * sev)), width=width)
    return img


def _crack(img: Image.Image, sev: float, rng: random.Random) -> Image.Image:
    d = ImageDraw.Draw(img, "RGBA")
    w, h = img.size
    x, y = rng.randint(w // 4, 3 * w // 4), rng.randint(h // 4, 3 * h // 4)
    segs = 4 + int(sev * 10)
    for _ in range(segs):
        nx, ny = x + rng.randint(-40, 40), y + rng.randint(-40, 40)
        d.line([(x, y), (nx, ny)], fill=(15, 15, 15, int(150 + 100 * sev)), width=max(1, int(1 + sev * 2)))
        x, y = max(0, min(w, nx)), max(0, min(h, ny))
    return img


def _dent(img: Image.Image, sev: float, rng: random.Random) -> Image.Image:
    w, h = img.size
    r = int(min(w, h) * (0.08 + 0.18 * sev))
    cx, cy = rng.randint(r, w - r), rng.randint(r, h - r)
    patch = img.crop((cx - r, cy - r, cx + r, cy + r)).filter(ImageFilter.GaussianBlur(2 + 4 * sev))
    overlay = Image.new("RGBA", patch.size, (0, 0, 0, int(80 * sev)))
    patch = Image.alpha_composite(patch.convert("RGBA"), overlay).convert("RGB")
    img.paste(patch, (cx - r, cy - r))
    return img


def _stain(img: Image.Image, sev: float, rng: random.Random) -> Image.Image:
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    w, h = img.size
    r = int(min(w, h) * (0.06 + 0.16 * sev))
    cx, cy = rng.randint(r, w - r), rng.randint(r, h - r)
    col = (rng.randint(60, 120), rng.randint(40, 90), rng.randint(20, 60), int(90 + 120 * sev))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)
    overlay = overlay.filter(ImageFilter.GaussianBlur(3))
    return Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")


def _contamination(img: Image.Image, sev: float, rng: random.Random) -> Image.Image:
    d = ImageDraw.Draw(img, "RGBA")
    w, h = img.size
    for _ in range(int(20 + sev * 120)):
        x, y = rng.randint(0, w), rng.randint(0, h)
        rr = rng.randint(1, max(2, int(2 + sev * 4)))
        g = rng.randint(20, 90)
        d.ellipse([x, y, x + rr, y + rr], fill=(g, g, g, int(120 + 100 * sev)))
    return img


def _wear(img: Image.Image, sev: float, rng: random.Random) -> Image.Image:
    # global fade + slight desaturation simulates overall wear
    from PIL import ImageEnhance
    img = ImageEnhance.Color(img).enhance(1.0 - 0.4 * sev)
    img = ImageEnhance.Contrast(img).enhance(1.0 - 0.25 * sev)
    return _scratch(img, sev * 0.5, rng)


def _discoloration(img: Image.Image, sev: float, rng: random.Random) -> Image.Image:
    tint = Image.new("RGBA", img.size, (rng.randint(120, 200), rng.randint(100, 160), 40, int(50 * sev)))
    return Image.alpha_composite(img.convert("RGBA"), tint).convert("RGB")


_OPS = {
    "scratch": _scratch,
    "crack": _crack,
    "dent": _dent,
    "stain": _stain,
    "contamination": _contamination,
    "wear": _wear,
    "discoloration": _discoloration,
}


class DamageGenerator:
    """Deterministic given (image, seed)."""

    def __init__(self, base_seed: int = 0):
        self.base_seed = base_seed

    def generate(self, clean: Image.Image, idx: int) -> DamagedExample:
        rng = _rng(self.base_seed + idx * 7919)
        defect = rng.choice(SYNTH_DEFECTS)
        # bias severity to cover the spectrum (uniform), occasional pristine-ish
        sev = round(rng.random() ** 0.9, 4)
        img = clean.convert("RGB").copy()
        img = _OPS[defect](img, sev, rng)
        # global damage tracks the worst single defect here (one synthetic defect/img)
        damage = round(min(1.0, sev * 0.95 + 0.03), 4)
        return DamagedExample(
            image=img,
            defect_type=defect,
            severity=sev,
            damage_score=damage,
            grade=grade_from_damage(damage),
        )
