"""Amazon Berkeley Objects (ABO) downloader — category-aware.

ABO is on the AWS Open Data registry in the public S3 bucket
`amazon-berkeley-objects` (us-east-1, anonymous HTTPS access). We use two lightweight
metadata sources rather than the multi-GB image tar:

  * `listings/metadata/listings_*.json.gz` — one JSON object per product, carrying its
    `product_type` (e.g. SHOES, CELLULAR_PHONE) and its image ids.
  * `images/metadata/images.csv.gz` — maps every `image_id` to a small-image `path`.

We map each product's `product_type` to one of our CATEGORIES (config), then fetch a
balanced quota of small images PER category. The category travels with each image (via
the filename and a manifest) so the rest of the pipeline can apply category-appropriate
degradation. Small images are <=256px — perfect for 224x224 CLIP crops.

`download()` returns a list of (local_path, category) pairs. Idempotent: re-runs reuse
images already on disk (categories recovered from the manifest).
"""

from __future__ import annotations

import gzip
import io
import json
from pathlib import Path

import pandas as pd

import config
from downloaders import fetch_to_file

_HOSTS = [
    "https://amazon-berkeley-objects.s3.amazonaws.com",
    "https://amazon-berkeley-objects.s3.us-east-1.amazonaws.com",
]
_IMAGES_METADATA = "images/metadata/images.csv.gz"
_LISTINGS_METADATA = "listings/metadata/listings_{i}.json.gz"
_NUM_LISTING_FILES = 16
_SMALL_PREFIX = "images/small"
_MANIFEST = "_categories.json"


def _get_bytes(rel_path: str) -> bytes | None:
    import requests

    for host in _HOSTS:
        url = f"{host}/{rel_path}"
        try:
            resp = requests.get(url, timeout=config.DOWNLOAD_TIMEOUT_S)
            resp.raise_for_status()
            return resp.content
        except Exception as e:  # noqa: BLE001
            print(f"    ! fetch failed via {host} for {rel_path}: {e}")
    return None


def _image_id_to_path() -> dict[str, str]:
    """image_id -> small-image relative path, from images.csv.gz."""
    raw = _get_bytes(_IMAGES_METADATA)
    if raw is None:
        return {}
    df = pd.read_csv(gzip.open(io.BytesIO(raw), "rt"))
    if "image_id" not in df.columns or "path" not in df.columns:
        print(f"    ! unexpected images.csv columns: {list(df.columns)}")
        return {}
    return dict(zip(df["image_id"], df["path"]))


def _product_type(listing: dict) -> str:
    """ABO product_type is a list of {value:...}; pull the first value."""
    pt = listing.get("product_type")
    if isinstance(pt, list) and pt:
        return str(pt[0].get("value", ""))
    return str(pt or "")


def _plan_categories(id2path: dict[str, str]) -> dict[str, list[tuple[str, str]]]:
    """Scan listings files and collect (image_id, path) per category up to quota.

    Uses each product's main image plus up to two alternate views (more data, esp. for
    the sparser categories like electronics), deduplicated by image_id."""
    target = config.NUM_ABO_PER_CATEGORY
    picked: dict[str, list[tuple[str, str]]] = {c: [] for c in config.CATEGORIES}
    seen: set[str] = set()

    for i in range(_NUM_LISTING_FILES):
        if all(len(v) >= target for v in picked.values()):
            break
        raw = _get_bytes(_LISTINGS_METADATA.format(i=i))
        if raw is None:
            continue
        try:
            lines = gzip.open(io.BytesIO(raw), "rt", encoding="utf-8").read().splitlines()
        except Exception as e:  # noqa: BLE001
            print(f"    ! could not parse listings_{i}: {e}")
            continue

        for ln in lines:
            try:
                listing = json.loads(ln)
            except Exception:  # noqa: BLE001
                continue
            category = config.category_for_product_type(_product_type(listing))
            if category is None or len(picked[category]) >= target:
                continue
            ids = [listing.get("main_image_id")]
            ids += (listing.get("other_image_id") or [])[:2]
            for img_id in ids:
                if not img_id or img_id in seen or len(picked[category]) >= target:
                    continue
                path = id2path.get(img_id)
                if not path:
                    continue
                seen.add(img_id)
                picked[category].append((img_id, path))

        filled = {c: len(v) for c, v in picked.items()}
        print(f"  scanned listings_{i}: {filled}")
    return picked


def _load_manifest() -> dict[str, str]:
    mpath = config.ABO_RAW_DIR / _MANIFEST
    if mpath.exists():
        try:
            return json.loads(mpath.read_text())
        except Exception:  # noqa: BLE001
            return {}
    return {}


def download() -> list[tuple[Path, str]]:
    """Download up to NUM_ABO_PER_CATEGORY clean images per category.

    Returns [(local_path, category), ...]."""
    print("[ABO] Amazon Berkeley Objects — clean product images (category-aware)")
    config.ensure_dirs()
    target = config.NUM_ABO_PER_CATEGORY

    # Fast path: enough per-category images already on disk (recover categories from
    # the manifest, which keys filename -> category).
    manifest = _load_manifest()
    if manifest:
        have: dict[str, list[Path]] = {c: [] for c in config.CATEGORIES}
        for fname, cat in manifest.items():
            p = config.ABO_RAW_DIR / fname
            if cat in have and p.exists():
                have[cat].append(p)
        if all(len(v) >= target for v in have.values()):
            print(f"  ✓ per-category quota already on disk: "
                  f"{ {c: len(v) for c, v in have.items()} }")
            return [(p, c) for c, ps in have.items() for p in ps[:target]]

    print("  - fetching ABO image metadata (image_id -> path)")
    id2path = _image_id_to_path()
    if not id2path:
        print("  ! could not load images metadata; nothing to download")
        return [(config.ABO_RAW_DIR / f, c) for f, c in manifest.items()
                if (config.ABO_RAW_DIR / f).exists()]

    print("  - scanning listings for category-mapped products")
    plan = _plan_categories(id2path)

    from concurrent.futures import ThreadPoolExecutor
    from tqdm import tqdm

    # One task per image; download in parallel (16 workers) — the sequential loop was
    # the bottleneck (one blocking HTTPS request per small image).
    tasks: list[tuple[str, str, Path]] = []
    for category, items in plan.items():
        for img_id, rel in items[:target]:
            tasks.append((category, rel, config.ABO_RAW_DIR / f"{category}__{img_id}.jpg"))

    def _grab(t: tuple[str, str, Path]) -> tuple[Path, str] | None:
        category, rel, dest = t
        if dest.exists() and dest.stat().st_size > 0:
            return (dest, category)
        for host in _HOSTS:
            if fetch_to_file(f"{host}/{_SMALL_PREFIX}/{rel}", dest, desc=dest.name):
                return (dest, category)
        return None

    results: list[tuple[Path, str]] = []
    new_manifest: dict[str, str] = dict(manifest)
    bar = tqdm(total=len(tasks), desc="  downloading ABO", unit="img")
    with ThreadPoolExecutor(max_workers=16) as ex:
        for res in ex.map(_grab, tasks):
            if res is not None:
                dest, category = res
                results.append((dest, category))
                new_manifest[dest.name] = category
            bar.update(1)
    bar.close()

    (config.ABO_RAW_DIR / _MANIFEST).write_text(json.dumps(new_manifest))
    counts = {c: sum(1 for _, cc in results if cc == c) for c in config.CATEGORIES}
    print(f"  ✓ ABO images by category: {counts}")
    return results
