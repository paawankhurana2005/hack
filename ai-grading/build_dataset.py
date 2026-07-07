"""End-to-end synthetic dataset builder.

Run once, top to bottom:

    python build_dataset.py

It downloads the source images, synthesises degraded variants balanced across
grade buckets, writes every image to data/processed/, and emits a labelled
data/dataset.csv. Every step prints what it is doing; nothing requires manual
intervention once started. Re-running is safe — downloads and (optionally)
existing processed images are skipped.
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image
from tqdm import tqdm

import config
from degradation import composer
from downloaders import abo, coco_backgrounds, mvtec


def _seed_everything() -> None:
    random.seed(config.RANDOM_SEED)
    np.random.seed(config.RANDOM_SEED)


def _safe_open(path: Path) -> Image.Image | None:
    try:
        with Image.open(path) as im:
            return im.convert("RGB").copy()
    except Exception:  # noqa: BLE001
        return None


def _assign_grades(total: int, rng: np.random.RandomState) -> list[str]:
    grades = list(config.GRADE_DISTRIBUTION.keys())
    probs = np.array([config.GRADE_DISTRIBUTION[g] for g in grades], dtype=float)
    probs /= probs.sum()
    return list(rng.choice(grades, size=total, p=probs))


def main() -> int:
    print("=" * 70)
    print("ai-grading — synthetic condition dataset builder")
    print("=" * 70)
    _seed_everything()
    config.ensure_dirs()

    failures: dict[str, str] = {}

    # ---- 1. Download sources (each is best-effort) ------------------------ #
    print("\n[1/4] Downloading sources")
    try:
        clean_items = abo.download()  # list of (path, category)
    except Exception as e:  # noqa: BLE001
        clean_items, failures["abo"] = [], str(e)
        print(f"  ! ABO download error: {e}")

    try:
        mvtec_patch_paths = mvtec.download()
    except Exception as e:  # noqa: BLE001
        mvtec_patch_paths, failures["mvtec"] = [], str(e)
        print(f"  ! MVTec download error: {e}")

    if config.BACKGROUND_INJECTION:
        try:
            bg_paths = coco_backgrounds.download()
        except Exception as e:  # noqa: BLE001
            bg_paths, failures["coco"] = [], str(e)
            print(f"  ! COCO download error: {e}")
    else:
        bg_paths = []
        print("  - skipping COCO backgrounds (crop-only, BACKGROUND_INJECTION=False)")

    if not clean_items:
        print("\nFATAL: no clean ABO product images available — cannot build a "
              "dataset. Check your network and retry.")
        return 1

    # Preload the (small) MVTec patch set; backgrounds are opened on demand.
    mvtec_imgs = [im for p in mvtec_patch_paths if (im := _safe_open(p)) is not None]
    cat_counts = {c: sum(1 for _, cc in clean_items if cc == c) for c in config.CATEGORIES}
    print(f"\nSources ready: {len(clean_items)} products {cat_counts}, "
          f"{len(bg_paths)} backgrounds, {len(mvtec_imgs)} defect patches")

    # ---- 2. Plan the augmentations --------------------------------------- #
    print("\n[2/4] Planning augmentations")
    rng = np.random.RandomState(config.RANDOM_SEED)
    total = len(clean_items) * config.AUGMENTATIONS_PER_IMAGE
    grade_plan = _assign_grades(total, rng)
    print(f"  {len(clean_items)} images x {config.AUGMENTATIONS_PER_IMAGE} augs "
          f"= {total} target samples")

    # ---- 3. Synthesise -------------------------------------------------- #
    print("\n[3/4] Synthesising degraded samples")
    rows: list[dict[str, object]] = []
    gen_failures = 0
    slot = 0
    bar = tqdm(total=total, desc="  generating", unit="img")

    for src_path, category in clean_items:
        clean = _safe_open(src_path)
        if clean is None:
            slot += config.AUGMENTATIONS_PER_IMAGE
            bar.update(config.AUGMENTATIONS_PER_IMAGE)
            gen_failures += config.AUGMENTATIONS_PER_IMAGE
            continue

        for _ in range(config.AUGMENTATIONS_PER_IMAGE):
            grade = grade_plan[slot]
            bg = None
            if config.BACKGROUND_INJECTION and bg_paths:
                bg = _safe_open(bg_paths[rng.randint(0, len(bg_paths))])
            try:
                sample = composer.compose(
                    clean,
                    grade,
                    category=category,
                    backgrounds=[bg] if bg is not None else None,
                    mvtec_patches=mvtec_imgs,
                    rng=rng,
                )
                out_name = f"{slot:06d}_{category}_{grade}.jpg"
                out_path = config.PROCESSED_DIR / out_name
                sample.image.save(out_path, format="JPEG", quality=92)
                rows.append(
                    {
                        "image_path": f"data/processed/{out_name}",
                        "score": sample.score,
                        "grade": sample.grade,
                        "category": category,
                        "defects": json.dumps(sample.defects),
                        "source_image": src_path.name,
                    }
                )
            except Exception as e:  # noqa: BLE001
                gen_failures += 1
                if gen_failures <= 5:
                    print(f"\n  ! sample {slot} failed: {e}")
            slot += 1
            bar.update(1)
    bar.close()

    # ---- 4. Write CSV + summary ----------------------------------------- #
    print("\n[4/4] Writing dataset.csv")
    df = pd.DataFrame(
        rows,
        columns=["image_path", "score", "grade", "category", "defects", "source_image"],
    )
    df.to_csv(config.DATASET_CSV, index=False)
    print(f"  wrote {config.DATASET_CSV} ({len(df)} rows)")

    _print_summary(df, gen_failures, failures)
    return 0


def _print_summary(df: pd.DataFrame, gen_failures: int, dl_failures: dict[str, str]) -> None:
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    if df.empty:
        print("  No samples generated.")
        return

    print(f"  Total samples: {len(df)}")
    print("\n  Per-grade counts and score range:")
    for grade in config.GRADE_SCORE_RANGES:
        sub = df[df["grade"] == grade]
        if sub.empty:
            print(f"    {grade:<8} 0")
            continue
        pct = 100 * len(sub) / len(df)
        print(f"    {grade:<8} {len(sub):>6}  ({pct:4.1f}%)  "
              f"score min={sub['score'].min():.2f} "
              f"mean={sub['score'].mean():.2f} max={sub['score'].max():.2f}")

    print(f"\n  Overall score: min={df['score'].min():.2f} "
          f"mean={df['score'].mean():.2f} max={df['score'].max():.2f}")

    if "category" in df.columns:
        print("\n  Per-category counts:")
        for cat in config.CATEGORIES:
            sub = df[df["category"] == cat]
            if sub.empty:
                print(f"    {cat:<12} 0")
                continue
            print(f"    {cat:<12} {len(sub):>6}  ({100*len(sub)/len(df):4.1f}%)  "
                  f"score mean={sub['score'].mean():.2f}")

    if gen_failures:
        print(f"\n  Generation failures (skipped): {gen_failures}")
    if dl_failures:
        print("\n  Download issues:")
        for k, v in dl_failures.items():
            print(f"    - {k}: {v}")
    else:
        print("\n  Downloads: OK")
    print("\nDone. Next: `python verify_dataset.py`")


if __name__ == "__main__":
    sys.exit(main())
