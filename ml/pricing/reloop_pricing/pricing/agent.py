"""PricingAgent — the autonomous loop that turns the reward model into an agent.

The model PERCEIVES (predicts reward per arm), the bandit + guardrails DECIDE, and the agent
runs the full agentic cycle around them:

    sense  → is this event worth acting on?           (perception / trigger gate)
    think  → model.predict → bandit → guardrails       (goal-directed reasoning)
    act    → reprice / reroute / hold                  (tool use)
    reflect→ narrate + emit the structured trace line  (explainability)
    learn  → reward → bandit update → memory → retrain  (self-improvement)

Everything is the same math the live TS engine (apps/api/src/services/pricing) runs — this
class just gives it memory, a cadence, and a closing learning loop so it behaves like an
agent instead of a stateless function.
"""

from __future__ import annotations

import json
from typing import Callable, Dict, Optional, Tuple

import numpy as np

from .bandit import BucketedBandit
from .guardrails import GuardrailOutput, apply_guardrails
from .memory import AgentMemory
from .retrain import LearningLoop
from .reward import DEFAULT_REWARD_CONFIG, RewardConfig, compute_reward
from .significance import is_significant, reason_code_for
from .warmstart import WarmStartPricingModel

HEARTBEAT_DAYS = 3  # staleness backstop — mirrors agent-store.ts HEARTBEAT_DAYS
GRADE_KEY_BY_ORDINAL = {5: "new", 4: "like-new", 3: "good", 2: "fair", 1: "poor"}


def _grade_key(state: Dict) -> str:
    if state.get("grade_key"):
        return str(state["grade_key"])
    return GRADE_KEY_BY_ORDINAL.get(int(state.get("grade_ordinal", 3)), "good")


def narrate(decision: Dict, action: str, reason_code: str) -> str:
    """One deterministic sentence explaining the move — the Python-side reflection. The live
    TS engine swaps in an LLM here; the numbers and reason are identical either way."""
    frm, to = round(decision["current_price"]), round(decision["final_price"])
    if action == "reroute":
        return f"Below the ₹{round(decision['floor'])} floor — handing off to the Intelligent Bridge to reroute."
    if action == "hold":
        return f"Holding at ₹{to}: the model's best arm keeps the current price optimal for now."
    direction = "Raised" if to > frm else "Lowered"
    guard = f" (capped by {', '.join(decision['guardrails'])})" if decision["guardrails"] else ""
    return f"{direction} ₹{frm}→₹{to} on {reason_code}{guard}; {decision['chosen_arm']}× the ₹{round(decision['anchor'])} local median."


