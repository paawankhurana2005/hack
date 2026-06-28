"""Training loop. Two-stage transfer learning: warmup with a frozen backbone
(heads only), then optionally unfreeze the last N DINOv2 blocks for fine-tuning.
Interleaves the SOP viewpoint-invariance objective when SOP data is present.

Run:  python -m reloop_grading.train --config configs/default.yaml [--data-root /path/to/mvtec_visa]
"""
from __future__ import annotations

import argparse
import itertools
import os
import time

import torch
from torch.utils.data import DataLoader

from .config import Config
from .model import GradingModel
from .losses import compute_losses, consistency_loss
from .data.dataset import build_datasets
from .registry import save_checkpoint


def resolve_device(pref: str) -> torch.device:
    if pref != "auto":
        return torch.device(pref)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def _build_optimizer(model: GradingModel, cfg: Config) -> torch.optim.Optimizer:
    head_params, backbone_params = [], []
    for n, p in model.named_parameters():
        if not p.requires_grad:
            continue
        (backbone_params if n.startswith("backbone.") else head_params).append(p)
    groups = [{"params": head_params, "lr": cfg.train.lr_heads}]
    if backbone_params:
        groups.append({"params": backbone_params, "lr": cfg.train.lr_backbone})
    return torch.optim.AdamW(groups, weight_decay=cfg.train.weight_decay)


def train(cfg: Config, data_root: str | None = None) -> str:
    torch.manual_seed(cfg.train.seed)
    device = resolve_device(cfg.train.device)
    print(f"[train] device={device}")

    train_ds, val_ds, cons_ds, stats = build_datasets(cfg, data_root)
    print(f"[train] dataset: {stats}")
    if len(train_ds) == 0:
        raise RuntimeError("No training samples assembled — check data sources / network.")

    train_loader = DataLoader(train_ds, batch_size=cfg.train.batch_size, shuffle=True,
                              num_workers=cfg.data.num_workers, drop_last=False)
    cons_loader = (DataLoader(cons_ds, batch_size=cfg.train.batch_size, shuffle=True,
                              num_workers=cfg.data.num_workers, drop_last=True)
                   if cons_ds and len(cons_ds) > 0 else None)

    model = GradingModel(cfg).to(device)
    optim = _build_optimizer(model, cfg)
    unfroze = False

    os.makedirs(cfg.train.out_dir, exist_ok=True)
    for epoch in range(cfg.train.epochs):
        # stage 2: unfreeze backbone tail after warmup
        if (not unfroze and cfg.backbone.unfreeze_last_n_blocks > 0
                and epoch >= cfg.train.warmup_frozen_epochs):
            model.backbone.set_freeze(cfg.backbone.unfreeze_last_n_blocks)
            optim = _build_optimizer(model, cfg)
            unfroze = True
            print(f"[train] epoch {epoch}: unfroze last {cfg.backbone.unfreeze_last_n_blocks} blocks")

        model.train()
        cons_iter = itertools.cycle(cons_loader) if cons_loader else None
        running = {}
        t0 = time.time()
        for step, batch in enumerate(train_loader):
            pixel_values = batch["pixel_values"].to(device)
            outputs = model(pixel_values)
            total, parts = compute_losses(outputs, batch, cfg.loss)

            if cons_iter is not None and cfg.loss.consistency > 0:
                cb = next(cons_iter)
                ea = model.embed(cb["view_a"].to(device))
                eb = model.embed(cb["view_b"].to(device))
                lc = consistency_loss(ea, eb)
                total = total + cfg.loss.consistency * lc
                parts["consistency"] = lc.detach()

            optim.zero_grad()
            total.backward()
            torch.nn.utils.clip_grad_norm_(
                [p for p in model.parameters() if p.requires_grad], cfg.train.grad_clip)
            optim.step()

            for k, v in parts.items():
                running[k] = running.get(k, 0.0) + float(v)
            running["total"] = running.get("total", 0.0) + float(total.detach())
            if step % cfg.train.log_every == 0:
                msg = " ".join(f"{k}={v:.3f}" for k, v in parts.items())
                print(f"[train] e{epoch} s{step}/{len(train_loader)} total={float(total):.3f} {msg}")

        n = max(1, len(train_loader))
        avg = {k: v / n for k, v in running.items()}
        print(f"[train] epoch {epoch} done in {time.time()-t0:.1f}s avg={ {k: round(v,3) for k,v in avg.items()} }")

    ckpt = save_checkpoint(model, cfg, os.path.join(cfg.train.out_dir, "grading_model.pt"),
                           extra={"data_stats": stats})
    print(f"[train] saved checkpoint -> {ckpt}")
    return ckpt


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=None, help="YAML config path")
    ap.add_argument("--data-root", default=None, help="local MVTec/VisA root (optional)")
    ap.add_argument("--epochs", type=int, default=None)
    args = ap.parse_args()
    cfg = Config.load(args.config)
    if args.epochs is not None:
        cfg.train.epochs = args.epochs
    train(cfg, args.data_root)


if __name__ == "__main__":
    main()
