# ReLoop — 4-Minute Demo Video Script

> **Live:** https://reloop-woad.vercel.app · **Tagline:** *"The landfill is a design flaw."*
> A 4:00 guided flow, all-in on the **Return Pipeline** (spec 016): grade at the
> doorstep, one glass-box engine decides before the item moves, and two human
> checkpoints keep it honest. The four pillars (AI Grading, Smart Routing,
> Product Health Card, Prevention) all serve that one story.

---

## Before you hit record (2-min setup)

- **Warm the API.** Render's free tier sleeps — open the site and run one
  grading *once* before recording so the first AI call isn't a 50s cold start.
- **Browser:** full-screen, hide the bookmarks bar, 100% zoom, close other tabs.
- **Accounts you'll use** (login = type a handle, no password):
  - `meera` — shopper (Pune). Has the return-eligible item + the staged 2-life item.
  - `techbazaar` — seller dashboard (Returns queue + **Hub Bench**).
- **Stage the hub:** submit one return as Meera before recording so the Hub Bench
  queue isn't empty, then do a second, live one on camera.
- **Recording:** 1080p+, cursor highlight on, system audio off. Lines are timed
  for ~140 wpm.

**Legend:** 🎬 = on-screen action · 🎙 = voiceover · 💡 = director's note

---

## 0:00 – 0:22 · The hook (Landing page)

🎬 Open on **https://reloop-woad.vercel.app**. Slow-scroll the hero → the four
pillars row → the routing-decision panel.

🎙 *"Amazon already runs the world's biggest resale operation — Renewed, Resale,
Grade and Resell. But every one of those programs starts AFTER the return has
been picked up, sorted, and trucked hundreds of kilometres to a returns centre.
The freight is spent, weeks of value have decayed — and only then does anyone
decide what the item is worth. Only ten to twenty percent ever gets restocked.
ReLoop moves that decision to the doorstep: grade at the source, decide before
the item moves."*

💡 This hook pre-empts the "Amazon isn't a reselling company" objection: we're
not a reselling app — we're the missing front end of programs Amazon already runs.

---

## 0:22 – 0:32 · One login, many roles (Multi-account)

🎬 Click **Get Started** → on **/login**, click **Meera**.

🎙 *"I'll start as Meera — a shopper with an item to return. No passwords, just
pick who you are."*

---

## 0:32 – 0:50 · Pillar 4: Prevention (Store)

🎬 Go to **Store**. Open any product detail — point at the return-likelihood
prediction.

🎙 *"First, the cheapest return of all: the one that never happens. Before you
buy, ReLoop predicts how likely this exact choice is to come back and nudges you
to the right pick. Everything downstream exists for the returns that happen
anyway."*

---

## 0:50 – 1:50 · THE CORE: grade at the doorstep, decide before it moves (Return)

🎬 **My Items** → **Eligible for return** → **Return this item**. Walk the flow
slowly: **Reason → doorstep Grading → Intelligent Bridge → confirmation.** On the
Bridge screen, point at the EV table — including the **Restock** row and any
**confidence-gated** rows. On the final screen, trace the **journey strip**
(Routed at your doorstep → Driver scan → Local hub check → destination).

🎙 *"Here's the whole product in one flow. Meera photographs the item; our own
vision model grades it at the doorstep — as a probability distribution, not a
guess. Then the Intelligent Bridge, a deterministic engine you can read line by
line, computes the expected value of every path: restock straight to sellable
inventory, resell locally, refurbish, donate, recycle — or the standard
warehouse flow, which stays as the built-in fallback. It prices the freight, the
handling, the local demand, the carbon — and the weeks of price decay a returns
centre would burn. Watch the sealed-box case: it routes straight back to a
fulfilment centre shelf, skipping the returns centre entirely. And if the AI
isn't confident? The gates close toward the cheapest correction, not the most
expensive one — low-confidence items collapse to a graded, Health-Card-
manifested hub pallet, where a wrong grade costs about fifteen rupees to
re-sort, instead of a 580-kilometre round trip. Worst case ever, we still do
exactly what Amazon does now — that's the ungated fallback. Every better
decision is pure margin — and the route is re-checked at two physical
checkpoints before the item commits."*

💡 Pause on the EV breakdown — restock row + a gated row visible together is the
"decision under uncertainty" money shot. Then the journey strip sets up the next
segment.

---

## 1:50 – 2:30 · MONEY SHOT 2: the Hub Bench (checkpoints + live re-route)

🎬 **Switch** → log in as **techbazaar** → **Hub Bench**. Select the staged
return. Click **Record driver scan** → **Check in at hub bench**. Now override
the AI grade (A → B) or toggle the seal — the engine preview updates **live** —
then **Confirm & dispatch**. Show the transition log.

