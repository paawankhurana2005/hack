"""Multi-task loss with per-task MASKING — each source only supervises the tasks it
actually labels (SOP has no grade, etc.). Components:

  grade       CE,   masked by has_grade
  confidence  BCE vs online correctness, masked by has_grade
  defect      BCE (presence), masked by has_defect
  severity    MSE on PRESENT defects only
  damage      MSE, masked by has_damage
  consistency 1 - cosine(view_a, view_b)   (SOP, computed in trainer)
"""
from __future__ import annotations

import torch
import torch.nn.functional as F

from .config import LossWeights


def _masked_mean(per_sample: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
    denom = mask.sum().clamp_min(1.0)
    return (per_sample * mask).sum() / denom


def compute_losses(outputs: dict, batch: dict, w: LossWeights) -> tuple[torch.Tensor, dict]:
    device = outputs["grade_logits"].device
    has_grade = batch["has_grade"].to(device)
    has_damage = batch["has_damage"].to(device)
    has_defect = batch["has_defect"].to(device)
    grade_idx = batch["grade_idx"].to(device)

    # grade (CE per sample, masked)
    ce = F.cross_entropy(outputs["grade_logits"], grade_idx, reduction="none")
    l_grade = _masked_mean(ce, has_grade)

    # confidence: predict P(correct). correctness computed online (detached target)
    with torch.no_grad():
        pred = outputs["grade_logits"].argmax(dim=-1)
        correct = (pred == grade_idx).float()
    bce_conf = F.binary_cross_entropy_with_logits(
        outputs["confidence_logit"], correct, reduction="none"
    )
    l_conf = _masked_mean(bce_conf, has_grade)

    # defect presence (BCE over K, masked by has_defect)
    presence_bce = F.binary_cross_entropy_with_logits(
        outputs["defect_presence_logits"], batch["defect_presence"].to(device), reduction="none"
    ).mean(dim=-1)
    l_defect = _masked_mean(presence_bce, has_defect)

    # defect severity: MSE only where a defect is actually present
    present = batch["defect_presence"].to(device)
    sev_err = (outputs["defect_severity"] - batch["defect_severity"].to(device)) ** 2
    sev_mask = present * has_defect.unsqueeze(-1)
    l_severity = (sev_err * sev_mask).sum() / sev_mask.sum().clamp_min(1.0)

    # global damage regression
    dmg_err = (outputs["damage_score"] - batch["damage"].to(device)) ** 2
    l_damage = _masked_mean(dmg_err, has_damage)

    total = (
        w.grade * l_grade
        + w.confidence * l_conf
        + w.defect * l_defect
        + w.severity * l_severity
        + w.damage * l_damage
    )
    parts = {
        "grade": l_grade.detach(),
        "confidence": l_conf.detach(),
        "defect": l_defect.detach(),
        "severity": l_severity.detach(),
        "damage": l_damage.detach(),
    }
    return total, parts


def consistency_loss(emb_a: torch.Tensor, emb_b: torch.Tensor) -> torch.Tensor:
    """Viewpoint invariance: same product, different view -> close embeddings."""
    a = F.normalize(emb_a, dim=-1)
    b = F.normalize(emb_b, dim=-1)
    return (1.0 - (a * b).sum(dim=-1)).mean()
