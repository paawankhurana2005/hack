"""Evaluate the trained grader on the validation split — the metric that matters for
the app: how often does it land an item in the right grade bucket, and how tight is the
score error (especially in the 0.85-0.95 band the local-reroute model lives in)?

    python evaluate.py

Reproduces train.py's subsample + stratified split, runs the fine-tuned grader over the
val images, and prints a confusion matrix, per-bucket precision/recall/F1, overall bucket
accuracy, overall score MAE, and the MAE restricted to the 0.85-0.95 band.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import torch
from PIL import Image

import config
from model import bucket, calibrate, load_grader
from train import stratified_split, subsample

GRADES = list(config.GRADE_SCORE_RANGES.keys())  # A, B, C, Salvage


def main() -> int:
    print("=" * 70)
    print("ai-grading — validation evaluation (bucket accuracy + in-band MAE)")
    print("=" * 70)

    if not config.DATASET_CSV.exists():
        print("FATAL: dataset.csv missing — run build_dataset.py first.")
        return 1

    rng = np.random.RandomState(config.RANDOM_SEED)
    df = subsample(pd.read_csv(config.DATASET_CSV), rng)
    _, val_idx = stratified_split(df, rng)

    model, processor = load_grader("cpu")
    val = df.loc[val_idx]
    preds = np.empty(len(val_idx), dtype=np.float32)
    paths = val["image_path"].tolist()
    with torch.no_grad():
        for start in range(0, len(paths), 32):
            batch = paths[start:start + 32]
            imgs = [Image.open(config.BASE_DIR / p).convert("RGB") for p in batch]
            px = processor(images=imgs, return_tensors="pt")["pixel_values"]
            raw = model(px).numpy()
            preds[start:start + len(batch)] = [calibrate(float(s)) for s in raw]

    actual_scores = val["score"].to_numpy()
    actual_grades = val["grade"].to_numpy()
    pred_grades = np.array([bucket(float(s)) for s in preds])

    # ---- Confusion matrix (rows = actual, cols = predicted) -------------- #
    idx = {g: i for i, g in enumerate(GRADES)}
    cm = np.zeros((len(GRADES), len(GRADES)), dtype=int)
    for a, p in zip(actual_grades, pred_grades):
        cm[idx[a], idx[p]] += 1

    print("\nConfusion matrix  (rows = actual, cols = predicted)")
    print("  " + "actual \\ pred".ljust(14) + "".join(g.rjust(9) for g in GRADES) + "   total")
    for i, g in enumerate(GRADES):
        row = "".join(str(cm[i, j]).rjust(9) for j in range(len(GRADES)))
        print(f"  {g.ljust(14)}{row}{str(cm[i].sum()).rjust(8)}")

    print("\nPer-bucket precision / recall / F1:")
    print(f"  {'grade':<10}{'precision':>11}{'recall':>9}{'f1':>8}{'support':>9}")
    for i, g in enumerate(GRADES):
        tp = cm[i, i]
        support = cm[i].sum()
        pred_pos = cm[:, i].sum()
        precision = tp / pred_pos if pred_pos else 0.0
        recall = tp / support if support else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
        print(f"  {g:<10}{precision:>11.3f}{recall:>9.3f}{f1:>8.3f}{support:>9}")

    accuracy = float((pred_grades == actual_grades).mean())
    mae = float(np.abs(preds - actual_scores).mean())
    off_by = np.abs([idx[p] - idx[a] for a, p in zip(actual_grades, pred_grades)])
    within_one = float((off_by <= 1).mean())
    band = (actual_scores >= 0.85) & (actual_scores <= 0.95)
    band_mae = float(np.abs(preds[band] - actual_scores[band]).mean()) if band.any() else float("nan")

    print("\n" + "=" * 70)
    print(f"  Bucket accuracy (exact):   {accuracy:.3f}")
    print(f"  Within 1 bucket:           {within_one:.3f}")
    print(f"  Score MAE (all):           {mae:.3f}")
    print(f"  Score MAE (0.85-0.95 band):{band_mae:.3f}   (n={int(band.sum())})")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
