"""Comprehensive marketplace simulation — the proof that the agent does, in real time,
everything it will do in production.

It stands up a diverse, self-refilling marketplace of listings across categories / grades /
price bands, and runs the full PricingAgent loop (sense→think→act→reflect→learn) against a
HIDDEN ground-truth demand world that is deliberately DIFFERENT from the model's warm-start
belief. Because the model is systematically wrong for whole cohorts (e.g. electronics clear
above the prior, fashion below it), the only way its predictions improve is by gathering real
outcomes and retraining — which the loop does autonomously, gated by offline policy
evaluation. That's the honest "it gets smarter"; nothing here is scripted to look good.

Every decision, outcome, and retrain is emitted as a CloudWatch-shaped JSON line to
``runs/sim/trace.jsonl``; a run report + human summary land in ``runs/sim/``.

    python -m reloop_pricing.pricing.simulate_marketplace --listings 200 --days 60 --seed 7
"""

from __future__ import annotations

import argparse
import json
import math
import os
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np

from ..data.pipeline import assemble_catalogue
from .agent import GRADE_KEY_BY_ORDINAL, PricingAgent
from .bandit import ARMS
from .memory import AgentMemory
from .retrain import LearningLoop
from .warmstart import WarmStartPricingModel

MODEL_DIR = "runs/warmstart/v1"
NEUTRAL_ARM = 0.92
MAX_DAYS_ON_MARKET = 35  # past this, a stubborn listing escalates to warehouse (worst reroute)


# ── the hidden ground truth ────────────────────────────────────────────────
class MarketWorld:
    """The real market — the part the model does NOT get to see. It holds each listing's
    hidden clearing price (structurally biased away from the warm-start prior) and decides,
    each day, whether the item sells at its current price. Also mints the market events."""

    # per-category systematic bias vs the prior's assumed clearing (=comp_median × 0.92).
    # >1 means the cohort actually clears ABOVE what the warm-start model believes.
    CATEGORY_BIAS = {
        "electronics": 1.10,
        "women": 0.90,
        "men": 0.92,
        "home": 1.03,
        "toys": 0.95,
        "sports": 1.06,
        "beauty": 1.00,
        "vintage & collectibles": 1.08,
    }

    def __init__(self, elasticity: float = 7.0, rng: Optional[np.random.Generator] = None):
        self.elasticity = elasticity
        self.rng = rng or np.random.default_rng()

    def hidden_clearing(self, category: str, comp_median: float) -> float:
        bias = self.CATEGORY_BIAS.get(str(category).lower(), 1.0)
        noise = float(self.rng.normal(1.0, 0.06))  # per-item idiosyncrasy
        return comp_median * 0.92 * bias * max(0.6, noise)

    def generate_event(self, listing: "Listing", day_local: int):
        anchor = listing.state["comp_median_price"]
        if day_local in (3, 7, 14, 21):
            return "dwell_threshold", {"daysOnMarket": day_local}
        r = float(self.rng.random())
        if r < 0.08:
            return "comp_listed", {"price": anchor * float(self.rng.uniform(0.80, 0.98))}
        if r < 0.14:
            return "comp_sold", {"price": anchor * float(self.rng.uniform(0.85, 1.00))}
        if r < 0.20:
            return "view_velocity_drop", {"currentVelocity": listing.state["view_velocity_24h"] * float(self.rng.uniform(0.1, 0.5))}
        if r < 0.24:
            return "asin_new_price_changed", {"newPrice": listing.state["amazon_new_price"] * float(self.rng.uniform(0.85, 1.15))}
        if r < 0.28:
            return "save_no_purchase", {"hoursSinceSave": float(self.rng.uniform(12, 120))}
        return "heartbeat", {"daysOnMarket": day_local}

    def try_sell(self, listing: "Listing", price: float, day_local: int) -> Dict:
        ratio = price / (listing.hidden_clearing + 1e-9)
        demand = float(listing.state.get("geo_demand_index", 0.5))
        base = 0.06 + 0.14 * demand  # daily sale prob at the clearing price
        p_sale = base / (1.0 + math.exp(self.elasticity * (ratio - 1.0)))
        if float(self.rng.random()) < p_sale:
            return {"sold": True, "sold_locally": float(self.rng.random()) < listing.p_local}
        return {"sold": False}


