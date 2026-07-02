"""Event significance filter — 1:1 mirror of isSignificant in
packages/shared/src/pricing/events.ts.

Most raw market events die here; only a meaningful change survives to wake the agent. This
is the perception gate: an autonomous agent that reprices on every heartbeat is noisy, not
smart. The heartbeat cadence itself is the caller's staleness backstop. The TS file is the
source of truth; keep the thresholds below in lock-step with it.
"""

from __future__ import annotations

from typing import Dict

# maps a raw event type to the reason code stamped on the decision (audit trail)
REASON_BY_EVENT = {
    "comp_sold": "comp_sold_nearby",
    "comp_listed": "comp_listed_cheaper",
    "asin_new_price_changed": "amazon_new_price_dropped",
    "view_velocity_drop": "view_velocity_drop",
    "dwell_threshold": "dwell_threshold",
    "save_no_purchase": "save_no_purchase",
    "heartbeat": "heartbeat_staleness",
    "initial_listing": "initial_listing",
}


def reason_code_for(event_type: str) -> str:
    return REASON_BY_EVENT.get(event_type, "heartbeat_staleness")


def _num(payload: Dict, key: str, fallback: float = 0.0) -> float:
    v = payload.get(key)
    return float(v) if isinstance(v, (int, float)) else fallback


def is_significant(
    event_type: str,
    payload: Dict,
    comp_median_price: float,
    amazon_new_price: float,
    view_velocity_24h: float,
) -> bool:
    """True when an event warrants a reprice. Most return False — that's the point."""
    if event_type == "comp_sold":
        return True  # a real transaction cleared — always informative
    if event_type == "comp_listed":
        return _num(payload, "price") < comp_median_price * 0.95  # undercuts us by >5%
    if event_type == "asin_new_price_changed":
        return abs((_num(payload, "newPrice") - amazon_new_price) / (amazon_new_price + 1e-9)) > 0.08
    if event_type == "view_velocity_drop":
        return _num(payload, "currentVelocity") < view_velocity_24h * 0.3  # sustained drop
    if event_type == "dwell_threshold":
        return int(_num(payload, "daysOnMarket")) in (3, 7, 14, 21)  # milestone crossings only
    if event_type == "save_no_purchase":
        return _num(payload, "hoursSinceSave") > 72
    if event_type == "heartbeat":
        return True  # staleness backstop (caller gates the cadence)
    if event_type == "initial_listing":
        return True  # first price
    return False
