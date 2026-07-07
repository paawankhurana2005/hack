"""MVTec AD downloader — real defect textures used as overlay patches.

MVTec AD (https://www.mvtec.com/company/research/datasets/mvtec-ad) is published
as a single ~4.9 GB archive on the authors' public mirror. We don't need the
whole thing as training data — we only harvest a handful of *defective* sample
crops per category (leather, carpet, tile, wood, metal_nut, bottle) to alpha-
blend onto clean products for extra realism.

Because the archive is large, this downloader is **opt-in**: set the env var
`AI_GRADING_DOWNLOAD_MVTEC=1` (and optionally `MVTEC_URL=...`) to enable it.
When disabled or on any failure it returns [] and the rest of the pipeline runs
fine using the synthetic overlays — MVTec patches are a bonus, not a dependency.
"""

from __future__ import annotations

import os
import tarfile
from pathlib import Path

import config
from downloaders import fetch_to_file

# Public single-archive mirror (same link used by common AD toolkits).
_DEFAULT_URL = (
    "https://www.mydrive.ch/shares/38536/3830184030e49fe74747669442f0f282/"
    "download/420938113-1629952094/mvtec_anomaly_detection.tar.xz"
)


def _enabled() -> bool:
    return os.environ.get("AI_GRADING_DOWNLOAD_MVTEC", "0").strip() in {"1", "true", "yes"}


def _existing_patches() -> list[Path]:
    patches: list[Path] = []
    for cat in config.MVTEC_CATEGORIES:
        patches.extend(sorted((config.MVTEC_RAW_DIR / cat).glob("*.png")))
    return patches


def _extract_defect_crops(archive: Path) -> list[Path]:
    """Pull up to N defective test images per requested category out of the tar."""
    saved: list[Path] = []
    per_cat_count: dict[str, int] = {c: 0 for c in config.MVTEC_CATEGORIES}
    cats = set(config.MVTEC_CATEGORIES)
    try:
        with tarfile.open(archive, "r:xz") as tar:
            for member in tar:
                if not member.isfile() or not member.name.endswith(".png"):
                    continue
                parts = member.name.split("/")
                # layout: <category>/test/<defect>/<idx>.png  (skip 'good')
                if len(parts) < 4 or parts[1] != "test":
                    continue
                category, defect = parts[0], parts[2]
                if category not in cats or defect == "good":
                    continue
                if per_cat_count[category] >= config.MVTEC_PATCHES_PER_CATEGORY:
                    continue
                out_dir = config.MVTEC_RAW_DIR / category
                out_dir.mkdir(parents=True, exist_ok=True)
                out_path = out_dir / f"{defect}_{per_cat_count[category]:03d}.png"
                if not out_path.exists():
                    fobj = tar.extractfile(member)
                    if fobj is None:
                        continue
                    out_path.write_bytes(fobj.read())
                saved.append(out_path)
                per_cat_count[category] += 1
    except Exception as e:  # noqa: BLE001
        print(f"    ! failed extracting MVTec crops: {e}")
    return saved


def download() -> list[Path]:
    """Return local defect-patch paths (possibly empty — patches are optional)."""
    print("[MVTec AD] defect texture patches (optional overlays)")
    config.ensure_dirs()

    existing = _existing_patches()
    if existing:
        print(f"  ✓ {len(existing)} MVTec patches already present — skipping download")
        return existing

    if not _enabled():
        print("  · skipped (set AI_GRADING_DOWNLOAD_MVTEC=1 to fetch the ~4.9GB "
              "archive). Pipeline will use synthetic overlays only.")
        return []

    url = os.environ.get("MVTEC_URL", _DEFAULT_URL)
    archive = config.MVTEC_RAW_DIR / "mvtec_anomaly_detection.tar.xz"
    print(f"  - downloading MVTec archive (large): {url}")
    if not fetch_to_file(url, archive, desc="mvtec archive"):
        print("  ! MVTec download failed — continuing without real defect patches")
        return []

    print("  - extracting defect crops…")
    saved = _extract_defect_crops(archive)
    print(f"  ✓ MVTec patches extracted: {len(saved)}")
    return saved
