"""Tiny HTTP inference server putting the trained XGBoost reward model behind the SAME
contract the API's RewardModel expects (apps/api .../reward-model.ts → HttpRewardModel).
Set PRICING_MODEL_URL on the API to this server's address and the reprice engine runs on
the real model instead of the in-TS heuristic. Stdlib only — no Flask/uvicorn dependency.

POST /predict  { "state": <PricingStateVector camelCase>, "arms": [0.78,...] }
   -> { "rewards": { "0.78": <₹>, "0.85": ..., "1": ..., "1.1": ... }, "modelVersion": ... }
GET  /health   -> { status, model_version }

Run (from ml/pricing/, after train_warmstart):
   python serve.py                       # default port 8001, model runs/warmstart/v1
   PRICING_MODEL_DIR=runs/warmstart/v1 PRICING_PORT=8001 python serve.py
"""

from __future__ import annotations

import json
import math
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from reloop_pricing.pricing.warmstart import WarmStartPricingModel

MODEL_DIR = os.environ.get("PRICING_MODEL_DIR", "runs/warmstart/v1")
PORT = int(os.environ.get("PRICING_PORT", "8001"))

print(f"[serve] loading XGBoost reward model from {MODEL_DIR} ...")
_model = WarmStartPricingModel.load(MODEL_DIR)
print(f"[serve] ready — model_version={_model.model_version}")


def _js_num(a: float) -> str:
    """Key arms the way JS String(arm) does: 1.0 -> '1', 0.78 -> '0.78'."""
    return str(int(a)) if float(a).is_integer() else str(a)


def ts_state_to_row(state: dict) -> dict:
    """Map the TS PricingStateVector (camelCase) onto the snake_case row that
    build_feature_vector consumes, deriving the raw values it needs."""
    comp_median = float(state.get("compMedianPrice", 0) or 0)
    discount = float(state.get("currentDiscountPct", 0) or 0)
    original_price_log = state.get("originalPriceLog")
    original_price = (
        math.expm1(float(original_price_log)) if original_price_log is not None else comp_median * 1.4
    )
    return {
        "grade_ordinal": int(state.get("gradeOrdinal", 3)),
        "category_l1": state.get("categoryL1", state.get("category", "unknown")),
        "category_l2": state.get("categoryL2", "unknown"),
        "brand": state.get("brand", "unknown"),
        "original_price": original_price,
        "comp_median_price": comp_median,
        "current_price": comp_median * (1 - discount),
        "floor": max(float(state.get("sellerFloor", 0) or 0), float(state.get("routeElsewhereValue", 0) or 0)),
        "item_age_days": state.get("itemAgeDays", 365),
        "has_accessories": int(bool(state.get("hasAccessories", False))),
        "authenticity_score": state.get("authenticityScore", 0.9),
        "damage_score": state.get("damageScore", 0.1),
        "defect_count": state.get("defectCount", 0),
        "days_on_market": state.get("daysOnMarket", 0),
        "num_reprices": state.get("numReprices", 0),
        "view_velocity_24h": state.get("viewVelocity24h", 5),
        "view_velocity_trend": state.get("viewVelocityTrend", 1.0),
        "save_rate": state.get("saveRate", 0),
        "ctr": state.get("ctr", 0.05),
        "message_count": state.get("messageCount", 0),
        "cart_abandons": state.get("cartAbandons", 0),
        "comp_count_nearby": state.get("compCountNearby", 3),
        "comp_min_price": state.get("compMinPrice", comp_median * 0.85),
        "comp_sold_last_7d": state.get("compSoldLast7d", 2),
        "comp_avg_days_to_sell": state.get("compAvgDaysToSell", 8),
        "nearby_buyer_count": state.get("nearbyBuyerCount", 5),
        "local_supply_count": state.get("localSupplyCount", 3),
        "geo_demand_index": state.get("geoDemandIndex", 0.5),
        "seasonality_index": state.get("seasonalityIndex", 0.5),
    }


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: dict) -> None:
        payload = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_args) -> None:  # quiet default logging
        pass

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send(200, {"status": "ok", "model_version": _model.model_version})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path != "/predict":
            self._send(404, {"error": "not found"})
            return
        length = int(self.headers.get("content-length", 0))
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self._send(400, {"error": "invalid json"})
            return
        state = body.get("state") or {}
        arms = body.get("arms") or [0.78, 0.85, 0.92, 1.0, 1.1]
        row = ts_state_to_row(state)
        predicted = _model.predict_arm_rewards(row, arms=[float(a) for a in arms])
        rewards = {_js_num(a): predicted[float(a)] for a in arms}
        self._send(200, {"rewards": rewards, "modelVersion": _model.model_version})


if __name__ == "__main__":
    print(f"[serve] listening on http://127.0.0.1:{PORT}  (POST /predict, GET /health)")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