🎙 *"A return isn't one decision — it's a lifecycle. The pickup driver does a
thirty-second scan at the door. Then the item lands at the local delivery
station — a building it passes through anyway — for a ten-minute bench check.
Watch what happens when the human disagrees with the AI: I mark the seal broken,
and the same engine re-runs instantly — restock is off, it re-routes to a local
buyer. The wrong grade was caught before any buyer ever saw the item, and the
correction cost a shelf move, not a lost parcel. And every bench verdict becomes
a labelled training example — the grader literally improves as a byproduct of
operations."*

💡 The live re-route (decision flipping on screen as you toggle the seal) is the
most convincing 5 seconds in the demo. Do it twice if pacing allows.

---

## 2:30 – 2:55 · Pillar 3: trust that travels — "CARFAX for a product" (Shop)

🎬 Go to **Shop** (as Meera or stay logged in) → open the staged **Adidas
Ultraboost** detail → scroll to **"This item's lives"** → ask **Rufus** *"Is this
worth it?"*.

🎙 *"What makes a doorstep-graded item sellable to a stranger? The Product Health
Card — verified condition, photos, and every checkpoint stamp, travelling with
the physical item across owners. Two lives, one verified chain, total CO₂ saved.
Think CARFAX, but for a product — and only Amazon can prove lineage from first
sale. Buyers can even interrogate it through Rufus."*

---

## 2:55 – 3:15 · The engine keeps working: Listing Agent

🎬 Open **My Listings** → a listing → **Advance day / Auto-run**. Show the price
chart → the **recycle recommendation**.

🎙 *"Routing doesn't end at 'list it'. An autonomous agent watches every local
listing — repricing toward comparables, widening the radius — and when resale is
truly exhausted, it re-enters the same decision engine and cascades: donate,
recycle. Items never rot on a shelf."*

---

## 3:15 – 3:25 · Rewarded for the loop (Rewards)

🎬 **Rewards** → the EcoCredits ledger.

🎙 *"The carbon the engine saves is priced inside the same EV math — and funds
EcoCredits for the customer. Carbon and cash never disagree."*

---

## 3:25 – 3:52 · Returns at volume: Seller dashboard

🎬 As **techbazaar**: **Overview** donut (rescued / refurbished / donated /
discarded) → quick montage: **Returns queue → Rescue → Bulk exchange → Spare
parts.**

🎙 *"At volume, the same brain runs the seller side: a returns queue graded at
the doorstep, the hub bench you saw, a rescue pipeline, and bulk exchange —
where liquidation-bound items are staged into graded pallets, each one carrying
its Health Card. Manifested pallets like these clear at the top of the
liquidation market instead of mystery-lot pricing, because the buyer can see
exactly what's inside. Even spare-part harvesting for items too far gone to
sell whole. Every destroyed item needs a logged, replayable reason — the
engine's job is to shrink that number."*

---

## 3:52 – 4:00 · Close

🎬 Cut back to the landing hero: *"The landfill is a design flaw."*

🎙 *"Amazon built the resale rails. ReLoop gives them eyes at the doorstep and a
brain that decides before the truck rolls. That's the return pipeline, rewired —
the Amazon way."*

💡 End card: logo + **reloop-woad.vercel.app**. Hold 2 seconds on the tagline.

---

## Coverage checklist (everything hit)

| Feature | Segment |
| --- | --- |
| Positioning hook — "missing front end", not a reselling app | 0:00 |
| Multi-account login | 0:22 |
| **Prevention** — return prediction (Store) | 0:32 |
| **AI Grading at the doorstep** + grade posterior | 0:50 |
| **Intelligent Bridge** — EV table, restock path, confidence gates, fallback | 0:50 |
| Journey strip — decided now, verified at checkpoints | 0:50 |
| **Hub Bench** — driver scan, bench override, live re-route, transition log | 1:50 |
| Flywheel — bench verdicts = training labels | 1:50 |
| **Product Health Card** + multi-owner provenance ("CARFAX") + Rufus | 2:30 |
| **Listing Agent** — reprice → cascade via the same engine | 2:55 |
| EcoCredits — carbon priced inside the same EV | 3:15 |
| Seller dashboard: queue, rescue, bulk exchange, spare parts, audit trail | 3:25 |

## If you're tight on time (trim order)
Drop in this order to hit 4:00 cleanly: Rewards → Listing Agent chart detail →
Prevention. **Never cut:** the Return → Intelligent Bridge segment or the Hub
Bench live re-route — those are the thesis.

## Q&A ammunition
See **PITCH.md** for the judge-rebuttal one-pager (Amazon ReCommerce facts,
the information-timing argument, and the "your workflow is our fallback" answer).
