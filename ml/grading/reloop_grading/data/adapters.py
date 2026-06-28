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
from .download import hf_pull_images, sneaker_pull_images
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


# --- Sneakers: REAL in-domain shoes (clean anchors + synthetic damage) -------
def sneakers_samples(cfg: DataConfig) -> list[UnifiedSample]:
    """Real sneaker photos (ipogorelov/sneakers) as the in-domain base the grader
    was missing. Each clean shoe becomes:
      • one CLEAN anchor (grade=new, empty defect vector) — teaches "good shoe → no defects"
      • `sneakers_per_clean` SYNTHETIC-damaged variants with EXACT (grade, defect, severity)
        labels — scuff→scratch, dirt→contamination, stain, fade→wear. This is the signal
        that fixes the defect head's blindness to a worn/dirty shoe.
    group_id = brand/model so a shoe's clean<->damaged views pair up for the
    embedding comparator (and SOP-style consistency)."""
    pulled = sneaker_pull_images(cfg.sneakers_samples, cfg.cache_dir, "sneakers")
    if not pulled:
        return []
    gen = DamageGenerator(base_seed=7000 + cfg.sneakers_per_clean)
    dest = os.path.join(cfg.cache_dir, "sneakers_synth")
    os.makedirs(dest, exist_ok=True)
    out: list[UnifiedSample] = []
    k = 0
    for cpath, gid in pulled:
        # clean anchor
        out.append(UnifiedSample(
            image_path=cpath, source="sneakers",
            grade="new", damage_score=0.0, defects=[],
            has_grade=True, has_damage=True, has_defect=True,
            group_id=gid or cpath,
        ))
        try:
            clean = Image.open(cpath).convert("RGB")
        except Exception:
            continue
        for _ in range(cfg.sneakers_per_clean):
            ex = gen.generate(clean, k)
            fpath = os.path.join(dest, f"{k:06d}_{ex.defect_type}.jpg")
            if not os.path.exists(fpath):
                ex.image.save(fpath, quality=88)
            out.append(UnifiedSample(
                image_path=fpath, source="sneakers",
                grade=ex.grade, damage_score=ex.damage_score,
                defects=[(ex.defect_type, ex.severity)],
                has_grade=True, has_damage=True, has_defect=True,
                group_id=gid or cpath,
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


# --- Kaputt: Amazon Science retail-logistics defect dataset ------------------
def kaputt_samples(cfg: DataConfig) -> list[UnifiedSample]:
    """Reads the Kaputt sample-data layout: query/reference parquet annotations +
    item crops + masks. Query items carry real defect_types + a major_defect flag
    (→ defect head + grade via severity); reference items are clean examples.
    item_identifier links query↔reference (the real reference-vs-returned pairing)."""
    root = cfg.kaputt_root
    if not root or not os.path.isdir(root):
        return []
    try:
        import pandas as pd
    except Exception:
        print("[kaputt] pandas/pyarrow not installed — skipping")
        return []

    def _img(rel: str) -> Optional[str]:
        p = os.path.join(root, rel)
        return p if os.path.exists(p) else None

    out: list[UnifiedSample] = []
    qp = os.path.join(root, "query-sample.parquet")
    if os.path.exists(qp):
        q = pd.read_parquet(qp)
        for _, row in q.iterrows():
            img = _img(row.get("query_crop", "")) or _img(row.get("query_image", ""))
            if not img:
                continue
            if bool(row.get("defect")):
                major = bool(row.get("major_defect"))
                sev = 0.85 if major else 0.55
                damage = 0.8 if major else 0.4
                types = [normalize_defect(t.strip())
                         for t in str(row.get("defect_types") or "").split(",") if t.strip()]
                defects = [(t, sev) for t in dict.fromkeys(types)] or [("deformation", sev)]
                out.append(UnifiedSample(
                    image_path=img, source="kaputt",
                    grade=grade_from_damage(damage), damage_score=damage, defects=defects,
                    has_grade=True, has_damage=True, has_defect=True,
                    group_id=str(row.get("item_identifier") or ""),
                ))
            else:
                out.append(UnifiedSample(
                    image_path=img, source="kaputt",
                    grade="new", damage_score=0.0, defects=[],
                    has_grade=True, has_damage=True, has_defect=True,
                    group_id=str(row.get("item_identifier") or ""),
                ))
            if len(out) >= cfg.kaputt_samples:
                break

    # reference items = clean examples of the same goods (balance + reference side)
    rp = os.path.join(root, "reference-sample.parquet")
    if os.path.exists(rp):
        ref = pd.read_parquet(rp)
        ref_cap = max(1, cfg.kaputt_samples // 2)
        added = 0
        for _, row in ref.iterrows():
            img = _img(row.get("reference_crop", "")) or _img(row.get("reference_image", ""))
            if not img:
                continue
            out.append(UnifiedSample(
                image_path=img, source="kaputt",
                grade="new", damage_score=0.0, defects=[],
                has_grade=True, has_damage=True, has_defect=True,
                group_id=str(row.get("item_identifier") or ""),
            ))
            added += 1
            if added >= ref_cap:
                break
    return out
