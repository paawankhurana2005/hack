"""Fine-tune CLIP's vision tail + a condition-score head on the synthetic dataset.

    python train.py

Why fine-tune (not the old frozen-feature head): a FROZEN CLIP summarises the whole
image into one vector, so a lightly-worn grade-A item and a mildly-damaged grade-B item
land in almost the same place — the head then regresses everything to the middle and
can't hit the 0.85-0.95 band precisely. Unfreezing the last few vision blocks lets the
embedding become condition-sensitive, which is what the local-reroute use case needs.

Pixel tensors are constant across epochs, so we preprocess them ONCE (in RAM) and then
run CLIP forward/backward over that — the encoder's tail and the head train together
with differential learning rates (head fast, backbone 100x slower). CPU-only; kept small
via config.FINETUNE_* so it finishes in a reasonable time.
"""

from __future__ import annotations

import time

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from PIL import Image
from torch.utils.data import DataLoader, TensorDataset
from tqdm import tqdm

import config
from model import BACKBONE, MODEL_PATH, GraderModel, bucket, save_checkpoint

DEVICE = torch.device("cpu")
VAL_FRACTION = 0.20
CURVE_PATH = config.DATA_DIR / "training_curve.png"


def subsample(df: pd.DataFrame, rng: np.random.RandomState) -> pd.DataFrame:
    """Stratified subsample to config.FINETUNE_MAX_SAMPLES (keeps the grade mix)."""
    cap = config.FINETUNE_MAX_SAMPLES
    if not cap or len(df) <= cap:
        return df.reset_index(drop=True)
    frac = cap / len(df)
    parts = []
    for grade in config.GRADE_SCORE_RANGES:
        sub = df[df["grade"] == grade]
        n = max(1, int(round(len(sub) * frac)))
        parts.append(sub.sample(n=min(n, len(sub)), random_state=config.RANDOM_SEED))
    out = pd.concat(parts).sample(frac=1.0, random_state=config.RANDOM_SEED)
    return out.reset_index(drop=True)


def stratified_split(df: pd.DataFrame, rng: np.random.RandomState) -> tuple[np.ndarray, np.ndarray]:
    train_idx: list[int] = []
    val_idx: list[int] = []
    for grade in config.GRADE_SCORE_RANGES:
        idx = df.index[df["grade"] == grade].to_numpy().copy()
        rng.shuffle(idx)
        n_val = int(round(len(idx) * VAL_FRACTION))
        val_idx.extend(idx[:n_val].tolist())
        train_idx.extend(idx[n_val:].tolist())
    rng.shuffle(train_idx)
    rng.shuffle(val_idx)
    return np.array(train_idx), np.array(val_idx)


def preprocess_pixels(df: pd.DataFrame, processor) -> torch.Tensor:
    """Preprocess every image to a CLIP pixel tensor ONCE (constant across epochs)."""
    paths = df["image_path"].tolist()
    px = torch.empty((len(paths), 3, 224, 224), dtype=torch.float32)
    for start in tqdm(range(0, len(paths), 32), desc="  preprocessing images", unit="batch"):
        batch = paths[start:start + 32]
        imgs = [Image.open(config.BASE_DIR / p).convert("RGB") for p in batch]
        out = processor(images=imgs, return_tensors="pt")
        px[start:start + len(batch)] = out["pixel_values"]
    return px


