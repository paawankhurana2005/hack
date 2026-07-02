"""The closed learning loop — the piece that makes this an autonomous agent, not a static
model. Wires three things that already existed but were never connected:

    logger.ready_to_retrain(500)  →  retrain_from_logger()  →  offline_policy_evaluation()

`retrain_from_logger` rebuilds a training set by BLENDING the synthetic warm-start backbone
(the demand-curve prior) with the REAL logged (state, arm, reward) rows the agent gathered,
trains a candidate XGBoost, and only returns "promote" if the candidate beats the current
model by >2% on an offline replay of the real rows. `LearningLoop.maybe_retrain` fires this
on a cadence and hot-swaps the live model on promotion. No RL — supervised learning over a
growing dataset, gated by a measured offline win. That is the honest "it gets smarter."
"""

from __future__ import annotations

import json
import os
from typing import Callable, Dict, List, Optional, Tuple

import numpy as np

from ..data.features import build_feature_vector
from ..data.pipeline import assemble_catalogue, build_training_dataset
from .evaluate import offline_policy_evaluation
from .warmstart import WarmStartPricingModel

RETRAIN_EVERY = 500  # fresh logged rows between retrains (spec 014)


def retrain_from_logger(
    logged_rows: List[Dict],
    current_model: WarmStartPricingModel,
    seed: int = 42,
    backbone_sample: int = 2000,
) -> Tuple[WarmStartPricingModel, Dict, bool]:
    """Train a candidate on (synthetic backbone + real logged rows) and gate it offline.

    Returns (candidate_model, eval_result, promoted). The candidate is trained regardless;
    `promoted` reflects whether it cleared the >2% offline-policy-evaluation gate.
    """
    # 1. synthetic backbone — the demand-curve prior, so a retrain never forgets the shape
    df = assemble_catalogue(None, None, backbone_sample, seed=seed)
    X_tr, X_val, y_tr, y_val, encoders = build_training_dataset(df, seed=seed)

    # 2. real logged experience — the correction toward the true market
    real_X, real_y, logged_tuples = [], [], []
    for row in logged_rows:
        state, arm, reward = row["state"], float(row["arm"]), float(row["reward"])
        real_X.append(build_feature_vector(state, arm=arm, encoders=encoders))
        real_y.append(reward)
        logged_tuples.append({"state": state, "arm": arm, "reward": reward})

    if real_X:
        real_X_arr = np.asarray(real_X, dtype=np.float32)
        real_y_arr = np.asarray(real_y, dtype=np.float32)
        # upweight the real rows (replication) so the true signal isn't diluted by the
        # much larger synthetic backbone — target ≈ half the training set.
        rep = max(1, int(len(X_tr) * 0.5 / len(real_X)))
        X_tr = np.concatenate([X_tr, np.tile(real_X_arr, (rep, 1))], axis=0)
        y_tr = np.concatenate([y_tr, np.tile(real_y_arr, rep)], axis=0)

    # 3. train the candidate
    candidate = WarmStartPricingModel()
    candidate.encoders = encoders
    candidate.train(X_tr, y_tr, X_val, y_val)

    # 4. offline gate — replay the real rows through candidate vs current
    if logged_tuples:
        eval_result = offline_policy_evaluation(logged_tuples, candidate, current_model)
    else:
        eval_result = {
            "candidate_revenue": 0.0,
            "current_revenue": 0.0,
            "improvement_pct": 0.0,
            "promote": False,
            "n_evaluated": 0,
        }
    return candidate, eval_result, bool(eval_result.get("promote"))


class LearningLoop:
    """Owns the retrain cadence + model versioning. The agent holds one of these and calls
    `maybe_retrain(current_model)` after every logged outcome; on a promoted retrain it
    returns the new model so the agent can hot-swap it into the reward predictor + bandit."""

    def __init__(
        self,
        memory,
        model_root: str = "runs/warmstart",
        retrain_every: int = RETRAIN_EVERY,
        seed: int = 42,
        backbone_sample: int = 2000,
        log: Callable[[str], None] = print,
        start_version: int = 1,
    ):
        self.memory = memory
        self.model_root = model_root
        self.retrain_every = retrain_every
        self.seed = seed
        self.backbone_sample = backbone_sample
        self._log = log
        self.version_num = start_version
        self._last_retrain_count = 0
        self.retrain_events: List[Dict] = []

    @property
    def model_version(self) -> str:
        return f"v{self.version_num}"

    def maybe_retrain(self, current_model: WarmStartPricingModel) -> Optional[WarmStartPricingModel]:
        n = self.memory.transaction_count()
        if n - self._last_retrain_count < self.retrain_every:
            return None
        self._last_retrain_count = n

        candidate, eval_result, promoted = retrain_from_logger(
            self.memory.transactions.read(),
            current_model,
            seed=self.seed,
            backbone_sample=self.backbone_sample,
        )

        promoted_version: Optional[str] = None
        if promoted:
            self.version_num += 1
            promoted_version = self.model_version
            path = os.path.join(self.model_root, promoted_version)
            candidate.save(path, promoted_version)
            self._update_current_pointer(promoted_version, path)

        event = {
            "tag": "pricing.retrain",
            "trigger_rows": n,
            "candidate_value": round(float(eval_result["candidate_revenue"]), 2),
            "current_value": round(float(eval_result["current_revenue"]), 2),
            "improvement_pct": round(float(eval_result["improvement_pct"]), 2),
            "gate_pct": 2.0,
            "promote": promoted,
            "new_version": promoted_version,
        }
        self._log(json.dumps(event))
        self.retrain_events.append(event)
        return candidate if promoted else None

    def _update_current_pointer(self, version: str, path: str) -> None:
        os.makedirs(self.model_root, exist_ok=True)
        with open(os.path.join(self.model_root, "CURRENT"), "w") as f:
            json.dump({"version": version, "path": path}, f)
