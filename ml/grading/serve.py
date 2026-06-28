"""Tiny HTTP inference server that puts the trained grader behind the SAME contract
the API's VlmProvider expects, so the app's Sell/Return flow + health card can run on
OUR model instead of the hosted VLM.

POST /assess  { "imageBase64": "<jpeg b64, no data: prefix>" }
  -> { grade, confidence, detectedIssues, structuredIssues:[{type,severity,region}],
       photoQuality, summary }   (== VlmAssessment in apps/api)

Run:
  GRADING_CKPT=~/Downloads/grading_model.pt python -m flask --app serve run --port 8000
  # or:  GRADING_CKPT=~/Downloads/grading_model.pt python serve.py
"""
from __future__ import annotations

import base64
import io
import os

import torch
from flask import Flask, jsonify, request
from PIL import Image

from reloop_grading.registry import load_checkpoint
from reloop_grading.inference import GradingInference
from reloop_grading.schema import severity_to_label, GRADE_LABELS, GradingOutput

CKPT = os.path.expanduser(os.environ.get("GRADING_CKPT", "~/Downloads/grading_model.pt"))
DEVICE = os.environ.get("GRADING_DEVICE", "cpu")  # cpu is reliable for single-image latency

print(f"[serve] loading checkpoint {CKPT} on {DEVICE} ...")
_model, _cfg = load_checkpoint(CKPT, DEVICE)
_inf = GradingInference(_model, DEVICE)
print(f"[serve] ready — model_version={_model.model_version}")

app = Flask(__name__)


def _summary(out: GradingOutput) -> str:
    label = GRADE_LABELS[out.grade]
    if not out.defects:
        # Don't claim "no defects" when the grade itself says the item is worn — that
        # self-contradiction ("Fair / no visible defects") is exactly what looked broken.
        if out.grade in ("new", "like-new"):
            return f"Graded {label} — no visible defects detected (own model)."
        return (f"Graded {label} — overall condition consistent with general wear; "
                f"no single defect localized (own model).")
    worst = out.defects[0]
    types = ", ".join(d.type.replace("_", " ") for d in out.defects[:3])
    return f"Graded {label} — {len(out.defects)} issue(s): {types} (worst: {severity_to_label(worst.severity)})."


@app.get("/health")
def health():
    return jsonify({"status": "ok", "model_version": _model.model_version, "device": DEVICE})


@app.post("/assess")
def assess():
    data = request.get_json(force=True, silent=True) or {}
    b64 = data.get("imageBase64")
    if not b64:
        return jsonify({"error": "missing imageBase64"}), 400
    try:
        img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
    except Exception as e:
        return jsonify({"error": f"bad image: {e}"}), 400

    # optional reference image (original catalog photo) → enables the diff/similarity
    ref_b64 = data.get("referenceBase64")
    if ref_b64:
        try:
            ref = Image.open(io.BytesIO(base64.b64decode(ref_b64))).convert("RGB")
            out = _inf.grade_with_reference(img, ref)
        except Exception:
            out = _inf.grade(img)
    else:
        out = _inf.grade(img)

    structured = [
        {"type": d.type, "severity": severity_to_label(d.severity), "region": "overall"}
        for d in out.defects
    ]
    resp = {
        "grade": out.grade,                       # ConditionGrade key (new..poor)
        "confidence": round(float(out.confidence), 4),
        "detectedIssues": [d.type for d in out.defects],
        "structuredIssues": structured,
        "photoQuality": "clear",
        "summary": _summary(out),
        "modelVersion": out.model_version,
    }
    if out.similarity is not None:
        resp["similarity"] = round(float(out.similarity), 4)
    return jsonify(resp)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "8000")))
