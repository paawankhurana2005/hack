"""Train the XGBoost warm-start reward model.

    python -m reloop_pricing.pricing.train_warmstart --sample 4000 --output runs/warmstart/v1
    python -m reloop_pricing.pricing.train_warmstart --mercari train.tsv --ebay ebay.csv --output runs/warmstart/v1

Saves the model + encoders + eval_results.json (MAE / MAPE / SHAP top-10) with the
honest synthetic-data label.
"""

from __future__ import annotations

import argparse
import json
import os

from ..data.pipeline import assemble_catalogue, build_encoders, build_training_dataset
from .warmstart import WarmStartPricingModel


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mercari", default=None)
    parser.add_argument("--ebay", default=None)
    parser.add_argument("--sample", type=int, default=4000, help="synthetic catalogue rows")
    parser.add_argument("--output", default="runs/warmstart/v1")
    parser.add_argument("--version", default="v1.0.0")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    print("Building training dataset...")
    df = assemble_catalogue(args.mercari, args.ebay, args.sample, seed=args.seed)
    X_train, X_val, y_train, y_val, encoders = build_training_dataset(df, seed=args.seed)
    print(f"  source={df.attrs.get('source_label')}  train={X_train.shape}  val={X_val.shape}")

    print("\nTraining XGBoost warm-start model...")
    model = WarmStartPricingModel()
    model.encoders = encoders
    results = model.train(X_train, y_train, X_val, y_val)
    model.save(args.output, args.version)

    results.update(
        {
            "model_version": args.version,
            "type": "xgboost_warmstart",
            "train_rows": int(X_train.shape[0]),
            "val_rows": int(X_val.shape[0]),
            "feature_dim": int(X_train.shape[1]),
            "catalogue_rows": int(len(df)),
            "source": df.attrs.get("source_label"),
            "promotion_gate": "offline_policy_evaluation > 2% improvement before promoting a retrain",
        }
    )
    os.makedirs(args.output, exist_ok=True)
    with open(f"{args.output}/eval_results.json", "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nResults → {args.output}/eval_results.json")
    print("\n=== HONEST LABEL FOR PITCH ===")
    print("MAE/MAPE measured on a synthetic simulation of Mercari + eBay data.")
    print("Real production accuracy requires ReLoop reprice transaction logs.")


if __name__ == "__main__":
    main()
