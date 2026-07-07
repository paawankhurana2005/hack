"""HTTP server that exposes the condition grader to the ReLoop app.

The app's API (apps/api) already has a `trained-local` grading provider that POSTs one
image at a time to `GRADING_MODEL_URL/assess` and expects a ConditionGrade
(new|like-new|good|fair|poor). So `/assess` speaks EXACTLY that protocol — point the app
at this server and grading flows through with ZERO app code changes:

    GRADING_PROVIDER=trained-local
    GRADING_MODEL_URL=http://127.0.0.1:8000
    GRADER_LENIENCY=0            # this model is already calibrated — don't bump grades
    GRADER_FLOOR=poor            # allow the full range (default 'fair' clips Salvage)

If this server is down or the model is missing, the app's FallbackVlmProvider
automatically falls back to the hosted VLM (or mock mode), so the app always runs.

Endpoints:
  GET  /health   -> {status, model}
  POST /assess   { imageBase64 }                     -> ConditionGrade JSON (app protocol)
  POST /grade    { category, images: {angle: b64} }  -> multi-angle score/grade (richer)

Run:
    cd ai-grading
    python serve.py            # 127.0.0.1:8000  (needs data/model_best.pt — see README)
"""

from __future__ import annotations

import base64
import io

import torch
from flask import Flask, jsonify, request
from PIL import Image

import config
import inference
from model import bucket, calibrate, load_grader

app = Flask(__name__)


def _decode(b64: str) -> Image.Image:
    if isinstance(b64, str) and "," in b64[:64]:
        b64 = b64.split(",", 1)[1]  # tolerate a data: URL prefix
    return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")


def _score(img: Image.Image) -> float:
    """Calibrated 0..1 condition score for one image (loads the model on first use)."""
    model, processor = load_grader("cpu")
    px = processor(images=img, return_tensors="pt")["pixel_values"]
    with torch.no_grad():
        return calibrate(float(model(px).item()))


# Map the 0..1 score onto the app's ConditionGrade so it round-trips to A/B/C/Salvage:
#   new|like-new -> A ,  good -> B ,  fair -> C ,  poor -> Salvage  (conditionGradeToReturnGrade)
def _condition_grade(score: float) -> str:
    if score >= 0.93:
        return "new"
    if score >= 0.80:
        return "like-new"
    if score >= 0.55:
        return "good"
    if score >= 0.25:
        return "fair"
    return "poor"


@app.get("/health")
def health():
    try:
        load_grader("cpu")
        ready = True
    except Exception as e:  # noqa: BLE001
        return jsonify({"status": "model_unavailable", "detail": str(e)}), 503
    return jsonify({"status": "ok", "model": "ai-grading clip-condition", "ready": ready})


@app.post("/assess")
def assess():
    """App-compatible single-image endpoint (LocalModelProvider protocol)."""
    data = request.get_json(force=True, silent=True) or {}
    b64 = data.get("imageBase64")
    if not b64:
        return jsonify({"error": "missing imageBase64"}), 400
    try:
        img = _decode(b64)
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": f"bad image: {e}"}), 400
    try:
        score = _score(img)
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 503  # -> app falls back to the VLM
    grade = _condition_grade(score)
    return jsonify({
        "grade": grade,                     # ConditionGrade the app expects
        "confidence": 0.85,
        "detectedIssues": [],               # this grader outputs a score, not defect labels
        "structuredIssues": [],
        "photoQuality": "clear",
        "summary": f"Condition score {score:.2f} ({grade}).",
        "score": round(score, 4),           # extra: the raw 0..1 score
    })


@app.post("/grade")
def grade():
    """Richer multi-angle endpoint: category + one photo per angle -> one condition score
    (worst-angle bounded) + per-angle breakdown + missing-required-angle review flag."""
    data = request.get_json(force=True, silent=True) or {}
    category = data.get("category")
    images = data.get("images") or {}
    if not images:
        return jsonify({"error": "missing images {angle: base64}"}), 400
    try:
        per = []
        for angle, b64 in images.items():
            s = _score(_decode(b64))
            per.append({"angle": angle, "score": round(s, 4), "grade": bucket(s)})
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 503
    scores = [p["score"] for p in per]
    overall = round(inference._aggregate(scores), 4) if scores else 0.0
    missing = [a for a in inference.required_angles(category) if a not in images] if category else []
    return jsonify({
        "score": overall,
        "grade": bucket(overall),
        "condition_grade": _condition_grade(overall),
        "category": category,
        "per_angle": per,
        "missing_required": missing,
        "needs_review": bool(missing),
    })


if __name__ == "__main__":
    import os

    port = int(os.environ.get("PORT", "8000"))
    print(f"[serve] ai-grading condition grader on http://127.0.0.1:{port}")
    app.run(host="127.0.0.1", port=port)