@dataclass
class Listing:
    id: str
    state: Dict
    hidden_clearing: float
    p_local: float
    last_arm: float
    day_listed: int
    last_reprice_day: int = 0
    reprices: int = 0
    reroute_destination: str = "donate"


# ── listing factory ─────────────────────────────────────────────────────────
def _make_listing(row: Dict, idx: int, day: int, world: MarketWorld, rng: np.random.Generator) -> Listing:
    true_price = float(row["price"])
    comp_median = true_price / 0.92
    grade = int(row.get("grade_ordinal", 3))
    category = str(row.get("category_l1", "unknown"))

    # ~14% of listings are "reroute-prone": salvage/donate value is close to or above what
    # resale can fetch, so the floor guardrail will hand them to the Intelligent Bridge.
    reroute_prone = float(rng.random()) < 0.14
    route_elsewhere = comp_median * (float(rng.uniform(0.95, 1.12)) if reroute_prone else float(rng.uniform(0.25, 0.4)))
    seller_floor = max(comp_median * 0.45, 50.0)
    # near-new items sit just under Amazon's new price (tight ceiling → the 1.1× arm can
    # breach it); worn items have lots of headroom. 5=new→1.1×comp … 1=poor→1.7×comp.
    amazon_new = comp_median * (1.1 + (5 - grade) * 0.15)

    state = {
        "listing_id": f"L{idx:05d}",
        "category": category,
        "category_l1": category,
        "category_l2": str(row.get("category_l2", "unknown")),
        "brand": str(row.get("brand", "unknown")),
        "grade_ordinal": grade,
        "grade_key": GRADE_KEY_BY_ORDINAL.get(grade, "good"),
        "original_price": comp_median * 1.4,
        "comp_median_price": comp_median,
        "comp_min_price": comp_median * 0.85,
        "current_price": comp_median * NEUTRAL_ARM,
        "amazon_new_price": amazon_new,
        "seller_floor": seller_floor,
        "route_elsewhere_value": route_elsewhere,
        "floor": max(seller_floor, route_elsewhere),
        "days_on_market": 0,
        "num_reprices": 0,
        "is_first_listing": 1,
        "view_velocity_24h": float(rng.uniform(3, 12)),
        "geo_demand_index": float(rng.uniform(0.3, 0.8)),
        "nearby_buyer_count": int(rng.integers(2, 12)),
        "seasonality_index": float(rng.uniform(0.3, 0.7)),
    }
    return Listing(
        id=state["listing_id"],
        state=state,
        hidden_clearing=world.hidden_clearing(category, comp_median),
        p_local=float(rng.uniform(0.55, 0.85)),
        last_arm=NEUTRAL_ARM,
        day_listed=day,
        reroute_destination="recycle" if grade <= 2 else "donate",
    )


