"""Agent memory — everything that must survive a restart so learning can compound.

An autonomous agent is only "learning" if its experience persists. Two file-backed parts:

  • transactions   — the (state, arm, reward, outcome) log. THIS is the training data for
                     the next retrain; every terminal outcome becomes one supervised row.
  • bandit posteriors — per-bucket arm_observations, i.e. how much exploration each
                     (category × grade) cohort has already spent.

JSONL + JSON on disk today (``runs/agent/…``); the same shapes stream trivially to S3 /
DynamoDB in production. Nothing here is in-memory-only — restart the process and the agent
resumes with its exploration and its dataset intact.
"""

from __future__ import annotations

import json
import os
from typing import Dict

from .bandit import BucketedBandit
from .logger import TransactionLogger


class AgentMemory:
    def __init__(self, root: str):
        self.root = root
        os.makedirs(root, exist_ok=True)
        self.transactions = TransactionLogger(os.path.join(root, "transactions.jsonl"))
        self._bandit_path = os.path.join(root, "bandit_state.json")

    # ── experience log (next-retrain dataset) ──────────────────────────────
    def log_transaction(self, state: Dict, arm: float, reward: float, outcome: Dict) -> None:
        self.transactions.log(state, arm, reward, outcome)

    def transaction_count(self) -> int:
        return len(self.transactions)

    # ── bandit posteriors (exploration progress) ───────────────────────────
    def save_bandit(self, bandit: BucketedBandit) -> None:
        with open(self._bandit_path, "w") as f:
            json.dump(bandit.state_dict(), f)

    def load_bandit(self, bandit: BucketedBandit) -> None:
        if os.path.exists(self._bandit_path):
            with open(self._bandit_path) as f:
                bandit.load_state_dict(json.load(f))
