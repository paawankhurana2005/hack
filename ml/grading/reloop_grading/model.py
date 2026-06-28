"""GradingModel = DINOv2 backbone + multi-head. Single image in, structured facts out.

forward() returns RAW tensors (for training/loss). predict() turns them into the
deterministic structured GradingOutput (the JSON contract). The model never writes
natural language; downstream code narrates.
"""
from __future__ import annotations

import torch
import torch.nn as nn

from .config import Config
from .backbone import Dinov2Backbone
from .heads import GradeHead, ConfidenceHead, DefectHead, SeverityHead
from .schema import (
    GRADES,
    DEFECTS,
    ordinal_to_grade,
    GradingOutput,
    DefectPrediction,
)

# below this CALIBRATED confidence -> abstain / flag for review.
# Mirrors ABSTAIN_THRESHOLD in packages/shared/src/grading-rubric.ts.
ABSTAIN_THRESHOLD = 0.55
DEFECT_PRESENCE_THRESHOLD = 0.5


class GradingModel(nn.Module):
    def __init__(self, cfg: Config):
        super().__init__()
        self.cfg = cfg
        self.backbone = Dinov2Backbone(cfg.backbone)
        d = self.backbone.embed_dim
        self.grade_head = GradeHead(d, cfg.head)
        self.confidence_head = ConfidenceHead(d, cfg.head)
        self.defect_head = DefectHead(d, cfg.head)
        self.severity_head = SeverityHead(d, cfg.head)
        # temperature for grade-logit calibration (fit post-hoc on val; see evaluate.py)
        self.register_buffer("temperature", torch.tensor(1.0))
        self.model_version = "reloop-grading-dinov2b-v0.1.0"

    # --- forward paths -------------------------------------------------------
    def embed(self, pixel_values: torch.Tensor) -> torch.Tensor:
        """Shared DINOv2 embedding — used by heads AND the inference comparator."""
        return self.backbone(pixel_values)

    def heads_from_embedding(self, emb: torch.Tensor) -> dict[str, torch.Tensor]:
        presence, severity = self.defect_head(emb)
        return {
            "grade_logits": self.grade_head(emb),
            "confidence_logit": self.confidence_head(emb),
            "defect_presence_logits": presence,
            "defect_severity": severity,
            "damage_score": self.severity_head(emb),
            "embedding": emb,
        }

    def forward(self, pixel_values: torch.Tensor) -> dict[str, torch.Tensor]:
        return self.heads_from_embedding(self.embed(pixel_values))

    # --- structured prediction ----------------------------------------------
    @torch.no_grad()
    def predict(self, pixel_values: torch.Tensor) -> list[GradingOutput]:
        """Batch of images -> list of structured GradingOutput (no text)."""
        self.eval()
        out = self.forward(pixel_values)
        cal_logits = out["grade_logits"] / self.temperature.clamp_min(1e-3)
        grade_probs = torch.softmax(cal_logits, dim=-1)
        grade_idx = grade_probs.argmax(dim=-1)
        # confidence = learned trust gated by calibrated softmax margin
        learned_conf = torch.sigmoid(out["confidence_logit"])
        softmax_conf = grade_probs.max(dim=-1).values
        confidence = 0.5 * (learned_conf + softmax_conf)
        presence_prob = torch.sigmoid(out["defect_presence_logits"])
        severity = out["defect_severity"]
        damage = out["damage_score"]

        results: list[GradingOutput] = []
        B = pixel_values.shape[0]
        for i in range(B):
            defects: list[DefectPrediction] = []
            for k in range(len(DEFECTS)):
                if presence_prob[i, k].item() >= DEFECT_PRESENCE_THRESHOLD:
                    defects.append(
                        DefectPrediction(type=DEFECTS[k], severity=float(severity[i, k].item()))
                    )
            defects.sort(key=lambda d: d.severity, reverse=True)
            conf = float(confidence[i].item())
            results.append(
                GradingOutput(
                    grade=ordinal_to_grade(int(grade_idx[i].item())),
                    confidence=conf,
                    damage_score=float(damage[i].item()),
                    defects=defects,
                    needs_review=conf < ABSTAIN_THRESHOLD,
                    model_version=self.model_version,
                )
            )
        return results

    # --- persistence ---------------------------------------------------------
    def trainable_named_parameters(self):
        for n, p in self.named_parameters():
            if p.requires_grad:
                yield n, p
