"""Pull sample images from the Hugging Face datasets-server (no full-dataset download,
no `datasets` dependency). Used for ABO (clean catalog) and SOP (multi-view). Images
are cached to disk so repeat runs are offline.

MVTec / VisA are NOT pulled here — their masks/defect labels need the canonical
on-disk dataset layout; see adapters.py (point --data-root at a local download).
"""
from __future__ import annotations

import json
import os
import ssl
import urllib.request
from typing import Optional

_SSL = ssl.create_default_context()
_SSL.check_hostname = False
_SSL.verify_mode = ssl.CERT_NONE  # HF cached-assets occasionally trip strict roots

_ROWS = "https://datasets-server.huggingface.co/rows"


def _fetch(url: str, timeout: int = 60) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "reloop-grading/0.1"})
    return urllib.request.urlopen(req, timeout=timeout, context=_SSL).read()


def _row_srcs(row: dict) -> list[str]:
    out = []
    for v in row.values():
        if isinstance(v, dict) and "src" in v:
            out.append(v["src"])
    return out


def _row_group_id(row: dict) -> Optional[str]:
    for k in ("label", "class", "super_class_id", "class_id", "product_id"):
        if k in row and not isinstance(row[k], dict):
            return str(row[k])
    return None


def hf_pull_images(
    dataset: str,
    config: str,
    split: str,
    n: int,
    cache_dir: str,
    subdir: str,
) -> list[tuple[str, Optional[str]]]:
    """Returns list of (local_image_path, group_id). Re-uses cached files when present."""
    dest = os.path.join(cache_dir, subdir)
    os.makedirs(dest, exist_ok=True)
    manifest_path = os.path.join(dest, "manifest.json")
    if os.path.exists(manifest_path):
        try:
            man = json.loads(open(manifest_path).read())
            if len(man) >= n:
                return [(os.path.join(dest, e["file"]), e.get("group")) for e in man[:n]]
        except Exception:
            pass

    rows: list[dict] = []
    page = 100
    off = 0
    while len(rows) < n:
        url = f"{_ROWS}?dataset={dataset}&config={config}&split={split}&offset={off}&length={min(page, n - len(rows))}"
        try:
            batch = json.loads(_fetch(url)).get("rows", [])
        except Exception as e:
            print(f"[download] {dataset} rows fetch failed @off={off}: {e}")
            break
        if not batch:
            break
        rows.extend(batch)
        off += len(batch)

    manifest: list[dict] = []
    results: list[tuple[str, Optional[str]]] = []
    for i, r in enumerate(rows[:n]):
        row = r.get("row", {})
        srcs = _row_srcs(row)
        if not srcs:
            continue
        fname = f"{i:05d}.jpg"
        fpath = os.path.join(dest, fname)
        if not os.path.exists(fpath):
            try:
                with open(fpath, "wb") as f:
                    f.write(_fetch(srcs[0]))
            except Exception as e:
                print(f"[download] image {i} failed: {e}")
                continue
        gid = _row_group_id(row)
        manifest.append({"file": fname, "group": gid})
        results.append((fpath, gid))

    with open(manifest_path, "w") as f:
        json.dump(manifest, f)
    return results
