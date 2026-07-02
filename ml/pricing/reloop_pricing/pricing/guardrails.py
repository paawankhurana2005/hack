"""Deterministic guardrails — 1:1 mirror of packages/shared/src/pricing/guardrails.ts.

The model proposes; these rules decide. Keeping a byte-for-byte-behaviour copy in Python
means the offline simulation clamps prices EXACTLY the way the live TS engine would, so a
price the agent learns from is the same price a buyer would have seen. The TS file is the
source of truth; change it there first, then update this mirror.

  hard floor = max(seller_floor, route_elsewhere_value)  → below it, REROUTE
  ceiling    = amazon_new_price × 0.95                    → never within 5% of new
  max step   = min(₹100, 8% of current)                  → no whiplash (skip first listing)
  rounding   = nearest ₹50                               → human-legible prices
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import List


@dataclass
class GuardrailResult:
    rule: str
    triggered: bool
    adjustment: float = 0.0


@dataclass
class GuardrailOutput:
    final_price: float
    should_reroute: bool  # True when the price hit the floor — signal the Bridge to reroute
    guardrails_applied: List[GuardrailResult]


def _round_half_up_50(price: float) -> float:
    """Nearest ₹50, rounding halves up (matches JS Math.round for positive prices)."""
    return math.floor(price / 50 + 0.5) * 50


def apply_guardrails(
    proposed_price: float,
    current_price: float,
    seller_floor: float,
    route_elsewhere_value: float,
    amazon_new_price: float,
    is_first_listing: bool,
) -> GuardrailOutput:
    applied: List[GuardrailResult] = []

    floor = max(seller_floor, route_elsewhere_value)
    ceiling = amazon_new_price * 0.95

    price = proposed_price

    # hard floor — below this, reroute instead of pricing lower
    if price < floor:
        applied.append(GuardrailResult("hard_floor", True, floor - price))
        return GuardrailOutput(floor, True, applied)

    # hard ceiling
    if price > ceiling:
        applied.append(GuardrailResult("ceiling", True, ceiling - price))
        price = ceiling

    # max change per step (skip on first listing — no prior price)
    if not is_first_listing:
        max_step = min(100.0, current_price * 0.08)
        delta = price - current_price
        if abs(delta) > max_step:
            clamped = math.copysign(max_step, delta)
            applied.append(GuardrailResult("max_step_change", True, clamped - delta))
            price = current_price + clamped

    # round to nearest ₹50
    rounded = _round_half_up_50(price)
    if rounded != price:
        applied.append(GuardrailResult("round_to_50", True, rounded - price))
        price = rounded

    # final floor check after rounding
    if price < floor:
        price = floor
        applied.append(GuardrailResult("post_round_floor", True))

    return GuardrailOutput(price, False, applied)
