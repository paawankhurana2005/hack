"""Transaction logger — the (state, arm, reward, outcome) tuples. THIS log is the
training data for the next retrain: every reprice decision + its outcome becomes one
supervised row. At ~500 new rows we retrain XGBoost and the knowledge compounds.

Stored as JSONL (append-only, one tuple per line) — trivially streamed to S3/DynamoDB
in production.
"""

from __future__ import annotations

import json
import os
from typing import Dict, Iterator, List


class TransactionLogger:
    def __init__(self, path: str):
        self.path = path
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)

    def log(self, state: Dict, arm: float, reward: float, outcome: Dict) -> None:
        row = {"state": state, "arm": arm, "reward": reward, "outcome": outcome}
        with open(self.path, "a") as f:
            f.write(json.dumps(row) + "\n")

    def read(self) -> List[Dict]:
        if not os.path.exists(self.path):
            return []
        with open(self.path) as f:
            return [json.loads(line) for line in f if line.strip()]

    def __iter__(self) -> Iterator[Dict]:
        return iter(self.read())

    def __len__(self) -> int:
        return len(self.read())

    def ready_to_retrain(self, every: int = 500) -> bool:
        """The compounding loop: retrain once this many fresh rows have accrued."""
        return len(self) >= every
