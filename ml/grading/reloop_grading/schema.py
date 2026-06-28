"""Canonical grading schema — the single source of truth for the Python model,
kept in lock-step with the TypeScript contract in `packages/shared/src/grading.ts`
and `grading-rubric.ts`.

The model PERCEIVES (produces these structured facts); deterministic code downstream
aggregates, calibrates and decides. Nothing here emits natural language.

Mapping to the TS `GradingResult` (so downstream APIs never change):
  grade            -> GradingResult.grade            (ConditionGrade)
  confidence       -> GradingResult.confidence       (0..1, calibrated)
  damage_score     -> drives qualityScore / severity aggregation
  defects[].type   -> GradingResult.structuredIssues[].type
  defects[].severity (0..1) -> bucketed to IssueSeverity (minor|moderate|severe)
  needs_review     -> GradingResult.needsReview
This module has NO heavy deps (no torch) so it can be imported and tested anywhere.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Optional

# --- Grades (ordinal, matches ConditionGrade in common.ts) -------------------
# Index IS the ordinal rank: better (new=0) -> worse (poor=4).
GRADES: tuple[str, ...] = ("new", "like-new", "good", "fair", "poor")
GRADE_TO_ORDINAL: dict[str, int] = {g: i for i, g in enumerate(GRADES)}
NUM_GRADES = len(GRADES)

# Friendly labels (for JSON shown to humans / parity with the user's spec example).
GRADE_LABELS: dict[str, str] = {
    "new": "New",
    "like-new": "Like New",
    "good": "Good",
    "fair": "Fair",
    "poor": "Poor",
}


def ordinal_to_grade(o: int) -> str:
    return GRADES[max(0, min(NUM_GRADES - 1, int(o)))]


# --- Severity (matches IssueSeverity in grading.ts) --------------------------
# The model regresses a continuous severity in [0,1]; deterministic code buckets it
# to the ordinal the rest of the system speaks. Thresholds mirror SEVERITY_ORDINAL.
SEVERITIES: tuple[str, ...] = ("minor", "moderate", "severe")
SEVERITY_BUCKETS = (0.33, 0.66)  # < .33 minor, < .66 moderate, else severe


def severity_to_label(s: float) -> str:
    if s < SEVERITY_BUCKETS[0]:
        return "minor"
    if s < SEVERITY_BUCKETS[1]:
        return "moderate"
    return "severe"


# --- Canonical defect taxonomy ----------------------------------------------
# A dataset-agnostic superset. Per-category rubrics in grading-rubric.ts map into
# this via `normalize_defect`. The Defect head predicts presence over these K classes
# plus a per-class severity.
DEFECTS: tuple[str, ...] = (
    "scratch",
    "dent",
    "crack",
    "chip",
    "stain",
    "tear",
    "discoloration",
    "missing_part",
    "wear",
    "contamination",
    "rust",
    "deformation",
)
DEFECT_TO_IDX: dict[str, int] = {d: i for i, d in enumerate(DEFECTS)}
NUM_DEFECTS = len(DEFECTS)

# Keyword -> canonical defect. Covers the TS per-category issueTypes and the
# MVTec/VisA per-class folder names (substring match, first hit wins).
_DEFECT_KEYWORDS: tuple[tuple[str, str], ...] = (
    ("scratch", "scratch"), ("scuff", "scratch"),
    ("dent", "dent"),
    ("crack", "crack"), ("broken", "crack"), ("split", "crack"),
    ("chip", "chip"), ("hole", "chip"), ("poke", "chip"),
    ("stain", "stain"), ("water", "stain"), ("highlight", "stain"),
    ("tear", "tear"), ("torn", "tear"), ("cut", "tear"), ("fray", "tear"),
    ("discolor", "discoloration"), ("fade", "discoloration"), ("color", "discoloration"),
    ("missing", "missing_part"), ("absent", "missing_part"),
    ("wear", "wear"), ("pill", "wear"), ("rough", "wear"), ("worn", "wear"),
    ("contamin", "contamination"), ("glue", "contamination"), ("dirt", "contamination"),
    ("rust", "rust"), ("corro", "rust"),
    ("bent", "deformation"), ("fold", "deformation"), ("deform", "deformation"),
    ("stretch", "deformation"), ("misplaced", "deformation"), ("squeeze", "deformation"),
    ("deflat", "deformation"), ("imprint", "deformation"), ("crease", "deformation"),
    # Kaputt (Amazon retail-logistics) defect vocabulary
    ("actuation", "deformation"), ("penetrat", "tear"), ("deconstruct", "crack"),
    ("superficial", "scratch"), ("unit", "missing_part"),
)


def normalize_defect(raw: str) -> str:
    """Map any dataset/category defect string to a canonical taxonomy entry.
    Falls back to 'wear' (the most generic degradation) for unknown anomalies."""
    s = raw.strip().lower()
    if s in DEFECT_TO_IDX:
        return s
    for kw, canon in _DEFECT_KEYWORDS:
        if kw in s:
            return canon
    return "wear"


# --- damage_score -> grade ---------------------------------------------------
# Deterministic ladder used both to LABEL synthetic data and as a sanity prior.
# (model perceives severity; this maps it to the ordinal grade.)
GRADE_FROM_DAMAGE = (
    (0.05, "new"),
    (0.20, "like-new"),
    (0.45, "good"),
    (0.70, "fair"),
)  # else "poor"


def grade_from_damage(damage_score: float) -> str:
    for thr, g in GRADE_FROM_DAMAGE:
        if damage_score < thr:
            return g
    return "poor"


# --- Structured output -------------------------------------------------------
@dataclass
class DefectPrediction:
    type: str            # canonical defect (one of DEFECTS)
    severity: float      # 0..1 continuous

    def to_json(self) -> dict:
        return {"type": self.type, "severity": round(self.severity, 4)}


@dataclass
class GradingOutput:
    """What the model returns for ONE image. Maps 1:1 onto the TS GradingResult.
    `similarity` is filled by the inference embedding-comparison step (None when the
    item has no original catalog reference)."""
    grade: str
    confidence: float
    damage_score: float
    defects: list[DefectPrediction] = field(default_factory=list)
    needs_review: bool = False
    # filled at inference by the embedding comparator (optional, reference-conditioned)
    similarity: Optional[float] = None
    model_version: str = "uninitialized"

    def to_json(self) -> dict:
        out = {
            "grade": GRADE_LABELS[self.grade],
            "grade_key": self.grade,                       # canonical ConditionGrade
            "confidence": round(self.confidence, 4),
            "damage_score": round(self.damage_score, 4),
            "defects": [d.to_json() for d in self.defects],
            "needs_review": self.needs_review,
            "model_version": self.model_version,
        }
        if self.similarity is not None:
            out["similarity"] = round(self.similarity, 4)
        return out

    def to_grading_result_partial(self, product_id: str, photo_urls: list[str]) -> dict:
        """Shape that drops straight into the TS `GradingResult` (the fields the model
        owns). Downstream deterministic code adds id/summary/gradedAt/referenceComparison."""
        structured = [
            {"type": d.type, "severity": severity_to_label(d.severity), "region": "unknown"}
            for d in self.defects
        ]
        return {
            "productId": product_id,
            "grade": self.grade,
            "confidence": round(self.confidence, 4),
            "detectedIssues": [d.type for d in self.defects],
            "structuredIssues": structured,
            "qualityScore": round(1.0 - self.damage_score, 4),
            "needsReview": self.needs_review,
            "photoUrls": photo_urls,
        }


def empty_json() -> dict:
    return asdict(GradingOutput(grade="new", confidence=0.0, damage_score=0.0))
