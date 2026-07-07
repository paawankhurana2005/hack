"""COCO 2017 indoor-background downloader.

We composite clean products onto real home-ish scenes so the model sees products
in context, not just on white catalog backdrops. We pull the COCO val2017
annotations (small relative to the image zip), pick images that contain indoor
furniture categories (couch / chair / dining table / bed), then download only
those individual JPEGs — far lighter than the full 1 GB val2017 image zip.

On any failure this returns whatever it has; the composer simply skips background
injection when no backgrounds are available.
"""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

import config
from downloaders import fetch_to_file

_ANNOTATIONS_URL = (
    "http://images.cocodataset.org/annotations/annotations_trainval2017.zip"
)
_IMAGE_URL_TMPL = "http://images.cocodataset.org/val2017/{:012d}.jpg"
_INSTANCES_MEMBER = "annotations/instances_val2017.json"


def _load_instances() -> dict | None:
    zip_path = config.COCO_RAW_DIR / "annotations_trainval2017.zip"
    print(f"  - fetching COCO annotations: {_ANNOTATIONS_URL}")
    if not fetch_to_file(_ANNOTATIONS_URL, zip_path, desc="coco annotations"):
        return None
    try:
        with zipfile.ZipFile(zip_path) as zf:
            with zf.open(_INSTANCES_MEMBER) as fh:
                return json.load(fh)
    except Exception as e:  # noqa: BLE001
        print(f"    ! failed reading instances json: {e}")
        return None


def _indoor_image_ids(instances: dict) -> list[int]:
    wanted_names = set(config.COCO_INDOOR_CATEGORIES)
    cat_ids = {
        c["id"] for c in instances.get("categories", []) if c["name"] in wanted_names
    }
    if not cat_ids:
        print(f"    ! none of {wanted_names} found in COCO categories")
        return []
    ids: list[int] = []
    seen: set[int] = set()
    for ann in instances.get("annotations", []):
        if ann.get("category_id") in cat_ids:
            img_id = ann["image_id"]
            if img_id not in seen:
                seen.add(img_id)
                ids.append(img_id)
    ids.sort()  # deterministic ordering
    return ids


def download() -> list[Path]:
    """Download up to NUM_COCO_BACKGROUNDS indoor images. Returns local paths."""
    print("[COCO] indoor background scenes")
    config.ensure_dirs()

    existing = sorted(config.COCO_RAW_DIR.glob("*.jpg"))
    if len(existing) >= config.NUM_COCO_BACKGROUNDS:
        print(f"  ✓ {len(existing)} COCO backgrounds already present — skipping")
        return existing[: config.NUM_COCO_BACKGROUNDS]

    instances = _load_instances()
    if instances is None:
        print("  ! could not load COCO annotations; backgrounds disabled")
        return existing

    ids = _indoor_image_ids(instances)
    print(f"  - indoor candidate images: {len(ids):,}")

    paths: list[Path] = list(existing)
    have = {p.name for p in existing}
    target = config.NUM_COCO_BACKGROUNDS

    from tqdm import tqdm

    bar = tqdm(total=target, initial=len(paths), desc="  downloading COCO", unit="img")
    for img_id in ids:
        if len(paths) >= target:
            break
        fname = f"{img_id:012d}.jpg"
        if fname in have:
            continue
        dest = config.COCO_RAW_DIR / fname
        if fetch_to_file(_IMAGE_URL_TMPL.format(img_id), dest, desc=fname):
            paths.append(dest)
            have.add(fname)
            bar.update(1)
    bar.close()

    print(f"  ✓ COCO backgrounds available: {len(paths)}")
    return paths[:target]
