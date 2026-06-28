"""Local fast-iterate trainer (M1-friendly). Precompute frozen-DINOv2 embeddings once,
then train the heads off the cache — seconds per epoch, no GPU, tiny memory.

  # first run (embeds once, then trains heads):
  python -m reloop_grading.train_local --config configs/default.yaml

  # iterate on heads/losses without re-embedding:
  python -m reloop_grading.train_local --config configs/default.yaml   # reuses cache
  # force re-embed (e.g. data changed):
  python -m reloop_grading.train_local --refresh-cache
"""
from __future__ import annotations

import argparse
import json
import os
import time

import torch
from torch.utils.data import DataLoader

from .config import Config
from .model import GradingModel
from .losses import compute_losses
from .registry import save_checkpoint
from .evaluate import evaluate_from_cache
from .embedding_cache import precompute_embeddings, load_cache, CachedHeadDataset
from .train import resolve_device, _build_optimizer


def train_local(cfg: Config, data_root: str | None, cache_path: str,
                refresh_cache: bool = False, device: str | None = None) -> str:
    torch.manual_seed(cfg.train.seed)
    dev = device or str(resolve_device(cfg.train.device))
    print(f"[local] device={dev}")

    if refresh_cache or not os.path.exists(cache_path):
        precompute_embeddings(cfg, data_root, dev, cache_path)
    else:
        print(f"[local] reusing embedding cache {cache_path}")
    cache = load_cache(cache_path)

    # rebuild the cached config so model + cache stay consistent
    ccfg = Config.from_dict(cache["config"])
    model = GradingModel(ccfg).to(dev)           # backbone frozen; only heads will train
    optim = _build_optimizer(model, ccfg)         # picks up head params only (backbone frozen)

    train_ds = CachedHeadDataset(cache["train"])
    loader = DataLoader(train_ds, batch_size=cfg.train.batch_size, shuffle=True)
    print(f"[local] training heads on {len(train_ds)} cached embeddings")

    for epoch in range(cfg.train.epochs):
        model.train()
        running = {}
        t0 = time.time()
        for batch in loader:
            outputs = model.heads_from_embedding(batch["embedding"].to(dev))
            total, parts = compute_losses(outputs, batch, cfg.loss)
            optim.zero_grad()
            total.backward()
            torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], cfg.train.grad_clip)
            optim.step()
            for k, v in parts.items():
                running[k] = running.get(k, 0.0) + float(v)
            running["total"] = running.get("total", 0.0) + float(total.detach())
        n = max(1, len(loader))
        avg = {k: round(v / n, 3) for k, v in running.items()}
        print(f"[local] epoch {epoch} {time.time()-t0:.2f}s {avg}")

    print("\n[local] evaluating from cache ...")
    report = evaluate_from_cache(model, cache, dev, do_similarity=True)
    print(json.dumps(report, indent=2))

    ckpt = save_checkpoint(model, ccfg, os.path.join(cfg.train.out_dir, "grading_model.pt"),
                           extra={"trained": "local-cached-heads", "eval": report})
    print(f"\n[local] saved checkpoint -> {ckpt}")
    return ckpt


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=None)
    ap.add_argument("--data-root", default=None)
    ap.add_argument("--cache", default="runs/grading/emb.pt")
    ap.add_argument("--refresh-cache", action="store_true")
    ap.add_argument("--epochs", type=int, default=None)
    ap.add_argument("--device", default=None)
    args = ap.parse_args()
    cfg = Config.load(args.config)
    if args.epochs is not None:
        cfg.train.epochs = args.epochs
    train_local(cfg, args.data_root, args.cache, args.refresh_cache, args.device)


if __name__ == "__main__":
    main()
