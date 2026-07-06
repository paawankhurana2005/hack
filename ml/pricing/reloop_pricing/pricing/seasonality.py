"""Seasonality index — 1:1 mirror of apps/api/src/lib/seasonality.ts (spec 024,
phase 2). Keep the category buckets and monthly curves in lock-step with that
file, same convention as significance.py mirroring events.ts. Unlike geo.py
(which needs a cohort demand signal from the marketplace world), this needs no
external state at all — real Indian retail seasonality (Diwali, wedding
season, back-to-school) is stable enough to encode directly.
"""

from __future__ import annotations

from datetime import date
from typing import Dict, List

CATEGORY_ALIASES: Dict[str, str] = {
    "electronics": "electronics",
    "mobile": "electronics",
    "cell phones": "electronics",
    "fashion": "fashion",
    "apparel": "fashion",
    "clothing": "fashion",
    "women": "fashion",
    "men": "fashion",
    "home": "home",
    "furniture": "home",
    "home & garden": "home",
    "toys": "toys",
    "sports": "sports",
    "books": "books",
    "books_media": "books",
    "media": "books",
    "beauty": "beauty",
}

# Index 0 = January … 11 = December. Identical numbers to seasonality.ts.
SEASONAL_CURVE: Dict[str, List[float]] = {
    "electronics": [1.1, 1.05, 0.95, 0.9, 0.9, 1.0, 1.05, 1.1, 1.0, 1.2, 1.25, 1.1],
    "fashion": [1.15, 1.1, 0.95, 0.95, 1.0, 1.0, 0.9, 0.9, 0.95, 1.15, 1.2, 1.15],
    "home": [1.0, 1.0, 0.95, 0.95, 0.95, 1.0, 1.0, 1.0, 1.0, 1.15, 1.2, 1.1],
    "toys": [0.95, 0.9, 0.9, 0.95, 1.0, 1.05, 1.0, 0.95, 0.95, 1.1, 1.25, 1.2],
    "sports": [1.0, 1.0, 1.05, 1.05, 1.0, 0.95, 0.9, 0.9, 0.95, 1.0, 1.05, 1.05],
    "books": [1.0, 1.0, 1.05, 1.1, 1.05, 1.1, 1.0, 0.95, 1.0, 1.0, 1.0, 1.0],
    "beauty": [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.95, 0.95, 1.0, 1.15, 1.2, 1.1],
    "other": [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.05, 1.1, 1.05],
}

SCORE_MIN = 0.7
SCORE_MAX = 1.3


def clamp(value: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, value))


def get_seasonality_index(category: str, at: date | None = None) -> float:
    bucket = CATEGORY_ALIASES.get(str(category).strip().lower(), "other")
    at = at or date.today()
    raw = SEASONAL_CURVE[bucket][at.month - 1]
    return clamp(raw, SCORE_MIN, SCORE_MAX)