# ── the run ─────────────────────────────────────────────────────────────────
def run_marketplace(
    n_listings: int = 200,
    days: int = 60,
    seed: int = 7,
    retrain_every: int = 500,
    out_dir: str = "runs/sim",
    agent_memory_dir: str = "runs/agent",
) -> Dict:
    if not os.path.exists(f"{MODEL_DIR}/xgboost_model.json"):
        raise SystemExit(f"No model at {MODEL_DIR} — run train_warmstart first.")

    os.makedirs(out_dir, exist_ok=True)
    # fresh memory each run so the demo is reproducible from a clean slate
    for stale in ("transactions.jsonl", "bandit_state.json"):
        p = os.path.join(agent_memory_dir, stale)
        if os.path.exists(p):
            os.remove(p)

    trace_path = os.path.join(out_dir, "trace.jsonl")
    trace_file = open(trace_path, "w")

    def emit_dict(rec: Dict) -> None:
        trace_file.write(json.dumps(rec) + "\n")

    def emit_str(line: str) -> None:  # LearningLoop hands us pre-serialized JSON
        trace_file.write(line + "\n")

    world = MarketWorld(rng=np.random.default_rng(seed))
    factory_rng = np.random.default_rng(seed + 1)
    bandit_rng = np.random.default_rng(seed + 2)

    model = WarmStartPricingModel.load(MODEL_DIR)
    memory = AgentMemory(agent_memory_dir)
    learning_loop = LearningLoop(
        memory,
        retrain_every=retrain_every,
        seed=seed,
        backbone_sample=1200,
        log=emit_str,
        start_version=1,
    )
    agent = PricingAgent(model, memory, learning_loop, rng=bandit_rng, emit=emit_dict)

    # metrics
    stats = {
        "decided": 0,
        "held": 0,
        "events_generated": Counter(),
        "events_significant": Counter(),
        "guardrails_fired": Counter(),
        "actions": Counter(),
        "outcomes": Counter(),
        "reroute_dest": Counter(),
        "reward_total": 0.0,
        "margin_sold_total": 0.0,
        "sold": 0,
        "rerouted": 0,
        "reward_first_half": [],
        "reward_second_half": [],
        "model_version_by_day": [],
    }

    # shuffle so item mix (and price band) is stationary over the run — otherwise the two
    # concatenated sources (cheaper fashion, then pricier electronics) would leak time order
    # into the economics and fake a "learning" trend that's really just ordering.
    catalogue = (
        assemble_catalogue(None, None, max(n_listings * 8, 1500), seed=seed)
        .sample(frac=1.0, random_state=seed)
        .reset_index(drop=True)
    )
    pool_iter = {"i": 0}

    def spawn(day: int) -> Listing:
        row = catalogue.iloc[pool_iter["i"] % len(catalogue)].to_dict()
        idx = pool_iter["i"]
        pool_iter["i"] += 1
        listing = _make_listing(row, idx, day, world, factory_rng)
        # initial listing decision — sets the first price (guardrail step-cap skipped)
        decision = agent.think(listing.state, is_first_listing=True)
        agent.reflect(listing.id, listing.state, "initial_listing", decision, agent.act(decision))
        stats["actions"][agent.act(decision)] += 1
        if not decision["should_reroute"]:
            listing.state["current_price"] = decision["final_price"]
            listing.last_arm = decision["chosen_arm"]
        listing.state["is_first_listing"] = 0
        for g in decision["guardrails"]:
            stats["guardrails_fired"][g] += 1
        return listing

    active: List[Listing] = [spawn(0) for _ in range(n_listings)]
    half = days / 2

    for day in range(1, days + 1):
        survivors: List[Listing] = []
        for listing in active:
            day_local = day - listing.day_listed
            listing.state["days_on_market"] = day_local
            anchor = listing.state["comp_median_price"]

            # 1. does the market clear it TODAY at its current price? (every day, held or not)
            sale = world.try_sell(listing, listing.state["current_price"], day_local)
            if sale["sold"]:
                outcome = {
                    "listingId": listing.id,
                    "sold": True,
                    "finalPrice": listing.state["current_price"],
                    "daysOnMarket": day_local,
                    "soldLocally": sale["sold_locally"],
                    "rerouted": False,
                }
                reward = agent.learn(dict(listing.state), listing.last_arm, outcome)
                _record_terminal(stats, reward, day, half, "sold", listing, sale["sold_locally"])
                continue

            # 2. staleness backstop → escalate to warehouse (the worst reroute)
            if day_local >= MAX_DAYS_ON_MARKET:
                outcome = {
                    "listingId": listing.id,
                    "sold": False,
                    "finalPrice": listing.state["current_price"],
                    "daysOnMarket": day_local,
                    "rerouted": True,
                    "rerouteDestination": "warehouse",
                }
                reward = agent.learn(dict(listing.state), listing.last_arm, outcome)
                _record_terminal(stats, reward, day, half, "reroute", listing, False, "warehouse")
                continue

            # 3. perceive an event and decide whether to act
            event_type, payload = world.generate_event(listing, day_local)
            stats["events_generated"][event_type] += 1
            days_since = day - listing.last_reprice_day
            if not agent.sense(listing.state, event_type, payload, days_since):
                stats["held"] += 1
                survivors.append(listing)
                continue
            if event_type != "heartbeat":
                stats["events_significant"][event_type] += 1
            stats["decided"] += 1

            # a significant comp event nudges the local anchor (the market moves)
            if event_type == "comp_listed":
                listing.state["comp_median_price"] = anchor * 0.7 + float(payload["price"]) * 0.3

            decision = agent.think(listing.state, is_first_listing=False)
            action = agent.act(decision)
            agent.reflect(listing.id, listing.state, event_type, decision, action)
            stats["actions"][action] += 1
            for g in decision["guardrails"]:
                stats["guardrails_fired"][g] += 1
            listing.last_reprice_day = day

            if action == "reroute":
                outcome = {
                    "listingId": listing.id,
                    "sold": False,
                    "finalPrice": decision["final_price"],
                    "daysOnMarket": day_local,
                    "rerouted": True,
                    "rerouteDestination": listing.reroute_destination,
                }
                reward = agent.learn(dict(listing.state), decision["chosen_arm"], outcome)
                _record_terminal(stats, reward, day, half, "reroute", listing, False, listing.reroute_destination)
                continue

            listing.state["current_price"] = decision["final_price"]
            listing.last_arm = decision["chosen_arm"]
            if action == "reprice":
                listing.reprices += 1
                listing.state["num_reprices"] = listing.reprices
            survivors.append(listing)

        # refill the marketplace so the population (and event stream) stays alive
        active = survivors
        while len(active) < n_listings and day < days:
            active.append(spawn(day))

        stats["model_version_by_day"].append({"day": day, "version": agent.model_version})

    trace_file.close()
    report = _build_report(stats, agent, learning_loop, n_listings, days, seed, retrain_every)
    with open(os.path.join(out_dir, "report.json"), "w") as f:
        json.dump(report, f, indent=2)
    with open(os.path.join(out_dir, "summary.md"), "w") as f:
        f.write(_render_summary(report))
    print(_render_summary(report))
    print(f"\nFull thinking-trace → {trace_path}")
    print(f"Report → {os.path.join(out_dir, 'report.json')}  ·  {os.path.join(out_dir, 'summary.md')}")
    return report


