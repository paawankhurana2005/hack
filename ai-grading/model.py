"""The condition grader: CLIP ViT-B/32 vision encoder + a small regression head.

Unlike the original frozen-feature setup, the vision encoder's TAIL is unfreezable so
the embedding can become sensitive to subtle top-band wear (a frozen CLIP lumps a
lightly-worn A in with a mildly-damaged B — see train.py). The checkpoint therefore
carries the fine-tuned vision weights, not just the head. Shared by train / inference /
evaluate so the architecture and score bucketing stay in lockstep.
"""

from __future__ import annotations

from functools import lru_cache

import torch
import torch.nn as nn

import config

BACKBONE = "openai/clip-vit-base-patch32"
FEATURE_DIM = 512
MODEL_PATH = config.DATA_DIR / "model_best.pt"


def calibrate(score: float) -> float:
    """Post-hoc grade-A bias correction (see config.A_SCORE_BIAS). Adds up to
    +A_SCORE_BIAS, ramped in over [A_BIAS_RAMP_LO, A_BIAS_RAMP_HI] so only A-region
    scores are lifted (no jump at the boundary), clamped to <=1.0."""
    lo, hi, boost = config.A_BIAS_RAMP_LO, config.A_BIAS_RAMP_HI, config.A_SCORE_BIAS
    if boost <= 0.0 or hi <= lo:
        return score
    t = max(0.0, min(1.0, (score - lo) / (hi - lo)))
    return min(1.0, score + boost * t)


def bucket(score: float) -> str:
    """Map a 0..1 condition score to its grade bucket (same edges as config ranges)."""
    if score >= 0.80:
        return "A"
    if score >= 0.55:
        return "B"
    if score >= 0.25:
        return "C"
    return "Salvage"


class ConditionHead(nn.Module):
    """512-d CLIP feature -> condition score in [0,1]."""

    def __init__(self) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(FEATURE_DIM, 256),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(256, 64),
            nn.ReLU(),
            nn.Linear(64, 1),
            nn.Sigmoid(),
        )

    def forward(self, feats: torch.Tensor) -> torch.Tensor:
        return self.net(feats).squeeze(-1)


class GraderModel(nn.Module):
    """CLIP vision encoder (tail optionally unfrozen) + ConditionHead."""

    def __init__(self, unfreeze_last_n: int = 0, backbone: str = BACKBONE, pretrained: bool = True) -> None:
        super().__init__()
        from transformers import CLIPModel, CLIPConfig

        if pretrained:
            self.clip = CLIPModel.from_pretrained(backbone)
        else:
            # Build the architecture without re-downloading (weights loaded from ckpt).
            self.clip = CLIPModel(CLIPConfig.from_pretrained(backbone))
        self.head = ConditionHead()
        self.backbone_name = backbone
        self.unfreeze_last_n = unfreeze_last_n
        self.set_freeze(unfreeze_last_n)

    def set_freeze(self, n: int) -> None:
        """Freeze all of CLIP, then unfreeze the last N vision blocks (+ the final
        layernorm and the visual projection) so only the semantic tail adapts."""
        for p in self.clip.parameters():
            p.requires_grad_(False)
        if n and n > 0:
            for blk in self.clip.vision_model.encoder.layers[-n:]:
                for p in blk.parameters():
                    p.requires_grad_(True)
            for p in self.clip.vision_model.post_layernorm.parameters():
                p.requires_grad_(True)
            for p in self.clip.visual_projection.parameters():
                p.requires_grad_(True)
        self.unfreeze_last_n = n

    def encode(self, pixel_values: torch.Tensor) -> torch.Tensor:
        feat = self.clip.get_image_features(pixel_values=pixel_values).float()
        if config.NORMALIZE_FEATURES:
            feat = torch.nn.functional.normalize(feat, dim=1)
        return feat

    def forward(self, pixel_values: torch.Tensor) -> torch.Tensor:
        return self.head(self.encode(pixel_values))

    def trainable_backbone_params(self) -> list[nn.Parameter]:
        return [p for p in self.clip.parameters() if p.requires_grad]


def save_checkpoint(model: GraderModel, path, **extra) -> None:
    """Persist the head (always) + the fine-tuned vision weights (only when the CLIP
    tail was actually unfrozen). A FROZEN model reuses stock pretrained CLIP, so saving
    its vision tower is redundant AND huge (~340MB) — head-only keeps the checkpoint
    tiny (<1MB) and committable, so anyone who clones gets a working grader (CLIP
    auto-downloads, head loads from git). load_grader() reconstructs pretrained CLIP
    when the vision weights are absent."""
    payload = {
        "head_state_dict": model.head.state_dict(),
        "backbone": model.backbone_name,
        "unfreeze_last_n": model.unfreeze_last_n,
        "feature_dim": FEATURE_DIM,
        "score_ranges": config.GRADE_SCORE_RANGES,
        **extra,
    }
    if model.unfreeze_last_n and model.unfreeze_last_n > 0:
        payload["vision_model_state_dict"] = model.clip.vision_model.state_dict()
        payload["visual_projection_state_dict"] = model.clip.visual_projection.state_dict()
    torch.save(payload, path)


@lru_cache(maxsize=1)
def load_grader(device: str = "cpu"):
    """Load the trained grader (+ its CLIP processor). Back-compatible with old
    head-only checkpoints (no vision weights -> pretrained CLIP is used as-is)."""
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"{MODEL_PATH} not found — train the model first (python train.py).")
    from transformers import CLIPProcessor

    ckpt = torch.load(MODEL_PATH, map_location=device)
    backbone = ckpt.get("backbone", BACKBONE)
    model = GraderModel(unfreeze_last_n=0, backbone=backbone)
    if "vision_model_state_dict" in ckpt:
        model.clip.vision_model.load_state_dict(ckpt["vision_model_state_dict"])
        model.clip.visual_projection.load_state_dict(ckpt["visual_projection_state_dict"])
    model.head.load_state_dict(ckpt["head_state_dict"])
    for p in model.parameters():
        p.requires_grad_(False)
    model.eval().to(device)
    processor = CLIPProcessor.from_pretrained(backbone)
    return model, processor
