"""Sanity-check the generated dataset.

    python verify_dataset.py

Prints a text histogram of the score distribution, checks every referenced
image file exists, renders 3 random samples per grade into
data/verification_grid.png, and exits non-zero if anything looks wrong.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

import config


def _resolve(rel: str) -> Path:
    p = Path(rel)
    return p if p.is_absolute() else config.BASE_DIR / p


def _text_histogram(scores: pd.Series, bins: int = 20, width: int = 50) -> None:
    print("\nScore distribution (0.0 → 1.0):")
    counts, edges = _histogram(scores.tolist(), bins)
    peak = max(counts) or 1
    for i, c in enumerate(counts):
        lo, hi = edges[i], edges[i + 1]
        bar = "#" * int(width * c / peak)
        print(f"  {lo:4.2f}-{hi:4.2f} | {bar} {c}")


def _histogram(values: list[float], bins: int) -> tuple[list[int], list[float]]:
    lo, hi = 0.0, 1.0
    step = (hi - lo) / bins
    edges = [lo + i * step for i in range(bins + 1)]
    counts = [0] * bins
    for v in values:
        idx = min(bins - 1, max(0, int((v - lo) / step)))
        counts[idx] += 1
    return counts, edges


def _sample_grid(df: pd.DataFrame) -> bool:
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from PIL import Image
    except Exception as e:  # noqa: BLE001
        print(f"  ! could not import matplotlib/PIL for grid: {e}")
        return False

    grades = list(config.GRADE_SCORE_RANGES.keys())
    per = 3
    fig, axes = plt.subplots(len(grades), per, figsize=(per * 3, len(grades) * 3))
    if len(grades) == 1:
        axes = [axes]

    for r, grade in enumerate(grades):
        sub = df[df["grade"] == grade]
        picks = sub.sample(n=min(per, len(sub)), random_state=config.RANDOM_SEED) if not sub.empty else sub
        for c in range(per):
            ax = axes[r][c] if len(grades) > 1 else axes[c]
            ax.axis("off")
            if c < len(picks):
                row = picks.iloc[c]
                path = _resolve(str(row["image_path"]))
                if path.exists():
                    ax.imshow(Image.open(path))
                ax.set_title(f"{grade}  s={row['score']:.2f}", fontsize=9)
    fig.tight_layout()
    fig.savefig(config.VERIFICATION_GRID, dpi=110)
    plt.close(fig)
    print(f"  wrote {config.VERIFICATION_GRID}")
    return True


def main() -> int:
    print("=" * 70)
    print("ai-grading — dataset verification")
    print("=" * 70)

    if not config.DATASET_CSV.exists():
        print(f"FAIL: {config.DATASET_CSV} not found. Run build_dataset.py first.")
        return 1

    df = pd.read_csv(config.DATASET_CSV)
    print(f"\nLoaded {len(df)} rows from {config.DATASET_CSV.name}")
    if df.empty:
        print("FAIL: dataset is empty.")
        return 1

    # Per-grade counts
    print("\nPer-grade counts:")
    for grade in config.GRADE_SCORE_RANGES:
        print(f"  {grade:<8} {int((df['grade'] == grade).sum())}")

    _text_histogram(df["score"])

    # Defects column parses as JSON lists
    bad_defects = 0
    for v in df["defects"]:
        try:
            json.loads(v)
        except Exception:  # noqa: BLE001
            bad_defects += 1

    # Missing files
    print("\nChecking image files exist…")
    missing = [p for p in df["image_path"] if not _resolve(str(p)).exists()]
    print(f"  missing: {len(missing)}")
    for p in missing[:5]:
        print(f"    - {p}")

    _sample_grid(df)

    # Verdict
    ok = (len(missing) == 0) and (bad_defects == 0)
    print("\n" + "=" * 70)
    if ok:
        print("PASS ✓  dataset looks healthy")
    else:
        print("FAIL ✗")
        if missing:
            print(f"  - {len(missing)} referenced images are missing")
        if bad_defects:
            print(f"  - {bad_defects} rows have unparseable defects")
    print("=" * 70)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