def _record_terminal(stats, reward, day, half, kind, listing, sold_locally, dest=None):
    stats["reward_total"] += reward
    stats["outcomes"][kind] += 1
    (stats["reward_first_half"] if day <= half else stats["reward_second_half"]).append(reward)
    if kind == "sold":
        stats["sold"] += 1
        stats["margin_sold_total"] += reward
        if sold_locally:
            stats["outcomes"]["sold_local"] += 1
    else:
        stats["rerouted"] += 1
        stats["reroute_dest"][dest] += 1


def _build_report(stats, agent: PricingAgent, learning_loop: LearningLoop, n_listings, days, seed, retrain_every) -> Dict:
    terminated = stats["sold"] + stats["rerouted"]
    decided, held = stats["decided"], stats["held"]

    def avg(xs):
        return round(float(np.mean(xs)), 2) if xs else 0.0

    buckets = {}
    for key, sub in agent.bandit.state_dict().items():
        obs = {float(a): int(n) for a, n in sub["arm_observations"].items()}
        total = sum(obs.values())
        best_arm = max(obs, key=obs.get) if total else NEUTRAL_ARM
        buckets[key] = {
            "observations": {str(a): obs.get(a, 0) for a in ARMS},
            "total": total,
            "exploit_arm": best_arm,
        }

    return {
        "config": {"listings": n_listings, "days": days, "seed": seed, "retrain_every": retrain_every},
        "cadence": {
            "decided": decided,
            "held": held,
            "held_ratio": round(held / max(1, decided + held), 3),
        },
        "event_coverage": {
            "generated": dict(stats["events_generated"]),
            "significant": dict(stats["events_significant"]),
        },
        "guardrail_coverage": dict(stats["guardrails_fired"]),
        "actions": dict(stats["actions"]),
        "outcomes": {
            "terminated": terminated,
            "sold": stats["sold"],
            "sold_local": stats["outcomes"].get("sold_local", 0),
            "rerouted": stats["rerouted"],
            "reroute_by_destination": dict(stats["reroute_dest"]),
            "sell_through_pct": round(100 * stats["sold"] / max(1, terminated), 1),
            "reroute_pct": round(100 * stats["rerouted"] / max(1, terminated), 1),
        },
        "economics": {
            "total_reward": round(stats["reward_total"], 2),
            "avg_reward_first_half": avg(stats["reward_first_half"]),
            "avg_reward_second_half": avg(stats["reward_second_half"]),
            "avg_margin_per_sale": round(stats["margin_sold_total"] / max(1, stats["sold"]), 2),
        },
        "learning": {
            "transactions_logged": agent.memory.transaction_count(),
            "final_model_version": agent.model_version,
            "retrains": learning_loop.retrain_events,
        },
        "buckets": buckets,
    }


