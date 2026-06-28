"""Evaluation harness. Reports exactly what the spec asks for:

  - Grade accuracy
  - Macro F1 (grade)
  - Defect F1 (multi-label)
  - Confusion matrix (grade)
  - Confidence calibration (ECE) + post-hoc temperature fit
  - Cosine-similarity distribution: same-product-damaged vs different-product

Metrics are implemented in-module (numpy only) so eval runs without sklearn; if
sklearn is installed the numbers agree. Writes a JSON report.

Run:  python -m reloop_grading.evaluate --checkpoint runs/grading/grading_model.pt
"""
from __future__ import annotations

import argparse
import json
from typing import Optional

import torch
from torch.utils.data import DataLoader

from .config import Config
from .schema import GRADES, DEFECTS, NUM_GRADES, NUM_DEFECTS
from .model import GradingModel
from .data.dataset import build_datasets


# --- metric primitives -------------------------------------------------------
def _macro_f1(cm: list[list[int]], n: int) -> float:
    f1s = []
    for c in range(n):
        tp = cm[c][c]
        fp = sum(cm[r][c] for r in range(n)) - tp
        fn = sum(cm[c][k] for k in range(n)) - tp
        prec = tp / (tp + fp) if (tp + fp) else 0.0
        rec = tp / (tp + fn) if (tp + fn) else 0.0
        f1s.append(2 * prec * rec / (prec + rec) if (prec + rec) else 0.0)
    return sum(f1s) / max(1, len(f1s))


def _multilabel_f1(tp: int, fp: int, fn: int) -> float:
    prec = tp / (tp + fp) if (tp + fp) else 0.0
    rec = tp / (tp + fn) if (tp + fn) else 0.0
    return 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0


def _ece(confs: list[float], correct: list[int], bins: int = 10) -> float:
    if not confs:
        return 0.0
    n = len(confs)
    ece = 0.0
    for b in range(bins):
        lo, hi = b / bins, (b + 1) / bins
        idx = [i for i, c in enumerate(confs) if (c > lo and c <= hi) or (b == 0 and c <= hi)]
        if not idx:
            continue
        acc = sum(correct[i] for i in idx) / len(idx)
        conf = sum(confs[i] for i in idx) / len(idx)
        ece += (len(idx) / n) * abs(acc - conf)
    return ece


# --- main eval ---------------------------------------------------------------
@torch.no_grad()
def evaluate(model: GradingModel, cfg: Config, data_root: Optional[str] = None,
             device: str = "cpu") -> dict:
    model.to(device).eval()
    _, val_ds, _, stats = build_datasets(cfg, data_root)
    loader = DataLoader(val_ds, batch_size=cfg.train.batch_size)

    cm = [[0] * NUM_GRADES for _ in range(NUM_GRADES)]
    grade_correct = grade_total = 0
    d_tp = d_fp = d_fn = 0
    all_logits, all_grade_labels, all_grade_mask = [], [], []

    for batch in loader:
        out = model(batch["pixel_values"].to(device))
        logits = out["grade_logits"].cpu()
        all_logits.append(logits)
        all_grade_labels.append(batch["grade_idx"])
        all_grade_mask.append(batch["has_grade"])

        preds = logits.argmax(dim=-1)
        for i in range(preds.shape[0]):
            if batch["has_grade"][i].item() > 0.5:
                t = int(batch["grade_idx"][i].item()); p = int(preds[i].item())
                cm[t][p] += 1
                grade_total += 1
                grade_correct += int(t == p)

        pres = (torch.sigmoid(out["defect_presence_logits"]).cpu() >= 0.5).int()
        gt = (batch["defect_presence"] >= 0.5).int()
        for i in range(pres.shape[0]):
            if batch["has_defect"][i].item() > 0.5:
                for k in range(NUM_DEFECTS):
                    pv, gv = int(pres[i, k]), int(gt[i, k])
                    d_tp += int(pv == 1 and gv == 1)
                    d_fp += int(pv == 1 and gv == 0)
                    d_fn += int(pv == 0 and gv == 1)

    # calibration + temperature fit
    logits = torch.cat(all_logits) if all_logits else torch.zeros(0, NUM_GRADES)
    labels = torch.cat(all_grade_labels) if all_grade_labels else torch.zeros(0, dtype=torch.long)
    mask = torch.cat(all_grade_mask) if all_grade_mask else torch.zeros(0)
    best_T, best_ece, raw_ece = _fit_temperature(logits, labels, mask)
    model.temperature = torch.tensor(float(best_T))

    report = {
        "dataset": stats,
        "grade_accuracy": round(grade_correct / grade_total, 4) if grade_total else None,
        "grade_macro_f1": round(_macro_f1(cm, NUM_GRADES), 4),
        "defect_f1": round(_multilabel_f1(d_tp, d_fp, d_fn), 4),
        "confusion_matrix": {"labels": list(GRADES), "matrix": cm},
        "calibration": {
            "ece_raw": round(raw_ece, 4),
            "ece_calibrated": round(best_ece, 4),
            "fitted_temperature": round(best_T, 3),
        },
        "similarity_distribution": _similarity_distribution(model, cfg, device),
        "model_version": model.model_version,
    }
    return report


def _fit_temperature(logits, labels, mask, grid=None):
    if logits.shape[0] == 0:
        return 1.0, 0.0, 0.0
    grid = grid or [round(0.5 + 0.1 * i, 2) for i in range(26)]  # 0.5..3.0
    idx = [i for i in range(logits.shape[0]) if mask[i].item() > 0.5]
    if not idx:
        return 1.0, 0.0, 0.0

    def ece_at(T):
        confs, correct = [], []
        for i in idx:
            p = torch.softmax(logits[i] / T, dim=-1)
            confs.append(p.max().item())
            correct.append(int(p.argmax().item() == int(labels[i].item())))
        return _ece(confs, correct)

    raw = ece_at(1.0)
    best_T, best = 1.0, raw
    for T in grid:
        e = ece_at(T)
        if e < best:
            best, best_T = e, T
    return best_T, best, raw