class PricingAgent:
    def __init__(
        self,
        model: WarmStartPricingModel,
        memory: AgentMemory,
        learning_loop: LearningLoop,
        reward_config: RewardConfig = DEFAULT_REWARD_CONFIG,
        rng: Optional[np.random.Generator] = None,
        emit: Optional[Callable[[Dict], None]] = None,
        heartbeat_days: int = HEARTBEAT_DAYS,
    ):
        self.model = model
        self.memory = memory
        self.learning_loop = learning_loop
        self.reward_config = reward_config
        self.heartbeat_days = heartbeat_days
        self.bandit = BucketedBandit(model, rng=rng)
        self.memory.load_bandit(self.bandit)  # resume exploration progress across restarts
        self._emit = emit or (lambda rec: print(json.dumps(rec)))

    @property
    def model_version(self) -> str:
        return self.learning_loop.model_version

    def bucket_key(self, state: Dict) -> str:
        # normalise case so the same cohort from differently-cased data sources pools into
        # one posterior (e.g. "Electronics" and "electronics" are one bucket).
        category = str(state.get("category") or state.get("category_l1", "unknown")).lower()
        return BucketedBandit.bucket_key(category, _grade_key(state))

    # ── SENSE ─────────────────────────────────────────────────────────────
    def sense(self, state: Dict, event_type: str, payload: Dict, days_since_last_reprice: int) -> bool:
        """The trigger gate: act only on a significant event OR when the heartbeat is due.
        Most days this returns False — that's what keeps the price calm."""
        significant = event_type != "heartbeat" and is_significant(
            event_type,
            payload,
            float(state["comp_median_price"]),
            float(state["amazon_new_price"]),
            float(state.get("view_velocity_24h", 5) or 5),
        )
        heartbeat_due = days_since_last_reprice >= self.heartbeat_days
        return significant or heartbeat_due

    # ── THINK ─────────────────────────────────────────────────────────────
    def think(self, state: Dict, is_first_listing: bool) -> Dict:
        anchor = float(state["comp_median_price"])
        seller_floor = float(state["seller_floor"])
        route_elsewhere = float(state.get("route_elsewhere_value", 0) or 0)
        amazon_new = float(state["amazon_new_price"])
        current_price = float(state["current_price"])
        floor = max(seller_floor, route_elsewhere)
        ceiling = amazon_new * 0.95
        bkey = self.bucket_key(state)

        choice = self.bandit.decide(bkey, state, anchor, floor, ceiling)
        raw_price = anchor * choice["chosen_arm"]
        guard: GuardrailOutput = apply_guardrails(
            raw_price, current_price, seller_floor, route_elsewhere, amazon_new, is_first_listing
        )
        return {
            "bucket_key": bkey,
            "anchor": anchor,
            "current_price": current_price,
            "chosen_arm": choice["chosen_arm"],
            "predicted_rewards": choice["predicted_rewards"],
            "raw_price": raw_price,
            "final_price": guard.final_price,
            "floor": floor,
            "ceiling": ceiling,
            "should_reroute": guard.should_reroute,
            "guardrails": [g.rule for g in guard.guardrails_applied if g.triggered],
        }

    # ── ACT ───────────────────────────────────────────────────────────────
    @staticmethod
    def act(decision: Dict) -> str:
        if decision["should_reroute"]:
            return "reroute"
        if abs(decision["final_price"] - decision["current_price"]) < 1e-6:
            return "hold"
        return "reprice"

    # ── REFLECT ───────────────────────────────────────────────────────────
    def reflect(self, listing_id: str, state: Dict, event_type: str, decision: Dict, action: str) -> Dict:
        reason_code = reason_code_for(event_type)
        record = {
            "tag": "pricing.decide",
            "listing_id": listing_id,
            "event": event_type,
            "reason_code": reason_code,
            "bucket": decision["bucket_key"],
            "anchor": round(decision["anchor"]),
            "current_price": round(decision["current_price"]),
            "chosen_arm": decision["chosen_arm"],
            "predicted_rewards": {str(a): round(v) for a, v in decision["predicted_rewards"].items()},
            "raw_price": round(decision["raw_price"]),
            "final_price": round(decision["final_price"]),
            "floor": round(decision["floor"]),
            "ceiling": round(decision["ceiling"]),
            "should_reroute": decision["should_reroute"],
            "guardrails": decision["guardrails"],
            "action": action,
            "model_version": self.model_version,
            "reason": narrate(decision, action, reason_code),
        }
        self._emit(record)
        return record

    # ── LEARN ─────────────────────────────────────────────────────────────
    def learn(self, state: Dict, arm: float, outcome: Dict) -> float:
        """Close the loop: reward → bandit update → persist → maybe retrain + hot-swap."""
        reward = compute_reward(outcome, self.reward_config)
        bkey = self.bucket_key(state)
        self.bandit.update(bkey, arm, reward)
        self.memory.log_transaction(state, arm, reward, outcome)
        self.memory.save_bandit(self.bandit)

        self._emit(
            {
                "tag": "pricing.outcome",
                "listing_id": outcome.get("listingId"),
                "bucket": bkey,
                "arm": arm,
                "sold": bool(outcome.get("sold")),
                "rerouted": bool(outcome.get("rerouted")),
                "reroute_destination": outcome.get("rerouteDestination"),
                "final_price": round(float(outcome.get("finalPrice", 0) or 0)),
                "days_on_market": outcome.get("daysOnMarket"),
                "reward": round(reward, 2),
            }
        )

        promoted = self.learning_loop.maybe_retrain(self.model)
        if promoted is not None:
            self.model = promoted
            self.bandit.set_predictor(promoted)  # every bucket now scores with the new model
        return reward