def _render_summary(r: Dict) -> str:
    c, cad, out, eco, learn = r["config"], r["cadence"], r["outcomes"], r["economics"], r["learning"]
    lines = []
    A = lines.append
    A("# ReLoop Autonomous Pricing Agent — Marketplace Simulation\n")
    A(f"**{c['listings']} concurrent listings · {c['days']} days · seed {c['seed']} · "
      f"retrain every {c['retrain_every']} transactions**\n")

    A("## 1. Cadence — is it calm?")
    A(f"- Decisions taken: **{cad['decided']}**, days held (watching): **{cad['held']}**")
    A(f"- Held ratio: **{cad['held_ratio']:.0%}** of listing-days were left untouched "
      "(the trigger gate working — no daily churn).\n")

    A("## 2. Event coverage — every signal exercised")
    A("| event | generated | significant (acted) |")
    A("|---|---|---|")
    for ev in sorted(r["event_coverage"]["generated"]):
        gen = r["event_coverage"]["generated"][ev]
        sig = r["event_coverage"]["significant"].get(ev, 0)
        A(f"| {ev} | {gen} | {sig} |")
    A("")

    A("## 3. Guardrail coverage — which rules clamped prices")
    A("| guardrail | times fired |")
    A("|---|---|")
    for g, n in sorted(r["guardrail_coverage"].items(), key=lambda x: -x[1]):
        A(f"| {g} | {n} |")
    A("\n_The `ceiling` (amazon_new × 0.95) rarely reaches this stage — the bandit already "
      "marks ceiling-breaching arms infeasible, so the price never exceeds it in the first "
      "place; the guardrail is the defensive backstop._\n")

    A("## 4. Outcomes")
    A(f"- Terminated: **{out['terminated']}** — sold **{out['sold']}** "
      f"({out['sell_through_pct']}% sell-through, {out['sold_local']} local), "
      f"rerouted **{out['rerouted']}** ({out['reroute_pct']}%).")
    A(f"- Reroute destinations: {out['reroute_by_destination'] or '—'}\n")

    A("## 5. Economics & learning")
    A(f"- Total reward: **₹{eco['total_reward']:,.0f}** · avg margin/sale ₹{eco['avg_margin_per_sale']:,.0f}")
    A(f"- Realized reward/outcome **first half → second half**: "
      f"₹{eco['avg_reward_first_half']:,.0f} → ₹{eco['avg_reward_second_half']:,.0f} "
      "(rough — confounded by which items happen to terminate; the retrain gate below is "
      "the clean learning signal).")
    A(f"- Transactions logged: **{learn['transactions_logged']}** · "
      f"final model **{learn['final_model_version']}**\n")

    if learn["retrains"]:
        A("### Autonomous retrains (offline-gated, >2% to promote)")
        A("| trigger rows | candidate ₹ | current ₹ | improvement | promoted → |")
        A("|---|---|---|---|---|")
        for e in learn["retrains"]:
            promo = e["new_version"] if e["promote"] else "HELD ❌"
            A(f"| {e['trigger_rows']} | {e['candidate_value']:,.0f} | {e['current_value']:,.0f} "
              f"| {e['improvement_pct']:+.1f}% | {promo} |")
        A("")
    else:
        A("_No retrain fired this run — raise --days or lower --retrain-every to cross the gate._\n")

    A("## 6. Per-bucket posteriors (exploration → exploitation)")
    A("| bucket (category\\|grade) | decisions | settled arm |")
    A("|---|---|---|")
    for key, b in sorted(r["buckets"].items(), key=lambda x: -x[1]["total"])[:12]:
        A(f"| {key} | {b['total']} | {b['exploit_arm']}× |")
    A("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Autonomous pricing-agent marketplace simulation.")
    parser.add_argument("--listings", type=int, default=200, help="concurrent active listings")
    parser.add_argument("--days", type=int, default=60)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--retrain-every", type=int, default=500, help="fresh rows between retrains")
    parser.add_argument("--out", default="runs/sim")
    args = parser.parse_args()
    run_marketplace(
        n_listings=args.listings,
        days=args.days,
        seed=args.seed,
        retrain_every=args.retrain_every,
        out_dir=args.out,
    )


if __name__ == "__main__":
    main()
