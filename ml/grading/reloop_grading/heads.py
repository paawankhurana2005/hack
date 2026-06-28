"""Prediction heads on top of the shared DINOv2 embedding.

  GradeHead       -> logits over the 5 ordinal grades         (classification)
  ConfidenceHead  -> scalar trust in [0,1] (predicted P(correct))
  DefectHead      -> per-defect presence logits + per-defect severity (multi-label)
  SeverityHead    -> global damage_score in [0,1]              (regression)

Heads are small MLPs so the frozen backbone does the heavy lifting (transfer learning).
"""
from __future__ import annotations

import torch
import torch.nn as nn

from .config import HeadConfig
from .schema import NUM_GRADES, NUM_DEFECTS


def _mlp(in_dim: int, hidden: int, out_dim: int, dropout: float) -> nn.Sequential:
    return nn.Sequential(
        nn.Linear(in_dim, hidden),
        nn.GELU(),
        nn.Dropout(dropout),
        nn.Linear(hidden, out_dim),
    )


class GradeHead(nn.Module):
    def __init__(self, in_dim: int, cfg: HeadConfig):
        super().__init__()
        self.net = _mlp(in_dim, cfg.hidden_dim, NUM_GRADES, cfg.dropout)

    def forward(self, x):  # -> (B, NUM_GRADES) logits
        return self.net(x)


class ConfidenceHead(nn.Module):
    """Predicts P(grade prediction is correct). Trained against online correctness,
    so it learns calibrated self-trust rather than just echoing softmax max."""

    def __init__(self, in_dim: int, cfg: HeadConfig):
        super().__init__()
        self.net = _mlp(in_dim, cfg.hidden_dim // 2, 1, cfg.dropout)

    def forward(self, x):  # -> (B,) logit
        return self.net(x).squeeze(-1)


class DefectHead(nn.Module):
    """Multi-label presence + per-defect severity. Severity is only meaningful where
    presence is positive; the loss masks severity to present defects."""

    def __init__(self, in_dim: int, cfg: HeadConfig):
        super().__init__()
        self.presence = _mlp(in_dim, cfg.hidden_dim, NUM_DEFECTS, cfg.dropout)
        self.severity = _mlp(in_dim, cfg.hidden_dim, NUM_DEFECTS, cfg.dropout)

    def forward(self, x):
        # presence: (B, K) logits ; severity: (B, K) in [0,1]
        return self.presence(x), torch.sigmoid(self.severity(x))


class SeverityHead(nn.Module):
    """Global damage_score in [0,1] (overall, not per-defect)."""

    def __init__(self, in_dim: int, cfg: HeadConfig):
        super().__init__()
        self.net = _mlp(in_dim, cfg.hidden_dim // 2, 1, cfg.dropout)

    def forward(self, x):  # -> (B,) in [0,1]
        return torch.sigmoid(self.net(x)).squeeze(-1)
