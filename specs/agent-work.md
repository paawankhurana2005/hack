# Agent-Work — How the ReLoop Listing Agent works (demo guide)

> A speaking guide for the demo. Top section = what to *say*. Bottom section =
> what's actually happening under the hood, for judge Q&A.

---

## 1. The one-liner

> "Most 'AI agents' are a button wired to an LLM. Ours is an **autonomous agent
> that diagnoses why an item isn't selling and picks the right fix — and it's free
> to act, but it physically cannot do anything dumb, because it acts inside
> hard-coded guardrails."

## 2. The mental model — say this

The agent runs a loop, once per "day", on every listing:

1. **Perceives** — how long it's been up, how many views, what comparable items
   nearby are priced at, local demand, how much it's costing us to hold it.
2. **Diagnoses** — *why* isn't it selling? Priced too high? No local demand? Good
   listing but weak reach? Or genuinely not worth reselling anymore?
3. **Decides** — picks the **right lever for that diagnosis** (this is the part
   that makes it an agent, not a timer).
4. **Acts** — does it, and **writes a plain-English line explaining itself** to a
   live feed.

> "A timer just drops the price on a schedule. Our agent asks *why* first, and
> price is only one of four tools it can reach for."

## 3. The four levers — say this

| If the agent diagnoses… | …it pulls this lever |
|---|---|
| Priced above the local market, no offers | **Reprice** — step the price down toward the comparable (but never below the floor) |
| Price is fine, but local demand is thin | **Widen reach** — expand the match radius (4km → 25km / city) |
| Lots of views but nobody's biting | **Improve the listing** — flag it for better photos / detail |
| At the floor, no demand even city-wide | **Re-route** — stop trying to sell; recommend **Recycle** or **Donate** |

## 4. The line that wins the room — say this

> "Watch the dashed line on the chart — that's the **price floor**, the lowest we
> can sell for without losing money. The agent walks the price down toward the
> market… but it **never crosses that floor**. When it hits the floor and the item
> still won't move, it doesn't break the rule and dump it at a loss — it
> **switches strategy**: first it tries widening the reach, and only when that
> fails does it recommend recycling. That's the whole pitch: **freedom to act,
> bounded by glass-box rules.** The LLM never makes the decision — it only
> explains it in plain English."

---

## 5. The live demo — exact script & numbers

You control a **simulated clock**. Hit **Auto-run** and it plays in ~10 seconds;
or hit **Advance 1 day** to step through it beat by beat on stage.

### Arc A — the dramatic one: "Worn Running Shoes" → Recycle
Open **My Listings → Worn Running Shoes** and hit **Auto-run**.

Setup (you can mention): *listed at ₹1,800, the floor is ₹1,100, but comparable
worn shoes nearby only fetch ₹1,000 — the market wants less than we can profitably
sell for, and demand is low.*

What the feed will show:
| Day | Action | What you say |
|---|---|---|
| 1 | Reprice ₹1,800 → ₹1,550 | "It sees it's 80% over the local comparable and starts walking it down." |
| 2 | Reprice ₹1,550 → ₹1,300 | "Gradual, deliberate steps — capped at 15% a day." |
| 3 | Reprice ₹1,300 → ₹1,150 | "Getting close to the floor now." |
| 4 | Reprice ₹1,150 → ₹1,100 | "**It stops exactly at the ₹1,100 floor. It will not go lower.**" |
| 5 | Widen reach 4km → 25km | "Price is maxed out, so it changes tactic — widens the search to the whole city." |
| 6 | **Escalate → RECYCLE** | "Still no demand, even city-wide. So it makes the mature call: resale isn't viable, **recycle it** — recover the materials and EcoCredits instead of letting it rot in a warehouse." |

Then click **Accept · Recycle** → "And that closes the loop — it logs the CO₂
avoided and the EcoCredits recovered, straight into the user's rewards."

### Arc B — the happy one: "Nike Pegasus" → sells
Open **Nike Pegasus** and Auto-run (or just show its price history).
| Day | Action | What you say |
|---|---|---|
| 1–2 | Reprice ₹3,999 → ₹3,750 → ₹3,650 | "Two small reprices to get competitive." |
| 3 | Widen reach → 25km | "Now it's well-priced, so it broadens reach." |
| 4 | Improve listing | "Lots of views, no offers — it flags the listing itself." |
| 5+ | Holds | "Competitively priced, waiting for a match." |

Then go to **Shop**, buy the Pegasus → back to **My Listings** it flips to **Sold**.
"Same item, both sides of the marketplace — the loop, done by one person."

### Arc C — human in control (show briefly)
On any listing, type a price into **Manual override → Set price**.
> "And the human is never locked out. The moment I set a price myself, the agent
> **pauses and hands me the wheel** — it logs that I took over. I can resume it any
> time. The agent has autonomy; the user has final say."

---

## 6. Under the hood — for judge Q&A

**"Is the LLM making these decisions?"**
No — and that's deliberate. The decision is **pure deterministic TypeScript**
(`packages/shared/src/agent.ts`, function `decideAgentAction`). The LLM (NVIDIA)
only writes the one-sentence explanation in the feed. **Logic decides, the LLM
narrates** — the same glass-box pattern as our routing engine. If the network
drops mid-demo, the feed falls back to a template and the agent keeps working.

**"So is the data fake?"**
The *market signals* (comparable price, demand, views) are simulated mock inputs —
we don't have a live marketplace feed. But the **reasoning that runs over them is
real, deterministic code**. Real logic over mock inputs is honest and repeatable;
faked output is the thing we avoided. In production you swap the mock signals for
real market data — the engine doesn't change.

**"How does it guarantee it won't sell at a loss?"**
Every listing has a `floorCents`. The reprice math takes `max(computed_price,
floor)` — it's impossible to return a price below the floor. We verified this; the
shoes stop dead at ₹1,100. When repricing is exhausted the cascade falls through
to *widen reach*, then *escalate route* — it changes tools rather than breaking
the rail.

**"Why does it recommend recycle and not just keep discounting?"**
Because the comparable (₹1,000) is **below** our floor (₹1,100). The market wants
less than we can afford, demand is low even after widening to the whole city, and
holding cost keeps accruing. The deterministic gate fires: *at floor + low demand
+ reach maxed + no offers → resale not viable → route it*. Grade `poor` → recycle;
a usable item with no resale value → donate.

**"What's the time mechanic?"**
A simulated per-listing day counter so we can show several agent cycles live in
seconds. Advance manually or auto-run. In production this is a real scheduler
ticking over real days.

**Architecture in one breath:**
`packages/shared/src/agent.ts` (the pure engine, runs in the browser) →
`apps/web/src/lib/agent-store.ts` (the clock + state + feed, localStorage) →
`/app/listings/[listingId]` (the chart + live feed + controls). The only network
call is `POST /api/agent/narrate` for the natural-language line, with a
deterministic fallback.

---

## 7. If you only remember three sentences
1. "It diagnoses *why* something isn't selling and picks the right fix — price is
   one of four levers, not the only one."
2. "It's free to act but it **cannot cross the price floor** — autonomy bounded by
   glass-box rules; the LLM narrates, it never decides."
3. "When resale genuinely isn't viable, it makes the mature call and recommends
   recycling — closing the loop instead of dumping the item in a warehouse."
