# ReLoop — Logs & Screenshots Capture Guide (for the PPT)

Everything the deck needs you to screenshot, with the **exact command**, the
**expected output** (real, captured on 2026-07-04), and the **slide** it goes on.
All commands are deterministic — no network, no NVIDIA key needed for the proofs
(the two live `/api/route` calls just need your local API running on `:4000`).

> **The deck has just 3 "📸 PASTE SCREENSHOT HERE" spots.** In order of priority:
> - **Slide 8** — the speaker example → §3 (Scenario A)
> - **Slide 10** — the live re-route → §5 (Scenario D), or capture it in the UI
> - **Slide 16** — "is it real?" proof → §1 + §2 (`pnpm eval && pnpm test:edge`)
>
> Sections §4 and §6 below are optional extras (nice to have on hand for Q&A,
> not required by any slide).

> **Terminal tips for clean screenshots**
> - Full-screen the terminal, dark theme, font size ~16pt, ~110 cols wide.
> - Pipe long JSON through `| python3 -m json.tool` (already baked into the
>   commands below) so it's pretty-printed.
> - Screenshot region on macOS: `⌘⇧4`. Save the PNGs into
>   `deck/screenshots/` so they live next to the deck.

---

## 0. One-time setup (before you capture the two live calls)

The API must be running (it already is on port 4000; if not):

```bash
cd /Users/damankhurana/hack
pnpm --filter @reloop/api dev      # starts on :4000, tsx watch
```

Confirm it's up:

```bash
curl -s http://localhost:4000/health
# → {"status":"ok","mockMode":false}
```

---

## 1. `pnpm test:edge` — the 51/51 edge-case matrix

**Slide:** 16 (the “is it real?” proof)

```bash
cd /Users/damankhurana/hack
pnpm test:edge
```

**Expected tail:**

```
ReLoop edge-case matrix — 51/51 passed

  ✓ all edge cases handled
```

> 💡 The `51/51 passed` line is the one to crop for slide 16.

---

## 2. `pnpm eval` — the deterministic baseline report

**Slide:** 16 (the “is it real?” proof — the metric tiles come from this report)

```bash
cd /Users/damankhurana/hack
pnpm eval
```

**Expected (real numbers):**

```
Routing hard-rule conformance (N=8)
  forced-path accuracy     100.0%

Routing EV optimization     (N=8, viable paths)
  argmax-EV selection      100.0%
  distinct paths chosen    4  [local_resale, ... , liquidate, returnless_refund]

Pricing policy             (N=10)
  MAE  ₹186     MAPE 5.3%
Resale-ratio model (GBDT)  improvement over baseline 82.2%
Return-risk classifier     AUC model 0.771 vs prior 0.715
Confidence calibration     ECE 0.099 → 0.024
Drift watchdog             stable PSI 0 → continue · shifted PSI 3.404 → fallback
```

> 💡 Screenshot the **whole** report for slide 16's big placeholder — the four
> metric tiles on that slide (51/51, 100%, 100%, Live) all trace back to it.

---

## 3. Live routing — Scenario A (RESTOCK, full glass-box EV table)

**Slide:** 8 (the returned-speaker example)

```bash
curl -s -X POST http://localhost:4000/api/route \
  -H 'Content-Type: application/json' \
  -d '{"gradingResult":{"grade":"A","confidence":0.94,"authenticityMatch":true,"functionallyVerifiable":true,"packagingSealed":true,"defects":[]},"reason":"changed_mind","sku":"B09XYZ1234","sellerType":"1P"}' \
  | python3 -m json.tool
```

**What to show:** `"decision": "restock"`, and the `evBreakdown.paths` array —
every path with its signed `terms`. Key rows to have visible in the crop:

- `restock` **₹1,956 ✓ chosen** — Restock at full recovery `+₹2,299`, FC inbound
  45km `−₹90`, Expected correction cost `−₹55`.
- `warehouse` **−₹465** ← today's flow is the *worst* commercial option.

> 💡 The JSON is long. Either screenshot the top (`decision` + first 2 paths) and
> the `warehouse` path, **or** use this compact one-liner that prints a clean
> per-path EV summary (verified on Python 3.11 — no f-strings, so no escaping
> headaches):
>
> ```bash
> curl -s -X POST http://localhost:4000/api/route -H 'Content-Type: application/json' \
>   -d '{"gradingResult":{"grade":"A","confidence":0.94,"authenticityMatch":true,"functionallyVerifiable":true,"packagingSealed":true,"defects":[]},"reason":"changed_mind","sku":"B09XYZ1234","sellerType":"1P"}' \
>   | python3 -c 'import sys,json
> d=json.load(sys.stdin)
> print("decision:",d["decision"],"| localMargin Rs",d["localMargin"])
> for p in d["evBreakdown"]["paths"]:
>     m = "CHOSEN" if p["path"]==d["decision"] else ("gated" if not p["viable"] else "")
>     print("%-18s Rs %8.0f  %s" % (p["path"], p["evCents"]/100, m))'
> ```
>
> Prints:
> ```
> decision: restock | localMargin Rs 1952
> restock            Rs     1956  CHOSEN
> local_resale       Rs     1952
> refurbish          Rs     1734  gated
> liquidate          Rs      893
> donate             Rs      182
> recycle            Rs        8
> warehouse          Rs     -465
> returnless_refund  Rs      280  gated
> ```

---

## 4. Live routing — Scenario B (LOW-CONFIDENCE COLLAPSE → liquidate pallet)

