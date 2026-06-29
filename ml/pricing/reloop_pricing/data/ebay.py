"""eBay electronics loader (+ schema-faithful synthetic fallback).

Real file: an eBay electronics CSV with text condition labels. ``synthetic_ebay``
emits the same columns until that's downloaded. Both funnel through ``_normalize``.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# eBay text conditions → our ordinal (5=new ... 1=poor).
EBAY_CONDITION_MAP = {
    "New": 5,
    "Like New": 4,
    "Excellent - Refurbished": 4,
    "Good - Refurbished": 3,
    "Good": 3,
    "Fair": 2,
    "Poor": 1,
    "For parts or not working": 1,
}

_CONDITIONS = list(EBAY_CONDITION_MAP.keys())
_BRANDS = ["Apple", "Samsung", "Google", "OnePlus", "Sony", "unknown"]
_CATEGORIES = [("electronics", "phones"), ("electronics", "tablets"), ("electronics", "audio")]


def _normalize(df: pd.DataFrame) -> pd.DataFrame:
    df = df.dropna(subset=["price"])
    df = df[df["price"] > 0]

    title = df.get("product_name", df.get("title", pd.Series("", index=df.index)))
    return pd.DataFrame(
        {
            "title": title.fillna("").values,
            "brand": df.get("brand", pd.Series("unknown", index=df.index)).fillna("unknown").values,
            "category_l1": df.get("category", pd.Series("electronics", index=df.index)).fillna("electronics").values,
            "category_l2": df.get("sub_category", pd.Series("phones", index=df.index)).fillna("phones").values,
            "grade_ordinal": df.get("condition", pd.Series("Good", index=df.index)).map(EBAY_CONDITION_MAP).fillna(3).values,
            "price": df["price"].values,
            "shipping": 0,
            "source": "ebay",
        }
    )


def load_ebay(path: str) -> pd.DataFrame:
    """Load the real eBay electronics CSV."""
    return _normalize(pd.read_csv(path))


def synthetic_ebay(n: int = 500, seed: int = 11) -> pd.DataFrame:
    """Generate n rows with the eBay raw schema, then normalise."""
    rng = np.random.default_rng(seed)
    conditions = rng.choice(_CONDITIONS, size=n)
    ordinal = np.array([EBAY_CONDITION_MAP[c] for c in conditions])
    # electronics are pricier; better grade → higher price
    base = np.exp(rng.normal(loc=8.2 + 0.12 * ordinal, scale=0.5))
    cats = [_CATEGORIES[i] for i in rng.integers(0, len(_CATEGORIES), size=n)]
    raw = pd.DataFrame(
        {
            "product_name": [f"device {i}" for i in range(n)],
            "brand": rng.choice(_BRANDS, size=n),
            "category": [c[0] for c in cats],
            "sub_category": [c[1] for c in cats],
            "condition": conditions,
            "price": np.round(base, 2),
        }
    )
    return _normalize(raw)
