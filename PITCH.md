# ReLoop — Positioning One-Pager (judge Q&A ammunition)

**One line:** ReLoop is the missing front end of Amazon's existing ReCommerce
stack — grade at the doorstep, decide before the item moves.

---

## The objection we got: "Amazon's positioning is not reselling"

Half right — and the half that's wrong is our best weapon.

**Wrong half — Amazon absolutely resells returns, at enormous scale:**

- **FBA Grade and Resell** — Amazon inspects sellers' returns, grades them
  (Like New / Very Good / Good / Acceptable) and relists them as Used; sellers
  reclaim up to ~80% of original value. *Expanded in November 2025* — a growth
  area, not a side project.
- **Amazon Resale** (ex-Warehouse Deals), **Amazon Renewed** (refurbished),
  **Amazon Outlet** — three whole second-life storefronts.
- **FBA Liquidations, FBA Donations, Second Chance, Trade-In** — in 2024 Amazon
  helped sellers resell or donate **~391 million items** (US + EU), publicized
  under the Climate Pledge.

**Right half — Amazon has deliberately never done C2C/P2P selling** (no OLX, no
Facebook Marketplace). Controlling the end-to-end customer experience is the
moat. That's why ReLoop is **not** a peer-to-peer selling app: every locally
routed item goes through an Amazon delivery-station bench (verified, repackaged,
Health-Carded) before any buyer sees it. Amazon stays in the loop; the trust is
Amazon-grade.

## The structural gap we fill

Every Amazon ReCommerce program activates **after** the item has been picked up,
sorted, linehauled to a returns centre, and queued for days-to-weeks. Grading
happens at the warehouse — after the reverse-logistics cost is sunk and the value
has decayed.

- ~**1.2–1.5 billion** returned packages a year; total returns cost estimates
  **$40–88B annually**.
- Only an estimated **10–20% of returns get restocked** and resold on Amazon;
  much of the rest goes to liquidators (a **$644B** industry) for cents on the
  dollar.
- **Nobody grades at the doorstep. Nobody decides before the item moves.**

## The argument in one paragraph (information timing)

Information only has value if it changes a decision before money is spent.
Amazon uses *better* information (physical inspection) at the *worst* time
(after all costs are sunk). ReLoop uses noisier information (doorstep photos) at
the moment of maximum leverage — and the downside is bounded by design, because
the engine's fallback IS today's workflow. The AI doesn't have to beat a human
inspector; it has to satisfy `P(correct route) × savings > P(wrong route) ×
correction cost`, where the correction cost is a shelf move at a local hub, not
a lost item. Every correct early decision is pure margin.

## Likely pushback → answers

**"What if the AI grade is wrong?"**
It's caught at two checkpoints — a 30-second driver scan at pickup and a
10-minute bench at the local delivery station — *before any buyer sees the
item*. A wrong local decision degrades to "send it up the chain", which is what
happens to 100% of items today. And every bench verdict is a free labelled
training pair, so the grader improves as a byproduct of operations.

**"Why run an AI model if a human inspects anyway?"**
Because the grade changes *where the truck goes*, not just what the label says.
Inspection without routing leverage is what Amazon already has. (This same
principle is why we killed our Trade-In idea: there the destination is fixed, so
doorstep grading changes nothing physical.)

**"Doesn't this add logistics hops?"**
No — it deletes them. Returned items already pass through the local delivery
station today as a pass-through. We stop them there and remove the sortation
hop, the linehaul, the returns-centre dwell, and often a second linehaul out.
Direct doorstep-to-doorstep handoff is a rare, seal-verified exception, not the
default.

**"Where exactly is the money?"**
(1) **Restock**: sealed changed-mind items go straight to the nearest FC shelf —
weeks of dwell and one linehaul deleted, sold before markdown. (2) **Local
resale**: 60–80% recovery vs ~10–30% via liquidation, zero linehaul, cash in
days. (3) **Refurb uplift**: a ₹300 cable turns a B into an A worth +₹1,500.
(4) **Graded pallets**: hub-staged liquidation pallets carry Health Card
manifests — transparent pallets price higher than mystery pallets. (5) **Time**:
category price decay × weeks of dwell is a real P&L line our engine prices and
today's process cannot act on.

**"Why is this Amazon-native and not OLX-like?"**
OLX is unverified strangers, no trust layer, no logistics. ReLoop is AI-verified
condition + a Product Health Card + Amazon-mediated handoff and guarantee. And
the headline flow isn't consumer selling at all — it's Amazon's own returns cost
line, with the Climate Pledge story (avoided freight, audited destruction,
donation receipts) attached.

**"Is the routing a black box?"**
No — deliberately. One deterministic EV engine (hard-constraint ladder →
confidence gates → expected-value argmax) with every signed term surfaced on
screen. The LLM narrates; the logic decides. Every `destroy` and every denied
local route has a replayable reason — that's an ESG/audit requirement, not an
aesthetic.

---

*Sources: Amazon (aboutamazon.com — returns, circular economy, Grade and Resell),
CNBC (Amazon returns problem, 2022), EcommerceBytes (Grade and Resell expansion,
Nov 2025), Red Stag Fulfillment (returns statistics), industry liquidation
estimates (Colorado State / NRF coverage). Figures are public estimates; ranges
kept deliberately conservative.*
