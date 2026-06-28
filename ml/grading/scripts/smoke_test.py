"""End-to-end smoke test on CPU with a handful of REAL ABO images + synthetic damage.
Proves the whole pipeline runs: download -> dataset -> train -> checkpoint -> eval ->
structured inference. Not a quality run (tiny data, 1 epoch) — a wiring proof.

  python scripts/smoke_test.py
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from reloop_grading.config import Config
from reloop_grading.train import train
from reloop_grading.evaluate import evaluate
from reloop_grading.inference import GradingInference
from reloop_grading.registry import load_checkpoint


def main() -> None:
    cfg = Config()
    # tiny + fast
    cfg.data.use_sources = ("abo", "synthetic")
    cfg.data.abo_samples = 12
    cfg.data.synthetic_per_clean = 2
    cfg.data.val_fraction = 0.3
    cfg.train.epochs = 1
    cfg.train.batch_size = 6
    cfg.train.warmup_frozen_epochs = 1
    cfg.train.device = "cpu"
    cfg.train.out_dir = "runs/smoke"
    cfg.backbone.unfreeze_last_n_blocks = 0

    print("=== [1/4] TRAIN ===")
    ckpt = train(cfg, data_root=None)

    print("\n=== [2/4] LOAD CHECKPOINT ===")
    model, loaded_cfg = load_checkpoint(ckpt, "cpu")
    print(f"loaded model_version={model.model_version} temp={float(model.temperature):.3f}")

    print("\n=== [3/4] EVALUATE ===")
    report = evaluate(model, loaded_cfg, data_root=None, device="cpu")
    print(json.dumps(report, indent=2))

    print("\n=== [4/4] STRUCTURED INFERENCE (single image + reference diff) ===")
    # grab two cached ABO images to act as 'returned' and 'original'
    abo_dir = os.path.join(cfg.data.cache_dir, "abo")
    imgs = sorted([os.path.join(abo_dir, f) for f in os.listdir(abo_dir) if f.endswith(".jpg")])
    inf = GradingInference(model, "cpu")
    print("single-image:", json.dumps(inf.grade_json(imgs[0]), indent=2))
    if len(imgs) >= 2:
        print("with-reference:", json.dumps(inf.grade_json(imgs[1], original=imgs[0]), indent=2))

    print("\nSMOKE TEST OK ✅")


if __name__ == "__main__":
    main()
