"""XGBoost warm-start reward model.

Predicts E[reward | features, price_arm]. At decision time we run it once per arm and
compare — the bandit then adds exploration on top. Static once trained; it gets smarter
only by being RETRAINED on more data (~every 500 real transactions). This is the whole
"learning loop": supervised learning over a growing dataset, honestly told. No RL.

The model carries its own label encoders, so ``predict_arm_rewards(state)`` needs only
the raw state dict — features are rebuilt through the ONE source of truth
(``build_feature_vector``), so training and inference can't drift.
"""

from __future__ import annotations

import json
import os
import pickle
from typing import Dict, List, Optional

import numpy as np

from ..data.features import FEATURE_NAMES, build_feature_vector

ARMS = [0.78, 0.85, 0.92, 1.00, 1.10]

DATA_SOURCE_LABEL = (
    "Mercari Price Suggestion + eBay Electronics (reward simulated from sale prices via "
    "a demand curve — real production accuracy requires ReLoop transaction logs)"
)


class WarmStartPricingModel:
    def __init__(self) -> None:
        self.model = None
        self.encoders: Optional[Dict] = None
        self.model_version: Optional[str] = None

    def train(self, X_train, y_train, X_val, y_val) -> dict:
        import xgboost as xgb
        from sklearn.metrics import mean_absolute_error

        self.model = xgb.XGBRegressor(
            n_estimators=500,
            max_depth=7,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            min_child_weight=5,
            reg_alpha=0.1,
            reg_lambda=1.0,
            tree_method="hist",
            early_stopping_rounds=50,
            eval_metric="mae",
            random_state=42,
        )
        self.model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)

        val_preds = self.model.predict(X_val)
        mae = float(mean_absolute_error(y_val, val_preds))
        mape = float(np.mean(np.abs((y_val - val_preds) / (np.abs(y_val) + 1e-9))) * 100)

        importance = self._shap_importance(X_val)

        results = {
            "val_mae": mae,
            "val_mape": mape,
            "best_iteration": int(getattr(self.model, "best_iteration", 0) or 0),
            "top_10_features": [(n, float(v)) for n, v in importance[:10]],
            "data_source": DATA_SOURCE_LABEL,
        }

        print("\n=== WarmStart XGBoost Results ===")
        print(f"Val MAE:  {mae:.4f}")
        print(f"Val MAPE: {mape:.1f}%")
        print("\nTop features (SHAP):")
        for name, imp in importance[:10]:
            print(f"  {name:<28} {imp:.4f}")
        return results

    def _shap_importance(self, X_val) -> List:
        """Mean |SHAP| per feature — the defensible 'why'. Falls back to XGBoost gain
        importance if SHAP isn't available."""
        try:
            import shap

            sample = X_val[:500]
            explainer = shap.TreeExplainer(self.model)
            shap_values = explainer.shap_values(sample)
            mean_abs = np.abs(shap_values).mean(axis=0)
        except Exception as exc:  # pragma: no cover - SHAP optional
            print(f"(SHAP unavailable: {exc} — using XGBoost gain importance)")
            mean_abs = self.model.feature_importances_
        return sorted(zip(FEATURE_NAMES, mean_abs), key=lambda x: x[1], reverse=True)

    def predict_arm_rewards(
        self, state: Dict, arms: Optional[List[float]] = None
    ) -> Dict[float, float]:
        """Predicted reward for each arm, given the raw state dict. Uses the shared
        feature builder so the per-arm features are exactly what training saw."""
        arms = arms or ARMS
        X = np.asarray(
            [build_feature_vector(state, arm=arm, encoders=self.encoders) for arm in arms],
            dtype=np.float32,
        )
        preds = self.model.predict(X)
        return {arm: float(p) for arm, p in zip(arms, preds)}

    def predict_batch(self, X) -> np.ndarray:
        return self.model.predict(X)

    def save(self, path: str, version: str) -> None:
        os.makedirs(path, exist_ok=True)
        self.model_version = version
        self.model.save_model(f"{path}/xgboost_model.json")
        if self.encoders is not None:
            with open(f"{path}/encoders.pkl", "wb") as f:
                pickle.dump(self.encoders, f)
        with open(f"{path}/metadata.json", "w") as f:
            json.dump({"model_version": version, "type": "xgboost_warmstart"}, f)
        print(f"Saved model {version} → {path}")

    @classmethod
    def load(cls, path: str) -> "WarmStartPricingModel":
        import xgboost as xgb

        m = cls()
        m.model = xgb.XGBRegressor()
        m.model.load_model(f"{path}/xgboost_model.json")
        enc_path = f"{path}/encoders.pkl"
        if os.path.exists(enc_path):
            with open(enc_path, "rb") as f:
                m.encoders = pickle.load(f)
        with open(f"{path}/metadata.json") as f:
            m.model_version = json.load(f)["model_version"]
        return m
