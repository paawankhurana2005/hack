"""ReLoop grading — a DINOv2-based single-image product-condition grader.

Public surface (import lazily; schema/config are torch-free):
  from reloop_grading.schema import GradingOutput, GRADES, DEFECTS
  from reloop_grading.config import Config
  from reloop_grading.model import GradingModel          # needs torch
  from reloop_grading.inference import GradingInference   # needs torch
"""
from .schema import (
    GRADES,
    DEFECTS,
    SEVERITIES,
    GradingOutput,
    DefectPrediction,
    normalize_defect,
    grade_from_damage,
)
from .config import Config

__all__ = [
    "GRADES",
    "DEFECTS",
    "SEVERITIES",
    "GradingOutput",
    "DefectPrediction",
    "normalize_defect",
    "grade_from_damage",
    "Config",
]

__version__ = "0.1.0"
