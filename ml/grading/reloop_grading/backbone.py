"""DINOv2 ViT-B/14 backbone with transfer-learning freeze control.

Produces ONE shared embedding (the CLS token, 768-d) used by every head AND by the
inference-time embedding comparator. Freeze-by-default; optionally unfreeze the last
N transformer blocks for a second-stage fine-tune. The same encoder runs both the
returned image and the original catalog image at inference, so the comparison is
apples-to-apples in the same feature space.
"""
from __future__ import annotations

import torch
import torch.nn as nn

from .config import BackboneConfig


class Dinov2Backbone(nn.Module):
    def __init__(self, cfg: BackboneConfig):
        super().__init__()
        self.cfg = cfg
        self.embed_dim = cfg.embed_dim
        self._load()
        self.set_freeze(cfg.unfreeze_last_n_blocks)

    def _load(self) -> None:
        from transformers import Dinov2Model, Dinov2Config  # lazy import
        if self.cfg.pretrained:
            self.encoder = Dinov2Model.from_pretrained(self.cfg.name)
        else:
            # rebuild the SAME architecture as the named model (so a checkpoint loads
            # cleanly) WITHOUT re-downloading the pretrained weights.
            self.encoder = Dinov2Model(Dinov2Config.from_pretrained(self.cfg.name))
        # keep embed_dim honest with the loaded model
        self.embed_dim = self.encoder.config.hidden_size

    @property
    def _blocks(self) -> nn.ModuleList:
        # transformers Dinov2: encoder.encoder.layer is the block list
        return self.encoder.encoder.layer

    def set_freeze(self, unfreeze_last_n_blocks: int) -> None:
        """Freeze everything, then unfreeze the last N blocks (+ final norm)."""
        for p in self.encoder.parameters():
            p.requires_grad_(False)
        n = max(0, int(unfreeze_last_n_blocks))
        if n > 0:
            for blk in self._blocks[-n:]:
                for p in blk.parameters():
                    p.requires_grad_(True)
            if hasattr(self.encoder, "layernorm"):
                for p in self.encoder.layernorm.parameters():
                    p.requires_grad_(True)
        self._unfrozen = n

    def trainable_parameters(self):
        return [p for p in self.encoder.parameters() if p.requires_grad]

    def forward(self, pixel_values: torch.Tensor) -> torch.Tensor:
        """pixel_values: (B, 3, H, W) normalized. Returns (B, embed_dim) CLS embedding."""
        # Under linear-probe (nothing unfrozen) we never need encoder grads.
        ctx = torch.no_grad() if getattr(self, "_unfrozen", 0) == 0 else _nullcontext()
        with ctx:
            out = self.encoder(pixel_values=pixel_values)
        # pooler_output is the CLS token after layernorm; fall back to last_hidden[:,0]
        cls = getattr(out, "pooler_output", None)
        if cls is None:
            cls = out.last_hidden_state[:, 0]
        return cls


class _nullcontext:
    def __enter__(self):
        return None

    def __exit__(self, *exc):
        return False
