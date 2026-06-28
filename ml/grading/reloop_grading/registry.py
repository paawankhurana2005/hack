"""Checkpoint save/load with a stamped model_version. Every prediction carries the
version (it flows into the provenance chain downstream), so a re-grade is auditable."""
from __future__ import annotations

import os
from typing import Optional

import torch

from .config import Config
from .model import GradingModel


def save_checkpoint(model: GradingModel, cfg: Config, path: str,
                    extra: Optional[dict] = None) -> str:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    torch.save({
        "state_dict": model.state_dict(),
        "config": cfg.to_dict(),
        "model_version": model.model_version,
        "temperature": float(model.temperature.item()),
        "extra": extra or {},
    }, path)
    return path


def load_checkpoint(path: str, device: str = "cpu") -> tuple[GradingModel, Config]:
    blob = torch.load(path, map_location=device)
    cfg = Config.from_dict(blob["config"])
    # don't re-download pretrained weights we're about to overwrite
    cfg.backbone.pretrained = False
    model = GradingModel(cfg)
    model.load_state_dict(blob["state_dict"], strict=False)
    if "temperature" in blob:
        model.temperature = torch.tensor(float(blob["temperature"]))
    if "model_version" in blob:
        model.model_version = blob["model_version"]
    model.to(device).eval()
    return model, cfg