**Optional** (Q&A backup — not on a slide in this version)

```bash
curl -s -X POST http://localhost:4000/api/route \
  -H 'Content-Type: application/json' \
  -d '{"gradingResult":{"grade":"B","confidence":0.35,"authenticityMatch":true,"functionallyVerifiable":true,"packagingSealed":false,"defects":["minor scuff on body"]},"reason":"changed_mind","sku":"B09XYZ1234","sellerType":"1P"}' \
  | python3 -m json.tool
```

**What to show:** `"decision": "liquidate"`, and the two **gated** paths with their
`gateReason` strings visible:

- `local_resale` → `"gateReason": "confidence 0.35 below the 0.6 gate for local_resale"`
- `refurbish` → `"gateReason": "confidence 0.35 below the 0.5 gate for refurbish"`
- `liquidate` is the surviving commercial path (θ = 0.20, cheapest to correct).

---

## 5. Live checkpoint — Scenario D (LIVE RE-ROUTE restock → local_resale)

**Slide:** 10 (the live re-route). This is the money shot — capture the UI too.

```bash
# BEFORE — doorstep, sealed grade A
curl -s -X POST http://localhost:4000/api/route -H 'Content-Type: application/json' \
  -d '{"gradingResult":{"grade":"A","confidence":0.94,"authenticityMatch":true,"functionallyVerifiable":true,"packagingSealed":true,"defects":[]},"reason":"changed_mind","sku":"B09XYZ1234","sellerType":"1P"}' \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print("BEFORE  decision:",d["decision"],"| ttlHours:",d["ttlHours"])'

# AFTER — hub bench overrides A→B, seal broken → engine re-runs
curl -s -X POST http://localhost:4000/api/return/checkpoint -H 'Content-Type: application/json' \
  -d '{"gradingResult":{"grade":"A","confidence":0.94,"authenticityMatch":true,"functionallyVerifiable":true,"packagingSealed":true,"defects":[]},"reason":"changed_mind","sku":"B09XYZ1234","sellerType":"1P","from":"at_local_hub","evidence":{"source":"hub_bench","observedGrade":"B","packagingSealed":false,"functionalCheckPassed":true}}' \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);dec=d["decision"];t=d["transition"];print("AFTER   decision:",dec["decision"]);print("        ",dec["reasoning"]);print("        transition:",t["from"],"→",t["to"])'
```

**Expected:**

```
BEFORE  decision: restock | ttlHours: 24
AFTER   decision: local_resale
         Hub bench overrode grade A → B; engine re-ran and routed to local_resale.
        transition: at_local_hub → hub_verified
```

> 💡 **Better for slide 11:** capture this live in the UI instead of / in addition
> to the terminal. Log in as **techbazaar** → **Hub Bench** → select the staged
> return → toggle the seal to broken → watch the decision flip `restock →
> local_resale` on screen. Screenshot the before/after of that panel.

---

## 6. Liquidation-lot engine — pallet auction + manifest premium + ship-vs-wait

**Optional** (Q&A backup for the "graded lot" row on slide 8/11). Committed at
`apps/api/src/scripts/lot-trace.ts`.

```bash
cd /Users/damankhurana/hack
pnpm --filter @reloop/api exec tsx src/scripts/lot-trace.ts
```

**Expected (real):**

```
Winning buyer:      refurbisher
  gross             ₹31,877
  Amazon take (10%) ₹3,188
  seller proceeds   ₹28,689
  Manifest premium (Health-Card coverage 90%)    ₹9,893
Second-best (auto re-match if the deal falls through): wholesaler ₹23,803
Manifested (90% Health-Card): ₹28,689
Mystery lot  (0% manifest):   ₹19,786
Premium the manifest earns:   ₹8,904 (+45%)
ship-vs-wait  40/40 → shipNow=true  Pallet full (40/40) — ship now
```

---

## 7. Notifications / cascade logs (optional — needs MongoDB configured)

**Optional** (Q&A backup — cascade/notification behaviour). If you have Mongo
wired, the API prints these on boot and every 30-min cron tick:

```
{"level":"info","msg":"matching cascade scheduled","cron":"*/30 * * * *"}
{"level":"info","msg":"matching cascade complete","timeoutsAdvanced":1,"searchesRetried":2,"candidatesFound":1,"sessionsExpired":0}
{"level":"warn","msg":"match session expired — falling back to warehouse","returnId":"..."}
```

You can also screenshot your **API terminal** after making the curl calls above —
each request emits a structured access log line, handy if a judge asks about
logging/observability:

```
{"level":"info","time":"...","msg":"request","reqId":"...","method":"POST","path":"/api/route","status":200,"durationMs":3}
```

---

## Slide → screenshot cheat sheet (this version of the deck)

Only three slides have a "📸 PASTE SCREENSHOT HERE" box:

| Slide | What goes there | Command |
|---|---|---|
| **8**  | The speaker's option-by-option breakdown | Scenario A curl (§3) |
| **10** | The live re-route (terminal **and/or** the Hub UI) | Scenario D curl (§5) + Hub screen |
| **16** | Full self-test — the four metric tiles trace to this | `pnpm eval` + `pnpm test:edge` (§1–2) |

Sections **§4** (low-confidence collapse) and **§6** (lot engine) are optional
Q&A backups — no slide needs them, but they're great live answers.

Everything is reproducible from a clean checkout — that's the point. If a judge
asks "is this real or hardcoded?", run any of these live.
