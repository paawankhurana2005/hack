"""Embedding cache — the local fast-iterate path.

The backbone is FROZEN, so an image's DINOv2 embedding never changes during head
training. Run the backbone ONCE over the dataset, cache the 768-d embeddings (+ labels)
to disk, then train the heads straight off the cache — seconds per epoch, CPU-only,
tiny memory. Re-run head experiments without ever touching the backbone again.

  python -m reloop_grading.embedding_cache --config configs/default.yaml --out runs/grading/emb.pt
"""
from __future__ import annotations

import argparse
import os
from collections import defaultdict
from typing import Optional

import torch
from torch.utils.data import DataLoader, Dataset

from .config import Config
from .model import GradingModel
from .data.dataset import build_datasets

_LABEL_KEYS = (
    "grade_idx", "has_grade", "damage", "has_damage",
    "defect_presence", "defect_severity", "has_defect",
)


@torch.no_grad()
def _embed_split(model: GradingModel, ds: Dataset, batch_size: int, device: str) -> dict:
    loader = DataLoader(ds, batch_size=batch_size)
    embs: list[torch.Tensor] = []
    labels: dict[str, list[torch.Tensor]] = defaultdict(list)
    for batch in loader:
        e = model.embed(batch["pixel_values"].to(device)).cpu()
        embs.append(e)
        for k in _LABEL_KEYS:
            labels[k].append(batch[k])
    if not embs:
        return {"embedding": torch.zeros(0), **{k: torch.zeros(0) for k in _LABEL_KEYS}}
    out = {"embedding": torch.cat(embs)}
    for k in _LABEL_KEYS:
        out[k] = torch.cat(labels[k])
    return out


def precompute_embeddings(cfg: Config, data_root: Optional[str], device: str, out_path: str) -> str:
    """Build datasets, run the frozen backbone once, cache embeddings + labels."""
    train_ds, val_ds, _cons, stats = build_datasets(cfg, data_root)
    if len(train_ds) == 0:
        raise RuntimeError("No samples to embed — check data sources / network.")
    model = GradingModel(cfg).to(device).eval()
    print(f"[cache] embedding {stats['train']} train + {stats['val']} val on {device} ...")
    blob = {
        "train": _embed_split(model, train_ds, cfg.train.batch_size, device),
        "val": _embed_split(model, val_ds, cfg.train.batch_size, device),
        "embed_dim": model.backbone.embed_dim,
        "stats": stats,
        "config": cfg.to_dict(),
        "backbone_name": cfg.backbone.name,
    }
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    torch.save(blob, out_path)
    print(f"[cache] wrote {out_path}  (train={stats['train']} val={stats['val']})")
    return out_path


def load_cache(path: str):
    return torch.load(path, map_location="cpu")


class CachedHeadDataset(Dataset):
    """Yields a cached embedding + its labels (no images, no backbone)."""

    def __init__(self, split: dict):
        self.split = split
        self.n = split["embedding"].shape[0]

    def __len__(self) -> int:
        return self.n

    def __getitem__(self, i: int) -> dict[str, torch.Tensor]:
        out = {"embedding": self.split["embedding"][i]}
        for k in _LABEL_KEYS:
            out[k] = self.split[k][i]
        return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=None)
    ap.add_argument("--data-root", default=None)
    ap.add_argument("--out", default="runs/grading/emb.pt")
    ap.add_argument("--device", default="auto")
    args = ap.parse_args()
    from .train import resolve_device
    cfg = Config.load(args.config)
    dev = str(resolve_device(args.device))
    precompute_embeddings(cfg, args.data_root, dev, args.out)


if __name__ == "__main__":
    main()
