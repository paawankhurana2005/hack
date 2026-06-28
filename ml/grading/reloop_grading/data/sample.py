"""UnifiedSample — the common shape every data source maps into. Carries per-task
LABEL MASKS so the multi-task loss only supervises tasks a source actually labels
(e.g. SOP has no grade; ABO clean has no defect-mask severity to learn from masks)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class UnifiedSample:
    image_path: str
    source: str                                   # abo | synthetic | mvtec | visa | sop
    # --- labels (None / empty when not provided by this source) ---
    grade: Optional[str] = None                   # canonical ConditionGrade
    damage_score: Optional[float] = None          # 0..1
    defects: list[tuple[str, float]] = field(default_factory=list)  # (canonical_type, severity)
    # which supervision signals are valid for this sample
    has_grade: bool = False
    has_damage: bool = False
    has_defect: bool = False                       # full multi-label defect vector is known
    # grouping for SOP viewpoint-invariance pairs (same product id across views)
    group_id: Optional[str] = None
