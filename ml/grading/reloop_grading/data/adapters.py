"""Source adapters -> UnifiedSample.

ABO / SOP come from the HF datasets-server (images only). MVTec / VisA are read from
a local canonical download (they carry the defect labels + masks we need); they are
skipped gracefully when --data-root isn't provided, so the pipeline still runs on
ABO + synthetic alone.
"""
from __future__ import annotations

import glob
import os
from typing import Optional

from PIL import Image

from ..config import DataConfig
from ..schema import normalize_defect, grade_from_damage
from .sample import UnifiedSample
from .download import hf_pull_images
from .synthetic import DamageGenerator


# --- ABO: clean Amazon catalog -> top-grade, zero-damage references ----------
def abo_samples(cfg: DataConfig) -> list[UnifiedSample]:
    pulled = hf_pull_images(
        "amaye15/amazon_berkeley_objects", "default", "train",
        cfg.abo_samples, cfg.cache_dir, "abo",
    )
    out = []
    for path, _ in pulled:
        out.append(UnifiedSample(
            image_path=path, source="abo",
            grade="new", damage_score=0.0, defects=[],
            has_grade=True, has_damage=True, has_defect=True,  # clean = all-zero defect vector
        ))
    return out


# --- Synthetic: controlled damage on clean ABO -> exact graded labels --------
def synthetic_samples(cfg: DataConfig, clean_paths: list[str]) -> list[UnifiedSample]:
    gen = DamageGenerator(base_seed=cfg.synthetic_per_clean)
    dest = os.path.join(cfg.cache_dir, "synthetic")
    os.makedirs(dest, exist_ok=True)
    out = []
    k = 0
    for cpath in clean_paths:
        try:
            clean = Image.open(cpath).convert("RGB")
        except Exception:
            continue
        for j in range(cfg.synthetic_per_clean):
            ex = gen.generate(clean, k)
            fpath = os.path.join(dest, f"{k:06d}_{ex.defect_type}.jpg")
            if not os.path.exists(fpath):
                ex.image.save(fpath, quality=88)
            out.append(UnifiedSample(
                image_path=fpath, source="synthetic",
                grade=ex.grade, damage_score=ex.damage_score,
                defects=[(ex.defect_type, ex.severity)],
                has_grade=True, has_damage=True, has_defect=True,
            ))
            k += 1
    return out


# --- SOP: multi-view -> viewpoint-invariance pairs (no grade label) ----------
def sop_samples(cfg: DataConfig) -> list[UnifiedSample]:
    pulled = hf_pull_images(
        "JamieSJS/stanford-online-products", "corpus", "corpus",
        cfg.sop_samples, cfg.cache_dir, "sop",
    )
    out = []
    for i, (path, gid) in enumerate(pulled):
        # group_id lets the consistency loss pull same-product views together;
        # when the mirror exposes no class id we fall back to per-image augmentation
        # positives (handled in the dataset) which still teaches view/aug invariance.
        out.append(UnifiedSample(
            image_path=path, source="sop",
            group_id=gid if gid is not None else f"sop_{i}",
            has_grade=False, has_damage=False, has_defect=False,
        ))
    return out


# --- MVTec / VisA: real defects + masks (local canonical layout) -------------
def _mask_coverage(mask_path: str) -> Optional[float]:
    try:
        import numpy as np
        m = np.asarray(Image.open(mask_path).convert("L"))
        return float((m > 10).mean())
    except Exception:
        return None


def _find_mask(img_path: str, category_root: str) -> Optional[str]:
    stem = os.path.splitext(os.path.basename(img_path))[0]
    for gt_dir in ("ground_truth", "Masks", "masks"):
        hits = glob.glob(os.path.join(category_root, "**", gt_dir, "**", f"{stem}*"), recursive=True)
        if hits:
            return hits[0]
    return None


def _anomaly_dataset_samples(root: str, source: str, limit: int,
                             good_keywords=("good", "normal")) -> list[UnifiedSample]:
    """Generic reader for MVTec/VisA-style trees:
       <root>/<category>/.../<defect_or_good>/<image>  (+ masks elsewhere in the tree)."""
    if not root or not os.path.isdir(root):
        return []
    out: list[UnifiedSample] = []
    exts = ("*.png", "*.jpg", "*.JPG", "*.jpeg", "*.bmp")
    categories = [d for d in glob.glob(os.path.join(root, "*")) if os.path.isdir(d)]
    for cat_root in categories:
        for ext in exts:
            for img in glob.glob(os.path.join(cat_root, "**", ext), recursive=True):
                low = img.lower()
                if any(g in low for g in ("ground_truth", "/masks/", "_mask")):
                    continue  # skip mask files themselves
                folder = os.path.basename(os.path.dirname(img)).lower()
                is_good = any(g in low for g in good_keywords) and folder in good_keywords
                if is_good:
                    out.append(UnifiedSample(
                        image_path=img, source=source,
                        grade="new", damage_score=0.0, defects=[],
                        has_grade=True, has_damage=True, has_defect=True,
                    ))
                else:
                    defect = normalize_defect(folder)
                    cov = _mask_coverage(_find_mask(img, cat_root) or "")
                    # severity from mask coverage (scaled); fallback mid-severity when no mask
                    sev = min(1.0, (cov * 6.0)) if cov is not None else 0.5
                    damage = min(1.0, sev * 0.95 + 0.05)
                    out.append(UnifiedSample(
                        image_path=img, source=source,
                        grade=grade_from_damage(damage), damage_score=damage,
                        defects=[(defect, sev)],
                        has_grade=True, has_damage=True, has_defect=True,
                    ))
                if len(out) >= limit:
                    return out
    return out


def mvtec_samples(cfg: DataConfig, data_root: Optional[str]) -> list[UnifiedSample]:
    return _anomaly_dataset_samples(data_root or "", "mvtec", cfg.mvtec_samples)


def visa_samples(cfg: DataConfig, data_root: Optional[str]) -> list[UnifiedSample]:
    return _anomaly_dataset_samples(data_root or "", "visa", cfg.visa_samples,
                                    good_keywords=("good", "normal"))
