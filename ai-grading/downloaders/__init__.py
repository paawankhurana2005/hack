"""Source-dataset downloaders. Each module exposes a single `download()` that is
idempotent (skips files already present) and never raises — it returns whatever
it managed to fetch so the pipeline degrades gracefully on partial failure.
"""

from __future__ import annotations

import time
from pathlib import Path

import requests

import config


def fetch_to_file(url: str, dest: Path, *, desc: str | None = None) -> bool:
    """Stream `url` to `dest`. Skips if dest already exists and is non-empty.

    Returns True on success (or already-present), False on failure. Never raises.
    """
    if dest.exists() and dest.stat().st_size > 0:
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(1, config.DOWNLOAD_RETRIES + 1):
        try:
            with requests.get(
                url, stream=True, timeout=config.DOWNLOAD_TIMEOUT_S
            ) as r:
                r.raise_for_status()
                with open(tmp, "wb") as f:
                    for chunk in r.iter_content(chunk_size=1 << 16):
                        if chunk:
                            f.write(chunk)
            tmp.replace(dest)
            return True
        except Exception as e:  # noqa: BLE001 — best-effort downloader
            label = desc or url
            print(f"    ! attempt {attempt}/{config.DOWNLOAD_RETRIES} failed "
                  f"for {label}: {e}")
            time.sleep(1.5 * attempt)
        finally:
            if tmp.exists():
                try:
                    tmp.unlink()
                except OSError:
                    pass
    return False