@torch.no_grad()
def _similarity_distribution(model: GradingModel, cfg: Config, device: str, n: int = 24) -> dict:
    """Cosine similarity in DINOv2 space for: same product but damaged (should stay
    high-ish) vs different products (baseline). Validates the embedding comparator."""
    from PIL import Image
    from .data.adapters import abo_samples
    from .data.synthetic import DamageGenerator
    from .data.dataset import build_transform

    tf = build_transform(cfg.backbone.image_size, train=False)
    clean = abo_samples(cfg.data)[:n]
    if len(clean) < 2:
        return {"note": "insufficient clean images"}
    gen = DamageGenerator(base_seed=123)

    def emb(img):
        return model.embed(tf(img).unsqueeze(0).to(device)).flatten().float()

    same_dmg, diff = [], []
    embs_clean = []
    for i, s in enumerate(clean):
        try:
            ci = Image.open(s.image_path).convert("RGB")
        except Exception:
            continue
        ec = emb(ci)
        embs_clean.append(ec)
        di = gen.generate(ci, i).image
        ed = emb(di)
        same_dmg.append(torch.nn.functional.cosine_similarity(ec, ed, dim=0).item())
    for i in range(len(embs_clean)):
        for j in range(i + 1, len(embs_clean)):
            diff.append(torch.nn.functional.cosine_similarity(embs_clean[i], embs_clean[j], dim=0).item())

    def stats(xs):
        if not xs:
            return None
        xs = sorted(xs)
        return {"mean": round(sum(xs) / len(xs), 4), "min": round(xs[0], 4), "max": round(xs[-1], 4), "n": len(xs)}

    return {"same_product_damaged": stats(same_dmg), "different_products": stats(diff)}


@torch.no_grad()
def evaluate_from_cache(model: GradingModel, cache: dict, device: str = "cpu",
                        do_similarity: bool = True) -> dict:
    """Same metrics as evaluate(), but runs the heads over CACHED val embeddings —
    no backbone forward over images, so it's instant during local iteration."""
    model.to(device).eval()
    from .embedding_cache import CachedHeadDataset
    val = CachedHeadDataset(cache["val"])
    loader = DataLoader(val, batch_size=64)

    cm = [[0] * NUM_GRADES for _ in range(NUM_GRADES)]
    grade_correct = grade_total = 0
    d_tp = d_fp = d_fn = 0
    all_logits, all_labels, all_mask = [], [], []

    for batch in loader:
        out = model.heads_from_embedding(batch["embedding"].to(device))
        logits = out["grade_logits"].cpu()
        all_logits.append(logits); all_labels.append(batch["grade_idx"]); all_mask.append(batch["has_grade"])
        preds = logits.argmax(dim=-1)
        for i in range(preds.shape[0]):
            if batch["has_grade"][i].item() > 0.5:
                t = int(batch["grade_idx"][i]); p = int(preds[i])
                cm[t][p] += 1; grade_total += 1; grade_correct += int(t == p)
        pres = (torch.sigmoid(out["defect_presence_logits"]).cpu() >= 0.5).int()
        gt = (batch["defect_presence"] >= 0.5).int()
        for i in range(pres.shape[0]):
            if batch["has_defect"][i].item() > 0.5:
                for k in range(NUM_DEFECTS):
                    pv, gv = int(pres[i, k]), int(gt[i, k])
                    d_tp += int(pv == 1 and gv == 1); d_fp += int(pv == 1 and gv == 0); d_fn += int(pv == 0 and gv == 1)

    logits = torch.cat(all_logits) if all_logits else torch.zeros(0, NUM_GRADES)
    labels = torch.cat(all_labels) if all_labels else torch.zeros(0, dtype=torch.long)
    mask = torch.cat(all_mask) if all_mask else torch.zeros(0)
    best_T, best_ece, raw_ece = _fit_temperature(logits, labels, mask)
    model.temperature = torch.tensor(float(best_T))

    cfg = Config.from_dict(cache["config"])
    return {
        "dataset": cache.get("stats"),
        "grade_accuracy": round(grade_correct / grade_total, 4) if grade_total else None,
        "grade_macro_f1": round(_macro_f1(cm, NUM_GRADES), 4),
        "defect_f1": round(_multilabel_f1(d_tp, d_fp, d_fn), 4),
        "confusion_matrix": {"labels": list(GRADES), "matrix": cm},
        "calibration": {"ece_raw": round(raw_ece, 4), "ece_calibrated": round(best_ece, 4),
                        "fitted_temperature": round(best_T, 3)},
        "similarity_distribution": _similarity_distribution(model, cfg, device) if do_similarity else "skipped",
        "model_version": model.model_version,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--data-root", default=None)
    ap.add_argument("--out", default="eval_report.json")
    ap.add_argument("--device", default="cpu")
    args = ap.parse_args()
    from .registry import load_checkpoint
    model, cfg = load_checkpoint(args.checkpoint, args.device)
    report = evaluate(model, cfg, args.data_root, args.device)
    with open(args.out, "w") as f:
        json.dump(report, f, indent=2)
    print(json.dumps(report, indent=2))
    print(f"\n[evaluate] wrote {args.out}")


if __name__ == "__main__":
    main()
