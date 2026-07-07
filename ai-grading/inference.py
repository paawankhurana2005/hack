"""Run the trained condition grader on product photos.

    # single image
    python inference.py path/to/image.jpg

    # multi-angle (per-category required photos)
    python inference.py footwear sole:sole.jpg top:top.jpg [heel:heel.jpg]

Or import it:

    from inference import grade_image, grade_images
    grade_image("photo.jpg")                      # -> {score, grade, confidence}
    grade_images({"sole": "s.jpg", "top": "t.jpg"}, "footwear")
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch
from PIL import Image

import config
from model import bucket, calibrate, load_grader

# Confidence is a placeholder for now — we'll derive a real one later
# (e.g. from prediction spread or boundary distance).
CONFIDENCE_PLACEHOLDER = 0.85


def grade_image(image_path: str) -> dict:
    """Predict condition for one image. Returns {score, grade, confidence}."""
    model, processor = load_grader("cpu")
    img = Image.open(image_path).convert("RGB")
    inputs = processor(images=img, return_tensors="pt")
    with torch.no_grad():
        score = calibrate(float(model(inputs["pixel_values"]).item()))
    return {"score": round(score, 4), "grade": bucket(score), "confidence": CONFIDENCE_PLACEHOLDER}


# --------------------------------------------------------------------------- #
# Category capture spec + multi-angle grading
# --------------------------------------------------------------------------- #
def capture_spec(category: str | None) -> list[dict]:
    """The photo angles a category asks for (see config.CATEGORY_CAPTURE)."""
    return config.CATEGORY_CAPTURE.get(category, []) if category else []


def required_angles(category: str | None) -> list[str]:
    return [a["id"] for a in capture_spec(category) if a.get("required")]


def _aggregate(scores: list[float]) -> float:
    """Combine per-angle scores into one condition score. The worst angle BOUNDS the
    item (it's only as good as its most-worn view), softened by the mean so a single
    bad photo can't fully tank an otherwise-fine item."""
    import numpy as np

    s = np.asarray(scores, dtype=float)
    return float(0.7 * s.min() + 0.3 * s.mean())


def grade_images(images: dict[str, str] | list[str], category: str | None = None) -> dict:
    """Grade a product from its required-angle photos and aggregate to one score.

    `images` is either {angle_id: path} (preferred — enables the missing-angle check)
    or a plain list of paths. Returns the overall score/grade, the per-angle breakdown,
    and any missing required angles (which route the item to human review)."""
    items = list(images.items()) if isinstance(images, dict) else [(None, p) for p in images]
    per = []
    for angle, path in items:
        r = grade_image(path)
        per.append({"angle": angle, "score": r["score"], "grade": r["grade"]})

    scores = [p["score"] for p in per]
    overall = round(_aggregate(scores), 4) if scores else 0.0
    captured = {a for a, _ in items if a}
    missing = [a for a in required_angles(category) if a not in captured] if category else []
    return {
        "score": overall,
        "grade": bucket(overall),
        "confidence": CONFIDENCE_PLACEHOLDER,
        "category": category,
        "per_angle": per,
        "missing_required": missing,
        "needs_review": bool(missing),
    }


def _usage() -> None:
    print("usage:")
    print("  single image : python inference.py <image.jpg>")
    print("  multi-angle  : python inference.py <category> <angle>:<path> [<angle>:<path> ...]")
    print(f"  categories   : {', '.join(config.CATEGORIES)}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        _usage()
        raise SystemExit(1)

    if args[0] in config.CATEGORIES:
        category = args[0]
        images: dict[str, str] = {}
        for i, a in enumerate(args[1:]):
            angle, _, path = a.partition(":")
            if not path:  # bare path, no angle tag
                angle, path = f"img{i}", a
            if not Path(path).exists():
                print(f"error: file not found: {path}")
                raise SystemExit(1)
            images[angle] = path
        if not images:
            _usage()
            raise SystemExit(1)
        print(json.dumps(grade_images(images, category), indent=2))
    else:
        path = args[0]
        if not Path(path).exists():
            print(f"error: file not found: {path}")
            raise SystemExit(1)
        print(json.dumps(grade_image(path), indent=2))
