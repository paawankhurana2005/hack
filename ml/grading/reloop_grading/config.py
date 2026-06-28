"""Typed config for training/inference. Loadable from YAML; sane defaults so the
smoke test runs with zero config. No heavy deps."""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Optional


@dataclass
class BackboneConfig:
    name: str = "facebook/dinov2-base"   # DINOv2 ViT-B/14, 768-d
    embed_dim: int = 768
    image_size: int = 224
    # transfer learning: freeze all blocks, then unfreeze the last N for fine-tuning.
    unfreeze_last_n_blocks: int = 0      # 0 = pure linear-probe (heads only)
    pretrained: bool = True


@dataclass
class HeadConfig:
    hidden_dim: int = 512
    dropout: float = 0.2


@dataclass
class DataConfig:
    cache_dir: str = ".cache/reloop_grading"
    # how many real samples to pull per source for a quick run (None = as configured per split)
    abo_samples: int = 200
    sop_samples: int = 120
    mvtec_samples: int = 120
    visa_samples: int = 120
    synthetic_per_clean: int = 2         # synthetic-damaged variants per clean image
    # Kaputt (Amazon retail-logistics defect dataset) — local path to the extracted
    # sample-data dir (contains query-sample.parquet + reference-sample.parquet + data/).
    kaputt_root: str = ""
    kaputt_samples: int = 400
    # Sneakers (ipogorelov/sneakers) — REAL in-domain shoes. Each clean shoe also
    # spawns `sneakers_per_clean` synthetic-damaged variants with exact defect labels.
    sneakers_samples: int = 800          # clean real sneaker images to pull
    sneakers_per_clean: int = 3          # synthetic-damaged variants per clean shoe
    val_fraction: float = 0.2
    num_workers: int = 0
    use_sources: tuple[str, ...] = ("abo", "synthetic", "mvtec", "visa", "sop")


@dataclass
class LossWeights:
    grade: float = 1.0
    defect: float = 0.7
    severity: float = 0.5
    damage: float = 0.5
    confidence: float = 0.3
    consistency: float = 0.3             # SOP viewpoint-invariance


@dataclass
class TrainConfig:
    epochs: int = 8
    batch_size: int = 16
    lr_heads: float = 1e-3
    lr_backbone: float = 1e-5            # only matters when blocks are unfrozen
    weight_decay: float = 1e-4
    warmup_frozen_epochs: int = 2        # heads-only epochs before unfreezing backbone
    grad_clip: float = 1.0
    seed: int = 42
    device: str = "auto"                 # auto -> cuda/mps/cpu
    out_dir: str = "runs/grading"
    log_every: int = 10


@dataclass
class Config:
    backbone: BackboneConfig = field(default_factory=BackboneConfig)
    head: HeadConfig = field(default_factory=HeadConfig)
    data: DataConfig = field(default_factory=DataConfig)
    loss: LossWeights = field(default_factory=LossWeights)
    train: TrainConfig = field(default_factory=TrainConfig)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @staticmethod
    def from_dict(d: dict[str, Any]) -> "Config":
        def sub(cls, key):
            base = asdict(cls())
            # Only accept keys this dataclass actually defines, so a checkpoint saved
            # with a different config schema (added/removed fields across versions) still
            # loads instead of crashing with "unexpected keyword argument".
            incoming = {k: v for k, v in (d.get(key) or {}).items() if k in base}
            return cls(**{**base, **incoming})
        return Config(
            backbone=sub(BackboneConfig, "backbone"),
            head=sub(HeadConfig, "head"),
            data=sub(DataConfig, "data"),
            loss=sub(LossWeights, "loss"),
            train=sub(TrainConfig, "train"),
        )

    @staticmethod
    def load(path: Optional[str]) -> "Config":
        if not path:
            return Config()
        import yaml  # lazy
        with open(path) as f:
            return Config.from_dict(yaml.safe_load(f) or {})
