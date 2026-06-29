"""Feature engineering — the ONE source of truth.

Every model (warm-start XGBoost now, retrains later) reads features through
``build_feature_vector`` so training and inference can never drift. The vector mirrors
the TypeScript ``PricingStateVector`` in packages/shared/src/pricing/types.ts.

Shape: 38 base features. Pass ``arm`` to append 3 arm features → 41 total. The reward
model is queried once per arm at decision time, so the per-arm tail is what lets one
model score every price lever.
"""

from __future__ import annotations

from typing import Dict, Optional

import numpy as np

# Grade ordinal convention for THIS engine: 5=new, 4=like-new, 3=good, 2=fair, 1=poor.
GRADE_ORDINALS = {"new": 5, "like-new": 4, "good": 3, "fair": 2, "poor": 1}

HANDLING_COST = 120.0  # ₹ fixed cost per transaction (mirrors DEFAULT_REWARD_CONFIG)

FEATURE_NAMES = [
    # item identity (12)
    "grade_ordinal",
    "grade_is_new",
    "grade_is_poor",
    "original_price_log",
    "item_age_days",
    "has_accessories",
    "authenticity_score",
    "damage_score",
    "defect_count",
    "category_l1_encoded",
    "category_l2_encoded",
    "brand_encoded",
    # listing lifecycle (5)
    "days_on_market",
    "num_reprices",
    "current_discount_pct",
    "deadline_pressure",
    "is_first_listing",
    # demand signals (7)
    "view_velocity_24h",
    "view_velocity_trend",
    "save_rate",
    "ctr",
    "message_count",
    "cart_abandons",
    "engagement_score",
    # competition signals (6)
    "comp_count_nearby",
    "comp_median_price_log",
    "comp_min_price_log",
    "comp_sold_last_7d",
    "comp_avg_days_to_sell",
    "price_vs_comp_median",
    # geo / local (3)
    "nearby_buyer_count",
    "local_supply_count",
    "geo_demand_index",
    # temporal (5)
    "day_of_week_sin",
    "day_of_week_cos",
    "hour_of_day_sin",
    "hour_of_day_cos",
    "seasonality_index",
    # arm features (3) — appended only when an arm is supplied
    "price_arm_multiplier",
    "candidate_price_log",
    "candidate_margin_log",
]

BASE_DIM = 38
FEATURE_DIM = len(FEATURE_NAMES)  # 41 with arm features


def build_feature_vector(
    row: Dict,
    arm: Optional[float] = None,
    encoders: Optional[Dict] = None,
) -> np.ndarray:
    """Single source of truth for feature engineering.

    Called identically during training and inference.
      arm=None  → 38-dim base vector
      arm=float → 41-dim vector (base + 3 arm features)
    """

    def safe_log1p(x) -> float:
        return float(np.log1p(max(0.0, float(x or 0))))

    def safe_encode(encoder_key: str, value, default: int = 0) -> int:
        if encoders and encoder_key in encoders:
            try:
                return int(encoders[encoder_key].transform([str(value)])[0])
            except ValueError:
                return default
        return default

    grade = int(row.get("grade_ordinal", 3))
    original_price = float(row.get("original_price", 0) or 0)
    comp_median = float(
        row.get("comp_median_price", original_price * 0.6) or original_price * 0.6
    )
    current_price = float(row.get("current_price", comp_median) or comp_median)
    floor = float(row.get("floor", 0) or 0)

    # engagement composite — one number capturing buyer interest
    save_rate = float(row.get("save_rate", 0) or 0)
    ctr = float(row.get("ctr", 0.05) or 0.05)
    message_count = float(row.get("message_count", 0) or 0)
    engagement_score = (
        (save_rate * 0.4) + (ctr * 0.4) + (min(message_count, 10) / 10 * 0.2)
    )

    features = [
        # item identity
        grade,
        int(grade == 5),
        int(grade <= 2),
        safe_log1p(original_price),
        float(row.get("item_age_days", 0) or 0),
        float(row.get("has_accessories", 0) or 0),
        float(row.get("authenticity_score", 0.9) or 0.9),
        float(row.get("damage_score", 0.1) or 0.1),
        float(row.get("defect_count", 0) or 0),
        safe_encode("category_l1", row.get("category_l1", "unknown")),
        safe_encode("category_l2", row.get("category_l2", "unknown")),
        safe_encode("brand", row.get("brand", "unknown")),
        # listing lifecycle
        float(row.get("days_on_market", 0) or 0),
        float(row.get("num_reprices", 0) or 0),
        (current_price - comp_median) / (comp_median + 1e-9),
        float(row.get("deadline_pressure", 1.0) or 1.0),
        float(row.get("is_first_listing", 1) or 1),
        # demand signals
        float(row.get("view_velocity_24h", 5) or 5),
        float(row.get("view_velocity_trend", 1.0) or 1.0),
        save_rate,
        ctr,
        message_count,
        float(row.get("cart_abandons", 0) or 0),
        engagement_score,
        # competition
        float(row.get("comp_count_nearby", 3) or 3),
        safe_log1p(comp_median),
        safe_log1p(float(row.get("comp_min_price", comp_median * 0.85) or comp_median * 0.85)),
        float(row.get("comp_sold_last_7d", 2) or 2),
        float(row.get("comp_avg_days_to_sell", 8) or 8),
        current_price / (comp_median + 1e-9),
        # geo
        float(row.get("nearby_buyer_count", 5) or 5),
        float(row.get("local_supply_count", 3) or 3),
        float(row.get("geo_demand_index", 0.5) or 0.5),
        # temporal (cyclical sin/cos)
        np.sin(2 * np.pi * float(row.get("day_of_week", 0) or 0) / 7),
        np.cos(2 * np.pi * float(row.get("day_of_week", 0) or 0) / 7),
        np.sin(2 * np.pi * float(row.get("hour_of_day", 12) or 12) / 24),
        np.cos(2 * np.pi * float(row.get("hour_of_day", 12) or 12) / 24),
        float(row.get("seasonality_index", 0.5) or 0.5),
    ]

    if arm is not None:
        candidate_price = comp_median * arm
        candidate_margin = candidate_price - floor - HANDLING_COST
        features.extend(
            [
                arm,
                safe_log1p(candidate_price),
                safe_log1p(max(0.0, candidate_margin)),
            ]
        )

    return np.array(features, dtype=np.float32)
