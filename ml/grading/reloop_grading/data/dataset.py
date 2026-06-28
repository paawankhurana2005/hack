"""Torch datasets + transforms that turn UnifiedSample into model-ready tensors.

UnifiedGradingDataset yields pixel_values + per-task labels + per-task masks.
ConsistencyPairDataset yields two views of the same product (SOP) for the
viewpoint-invariance objective.
"""
from __future__ import annotations

import random
from typing import Optional

import torch
from torch.utils.data import Dataset
from PIL import Image

from ..config import Config, DataConfig
from ..schema import GRADE_TO_ORDINAL, DEFECT_TO_IDX, NUM_DEFECTS
from .sample import UnifiedSample

# DINOv2 uses ImageNet normalization
_MEAN = (0.485, 0.456, 0.406)
_STD = (0.229, 0.224, 0.225)


def build_transform(image_size: int, train: bool):
    from torchvision import transforms as T
    if train:
        return T.Compose([
            T.Resize(int(image_size * 1.15)),
            T.RandomResizedCrop(image_size, scale=(0.7, 1.0)),
            T.RandomHorizontalFlip(),
            T.ColorJitter(0.1, 0.1, 0.1),
            T.ToTensor(),
            T.Normalize(_MEAN, _STD),
        ])
    return T.Compose([
        T.Resize(int(image_size * 1.15)),
        T.CenterCrop(image_size),
        T.ToTensor(),
        T.Normalize(_MEAN, _STD),
    ])


def _open(path: str) -> Image.Image:
    return Image.open(path).convert("RGB")


class UnifiedGradingDataset(Dataset):
    def __init__(self, samples: list[UnifiedSample], transform):
        self.samples = samples
        self.transform = transform

    def __len__(self) -> int:
        return len(self.samples)

    def _labels(self, s: UnifiedSample) -> dict[str, torch.Tensor]:
        grade_idx = GRADE_TO_ORDINAL[s.grade] if (s.has_grade and s.grade) else 0
        presence = torch.zeros(NUM_DEFECTS)
        severity = torch.zeros(NUM_DEFECTS)
        for dtype, sev in s.defects:
            if dtype in DEFECT_TO_IDX:
                presence[DEFECT_TO_IDX[dtype]] = 1.0
                severity[DEFECT_TO_IDX[dtype]] = float(sev)
        return {
            "grade_idx": torch.tensor(grade_idx, dtype=torch.long),
            "has_grade": torch.tensor(1.0 if s.has_grade else 0.0),
            "damage": torch.tensor(float(s.damage_score or 0.0)),
            "has_damage": torch.tensor(1.0 if s.has_damage else 0.0),
            "defect_presence": presence,
            "defect_severity": severity,
            "has_defect": torch.tensor(1.0 if s.has_defect else 0.0),
        }

    def __getitem__(self, i: int) -> dict[str, torch.Tensor]:
        s = self.samples[i]
        try:
            img = self.transform(_open(s.image_path))
        except Exception:
            img = torch.zeros(3, 224, 224)
        out = {"pixel_values": img}
        out.update(self._labels(s))
        return out


class ConsistencyPairDataset(Dataset):
    """Two augmented views of the same product. Uses true multi-view pairs when a
    group has >1 image, else two random augmentations of the same image."""

    def __init__(self, samples: list[UnifiedSample], image_size: int):
        self.transform = build_transform(image_size, train=True)
        groups: dict[str, list[str]] = {}
        for s in samples:
            groups.setdefault(s.group_id or s.image_path, []).append(s.image_path)
        self.groups = list(groups.values())

    def __len__(self) -> int:
        return len(self.groups)

    def __getitem__(self, i: int) -> dict[str, torch.Tensor]:
        paths = self.groups[i]
        if len(paths) >= 2:
            a, b = random.sample(paths, 2)
        else:
            a = b = paths[0]
        try:
            va = self.transform(_open(a))
            vb = self.transform(_open(b))
        except Exception:
            va = vb = torch.zeros(3, 224, 224)
        return {"view_a": va, "view_b": vb}


def build_datasets(cfg: Config, data_root: Optional[str] = None):
    """Assemble all configured sources, return (train_ds, val_ds, consistency_ds, stats)."""
    from . import adapters as A

    dcfg: DataConfig = cfg.data
    sources = set(dcfg.use_sources)
    samples: list[UnifiedSample] = []
    abo: list[UnifiedSample] = []

    if "abo" in sources or "synthetic" in sources:
        abo = A.abo_samples(dcfg)
    if "abo" in sources:
        samples += abo
    if "synthetic" in sources:
        samples += A.synthetic_samples(dcfg, [s.image_path for s in abo])
    if "mvtec" in sources:
        samples += A.mvtec_samples(dcfg, data_root)
    if "visa" in sources:
        samples += A.visa_samples(dcfg, data_root)

    sop: list[UnifiedSample] = A.sop_samples(dcfg) if "sop" in sources else []

    rng = random.Random(cfg.train.seed)
    rng.shuffle(samples)
    n_val = max(1, int(len(samples) * dcfg.val_fraction)) if samples else 0
    val, train = samples[:n_val], samples[n_val:]

    tf_train = build_transform(cfg.backbone.image_size, train=True)
    tf_eval = build_transform(cfg.backbone.image_size, train=False)
    train_ds = UnifiedGradingDataset(train, tf_train)
    val_ds = UnifiedGradingDataset(val, tf_eval)
    cons_ds = ConsistencyPairDataset(sop, cfg.backbone.image_size) if sop else None

    stats = {
        "total": len(samples), "train": len(train), "val": len(val),
        "sop_pairs": len(cons_ds) if cons_ds else 0,
        "by_source": _count_by_source(samples),
    }
    return train_ds, val_ds, cons_ds, stats


def _count_by_source(samples: list[UnifiedSample]) -> dict[str, int]:
    c: dict[str, int] = {}
    for s in samples:
        c[s.source] = c.get(s.source, 0) + 1
    return c