def main() -> int:
    print("=" * 70)
    print("ai-grading — fine-tune CLIP vision tail + condition head")
    print("=" * 70)

    if not config.DATASET_CSV.exists():
        print(f"FATAL: {config.DATASET_CSV} not found. Run build_dataset.py first.")
        return 1

    torch.manual_seed(config.RANDOM_SEED)
    rng = np.random.RandomState(config.RANDOM_SEED)

    df = pd.read_csv(config.DATASET_CSV)
    df = subsample(df, rng)
    print(f"\nDataset: {len(df)} samples (unfreeze last {config.FINETUNE_UNFREEZE_LAST_N} "
          f"CLIP blocks, {config.FINETUNE_EPOCHS} epochs)")

    from transformers import CLIPProcessor

    print("\n[1/3] Preprocessing images (once)")
    processor = CLIPProcessor.from_pretrained(BACKBONE)
    pixels = preprocess_pixels(df, processor)
    targets = torch.tensor(df["score"].to_numpy(), dtype=torch.float32)

    train_idx, val_idx = stratified_split(df, rng)
    print(f"  split: {len(train_idx)} train / {len(val_idx)} val (stratified by grade)")
    train_loader = DataLoader(
        TensorDataset(pixels[train_idx], targets[train_idx]),
        batch_size=config.FINETUNE_BATCH, shuffle=True,
    )
    val_loader = DataLoader(
        TensorDataset(pixels[val_idx], targets[val_idx]),
        batch_size=config.FINETUNE_BATCH, shuffle=False,
    )

    print("\n[2/3] Fine-tuning")
    model = GraderModel(unfreeze_last_n=config.FINETUNE_UNFREEZE_LAST_N).to(DEVICE)
    n_bb = sum(p.numel() for p in model.trainable_backbone_params())
    n_head = sum(p.numel() for p in model.head.parameters())
    print(f"  trainable params: head {n_head/1e3:.0f}k + backbone {n_bb/1e6:.1f}M")

    loss_fn = nn.MSELoss()
    groups: list[dict] = [{"params": list(model.head.parameters()), "lr": config.LR_HEAD}]
    bb = model.trainable_backbone_params()
    if bb:  # only when the CLIP tail is unfrozen (FINETUNE_UNFREEZE_LAST_N > 0)
        groups.append({"params": bb, "lr": config.LR_BACKBONE})
    optimizer = torch.optim.AdamW(groups, weight_decay=1e-4)

    best_val = float("inf")
    train_curve: list[float] = []
    val_curve: list[float] = []

    for epoch in range(1, config.FINETUNE_EPOCHS + 1):
        model.train()
        running = 0.0
        seen = 0
        t0 = time.time()
        for px, tgt in tqdm(train_loader, desc=f"  epoch {epoch:02d}/{config.FINETUNE_EPOCHS}", unit="batch"):
            preds = model(px.to(DEVICE))
            loss = loss_fn(preds, tgt.to(DEVICE))
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], 1.0)
            optimizer.step()
            running += loss.item() * tgt.size(0)
            seen += tgt.size(0)
        train_loss = running / seen

        model.eval()
        v_loss = 0.0
        v_abs = 0.0
        v_n = 0
        with torch.no_grad():
            for px, tgt in val_loader:
                preds = model(px.to(DEVICE))
                v_loss += loss_fn(preds, tgt.to(DEVICE)).item() * tgt.size(0)
                v_abs += (preds - tgt.to(DEVICE)).abs().sum().item()
                v_n += tgt.size(0)
        val_loss = v_loss / v_n
        val_mae = v_abs / v_n

        train_curve.append(train_loss)
        val_curve.append(val_loss)
        marker = ""
        if val_loss < best_val:
            best_val = val_loss
            save_checkpoint(model, MODEL_PATH, val_loss=val_loss, epoch=epoch)
            marker = "  <- best (saved)"
        print(f"    epoch {epoch:02d}  train_mse={train_loss:.4f}  val_mse={val_loss:.4f}  "
              f"val_mae={val_mae:.4f}  ({time.time()-t0:.0f}s){marker}")

    print(f"\n  best val MSE: {best_val:.4f}  ->  {MODEL_PATH.name}")

    # ---- Per-grade breakdown on val (reload the best checkpoint) ---------- #
    print("\n[3/3] Validation sanity eval (best checkpoint)")
    from model import load_grader

    load_grader.cache_clear()
    best_model, _ = load_grader("cpu")
    with torch.no_grad():
        preds = []
        for start in range(0, len(val_idx), config.FINETUNE_BATCH):
            b = val_idx[start:start + config.FINETUNE_BATCH]
            preds.append(best_model(pixels[b]).numpy())
    val_preds = np.concatenate(preds) if preds else np.array([])
    val_actual = targets[val_idx].numpy()
    val_grades = df.loc[val_idx, "grade"].to_numpy()

    print(f"  overall val MAE: {float(np.abs(val_preds - val_actual).mean()):.4f}")
    print(f"    {'grade':<8}{'n':>6}{'avg_pred':>10}{'avg_actual':>12}{'MAE':>8}")
    for grade in config.GRADE_SCORE_RANGES:
        mask = val_grades == grade
        if not mask.any():
            continue
        p = val_preds[mask]
        a = val_actual[mask]
        print(f"    {grade:<8}{int(mask.sum()):>6}{p.mean():>10.3f}{a.mean():>12.3f}"
              f"{np.abs(p - a).mean():>8.3f}")

    plt.figure(figsize=(7, 4))
    epochs = range(1, config.FINETUNE_EPOCHS + 1)
    plt.plot(epochs, train_curve, label="train MSE", marker="o", ms=3)
    plt.plot(epochs, val_curve, label="val MSE", marker="o", ms=3)
    plt.xlabel("epoch"); plt.ylabel("MSE loss"); plt.title("Condition fine-tune")
    plt.legend(); plt.grid(alpha=0.3); plt.tight_layout()
    plt.savefig(CURVE_PATH, dpi=110); plt.close()
    print(f"\n  loss curve -> {CURVE_PATH.name}")
    print("\nDone. Try: python inference.py footwear sole:<img> top:<img>")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
