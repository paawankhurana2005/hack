"""Geo-demand index — mirrors apps/api/src/jobs/computeDemandIndex.ts's normalize-and-
clamp formula (spec 024, phase A). That job rolls up real region-cluster x category
demand events into a score of `1 + K * (D_zone - D_avg) / D_avg`, clamped to
[SCORE_MIN, SCORE_MAX]. This module is the same formula so the offline
training/simulation side stays in lock-step with the live TS serving side, instead of
each drawing an unrelated random number for the same named feature.

Before this, every simulated listing's `geo_demand_index` was pure noise
(`rng.uniform(0.3, 0.8)`, see simulate_marketplace.py's prior _make_listing) — the
feature carried no real signal for the model to learn from. Real production geo
demand ultimately measures how much a zone's actual buyer activity deviates from the
cross-zone average for that category; the closest honest analogue available inside
this synthetic marketplace is `MarketWorld.CATEGORY_BIAS` (the hidden, structural
demand skew per cohort that `try_sell` actually clears against) — so geo demand here
is computed as a noisy read of that same bias, not an unrelated random draw.
"""

from __future__ import annotations

from typing import Optional

import numpy as np

# Same constants as computeDemandIndex.ts.
SCORE_MIN = 0.7
SCORE_MAX = 1.3
NORMALIZE_K = 0.5


def clamp(value: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, value))


def compute_geo_demand_index(
    cohort_demand: float,
    avg_demand: float = 1.0,
    noise_std: float = 0.05,
    rng: Optional[np.random.Generator] = None,
) -> float:
    """score = clamp(1 + K * (D_cohort - D_avg) / D_avg, SCORE_MIN, SCORE_MAX) —
    identical shape to the TS job's `raw = 1 + NORMALIZE_K * (row.demand - dAvg) / dAvg`.
    A small noise term stands in for real per-listing/day sampling variance around the
    cohort's true demand level (the TS job instead measures variance via `sample_size`
    over a real 7-day event window — not available in a single synthetic draw here)."""
    if avg_demand <= 0:
        raw = 1.0
    else:
        raw = 1.0 + NORMALIZE_K * ((cohort_demand - avg_demand) / avg_demand)
    if rng is not None and noise_std > 0:
        raw += float(rng.normal(0.0, noise_std))
    return clamp(raw, SCORE_MIN, SCORE_MAX)
