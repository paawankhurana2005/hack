"""Unified dataset builder: Mercari + eBay → (features_with_arm → simulated reward).

We have no real ReLoop reprice logs yet, so we WARM-START: each catalogue row's
observed sale price is treated as its true clearing price, and for each of the 5 price
arms we simulate the reward a logistic demand curve would have produced. That yields
``rows × 5`` training examples teaching XGBoost the shape of "price arm → reward" before
a single real transaction. Once real outcomes accumulate, they replace these rows.

Run a demo on a synthetic sample (no Kaggle download needed):
    python -m reloop_pricing.data.pipeline --sample 1000
With real files:
    python -m reloop_pricing.data.pipeline --mercari train.tsv --ebay ebay.csv --output runs/v1
"""

from __future__ import annotations

import argparse
import os
import pickle
from typing import Dict, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

from .ebay import load_ebay, synthetic_ebay
from .features import FEATURE_DIM, build_feature_vector
from .mercari import load_mercari, synthetic_mercari

# Price arms — must match packages/shared/src/pricing/arms.ts (single source of truth).
ARMS = [0.78, 0.85, 0.92, 1.00, 1.10]
HANDLING_COST = 120.0


def build_encoders(df: pd.DataFrame) -> Dict[str, LabelEncoder]:
    """Fit label encoders for the categorical columns (shared by every model)."""
    encoders: Dict[str, LabelEncoder] = {}
    for col in ["category_l1", "category_l2", "brand"]:
        le = LabelEncoder()
        le.fit(df[col].astype(str).fillna("unknown"))
        encoders[col] = le
    return encoders


def _simulate_arm_reward(true_price: float, comp_median: float, arm: float, rng: np.random.Generator) -> float:
    """Logistic demand curve: P(sale) falls as the candidate price rises above the
    item's true clearing price; reward = P(sale) × (margin − holding cost)."""
    candidate = comp_median * arm
    price_ratio = candidate / (true_price + 1e-9)
    p_sale = 1.0 / (1.0 + np.exp(8 * (price_ratio - 1.0)))
    holding_cost = 8 * int(rng.integers(1, 15))  # random days on market × ₹8/day
    margin = candidate - HANDLING_COST
    return float(p_sale * (margin - holding_cost))


def build_training_dataset(
    df: pd.DataFrame,
    output_dir: Optional[str] = None,
    seed: int = 42,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, Dict[str, LabelEncoder]]:
    """Expand each catalogue row into 5 (features_with_arm → reward) examples."""
    df = df.dropna(subset=["price"]).reset_index(drop=True)
    encoders = build_encoders(df)
    rng = np.random.default_rng(seed)

    X_rows, y_rows = [], []
    for _, row in df.iterrows():
        true_price = float(row["price"])
        comp_median = true_price / 0.92  # assume true price ≈ comp median × 0.92 arm

        row_dict = row.to_dict()
        row_dict["comp_median_price"] = comp_median
        row_dict["original_price"] = comp_median * 1.4
        row_dict["current_price"] = true_price
        row_dict["floor"] = max(true_price * 0.3, 50)

        for arm in ARMS:
            feat = build_feature_vector(row_dict, arm=arm, encoders=encoders)
            X_rows.append(feat)
            y_rows.append(_simulate_arm_reward(true_price, comp_median, arm, rng))

    X = np.asarray(X_rows, dtype=np.float32)
    y = np.asarray(y_rows, dtype=np.float32)
    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=seed)

    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
        np.save(f"{output_dir}/X_train.npy", X_train)
        np.save(f"{output_dir}/X_val.npy", X_val)
        np.save(f"{output_dir}/y_train.npy", y_train)
        np.save(f"{output_dir}/y_val.npy", y_val)
        with open(f"{output_dir}/encoders.pkl", "wb") as f:
            pickle.dump(encoders, f)

    return X_train, X_val, y_train, y_val, encoders


def assemble_catalogue(
    mercari_path: Optional[str],
    ebay_path: Optional[str],
    sample: int,
    seed: int = 42,
) -> pd.DataFrame:
    """Load real files when given, else synthesise a `sample`-row catalogue split
    evenly between the two sources."""
    if mercari_path and ebay_path:
        mercari, ebay = load_mercari(mercari_path), load_ebay(ebay_path)
        label = "REAL Mercari + eBay"
    else:
        half = sample // 2
        mercari = synthetic_mercari(half, seed=seed)
        ebay = synthetic_ebay(sample - half, seed=seed + 1)
        label = "SYNTHETIC (schema-faithful) Mercari + eBay"
    df = pd.concat([mercari, ebay], axis=0, ignore_index=True)
    df.attrs["source_label"] = label
    return df


def _print_stats(df: pd.DataFrame, X_train, X_val, y_train, y_val) -> None:
    print("\n=== Phase 1 — Dataset Stats ===")
    print(f"Source            : {df.attrs.get('source_label', 'unknown')}")
    print(f"Catalogue rows    : {len(df):,}")
    print("By source         : " + ", ".join(f"{k}={v}" for k, v in df["source"].value_counts().items()))
    print(f"Arms per row      : {len(ARMS)}  →  training examples = rows × arms")
    print(f"Feature dim       : {X_train.shape[1]} (expected {FEATURE_DIM})")
    print(f"Train / Val rows  : {X_train.shape[0]:,} / {X_val.shape[0]:,}")
    print(
        "Reward (y)        : "
        f"mean={np.mean(y_train):.1f}  std={np.std(y_train):.1f}  "
        f"min={np.min(y_train):.1f}  max={np.max(y_train):.1f}"
    )
    grade_counts = df["grade_ordinal"].astype(int).value_counts().sort_index()
    print("Grade ordinal     : " + ", ".join(f"{g}:{c}" for g, c in grade_counts.items()) + "  (5=new … 1=poor)")
    print("Top categories    : " + ", ".join(f"{c}({n})" for c, n in df["category_l1"].value_counts().head(4).items()))
    print(f"Price ₹           : median={df['price'].median():.0f}  p90={df['price'].quantile(0.9):.0f}")
    print("\nNOTE: reward is SIMULATED from sale prices via a demand curve — real")
    print("production accuracy requires ReLoop reprice transaction logs.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the dynamic-pricing training set.")
    parser.add_argument("--mercari", default=None, help="path to Kaggle Mercari train.tsv")
    parser.add_argument("--ebay", default=None, help="path to eBay electronics CSV")
    parser.add_argument("--sample", type=int, default=1000, help="synthetic rows when no real files")
    parser.add_argument("--output", default=None, help="dir to save X/y .npy + encoders")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    df = assemble_catalogue(args.mercari, args.ebay, args.sample, seed=args.seed)
    X_train, X_val, y_train, y_val, _ = build_training_dataset(df, output_dir=args.output, seed=args.seed)
    _print_stats(df, X_train, X_val, y_train, y_val)
    if args.output:
        print(f"\nSaved arrays + encoders to {args.output}/")


if __name__ == "__main__":
    main()
