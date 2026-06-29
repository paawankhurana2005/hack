"""Mercari Price Suggestion Challenge loader (+ schema-faithful synthetic fallback).

Real file: the Kaggle ``train.tsv`` (tab-separated). Until that's downloaded,
``synthetic_mercari`` emits rows with the SAME columns so the pipeline runs end-to-end.
Both paths funnel through ``_normalize`` → one output schema.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# Mercari item_condition_id: 1=new ... 5=poor  →  our ordinal 5=new ... 1=poor.
CONDITION_LADDER = {1: 5, 2: 4, 3: 3, 4: 2, 5: 1}

_BRANDS = ["Nike", "Apple", "Samsung", "Sony", "Adidas", "unknown", "Lululemon", "Dell"]
_CATEGORIES = [
    "Electronics/Cell Phones/Smartphones",
    "Men/Shoes/Sneakers",
    "Women/Athletic Apparel/Pants",
    "Electronics/Computers/Laptops",
    "Home/Kitchen/Small Appliances",
    "Vintage & Collectibles/Electronics/Audio",
]


def _normalize(df: pd.DataFrame) -> pd.DataFrame:
    df = df.dropna(subset=["price"])
    df = df[df["price"] > 0]

    cats = df["category_name"].fillna("unknown/unknown/unknown").str.split("/", expand=True)
    category_l1 = cats[0].fillna("unknown")
    category_l2 = cats[1].fillna("unknown") if 1 in cats.columns else "unknown"

    return pd.DataFrame(
        {
            "title": df["name"].fillna(""),
            "brand": df["brand_name"].fillna("unknown"),
            "category_l1": category_l1.values,
            "category_l2": category_l2 if isinstance(category_l2, str) else category_l2.values,
            "grade_ordinal": df["item_condition_id"].map(CONDITION_LADDER).fillna(3).values,
            "price": df["price"].values,
            "shipping": df.get("shipping", pd.Series(0, index=df.index)).fillna(0).values,
            "source": "mercari",
        }
    )


def load_mercari(path: str) -> pd.DataFrame:
    """Load the real Kaggle Mercari train.tsv."""
    return _normalize(pd.read_csv(path, sep="\t"))


def synthetic_mercari(n: int = 500, seed: int = 7) -> pd.DataFrame:
    """Generate n rows with the exact raw Mercari schema, then normalise.

    Prices follow a condition-aware log-normal so better-graded items skew pricier —
    a believable signal for the reward simulation to learn from.
    """
    rng = np.random.default_rng(seed)
    condition = rng.integers(1, 6, size=n)  # 1..5
    # better condition (lower id) → higher base price
    base = np.exp(rng.normal(loc=7.0 - 0.18 * condition, scale=0.55))
    raw = pd.DataFrame(
        {
            "name": [f"item {i}" for i in range(n)],
            "brand_name": rng.choice(_BRANDS, size=n),
            "category_name": rng.choice(_CATEGORIES, size=n),
            "item_condition_id": condition,
            "price": np.round(base, 2),
            "shipping": rng.integers(0, 2, size=n),
        }
    )
    return _normalize(raw)
