"""Data layer: heterogeneous sources -> one unified, labelled grading sample.

  download.py  — pull sample images from HF datasets-server (ABO clean, SOP views)
  synthetic.py — controlled damage on clean images (exact grade/severity labels)
  adapters.py  — ABO / SOP / MVTec / VisA -> UnifiedSample
  dataset.py   — UnifiedGradingDataset (+ SOP consistency pairs) + transforms
"""
from .sample import UnifiedSample
from .dataset import UnifiedGradingDataset, build_datasets, build_transform

__all__ = [
    "UnifiedSample",
    "UnifiedGradingDataset",
    "build_datasets",
    "build_transform",
]
