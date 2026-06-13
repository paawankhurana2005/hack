# Spec 003 — Sell Flow, Phase 2: Routing / Pricing

**Status:** Shipped & verified end-to-end 2026-06-12 (real `meta/llama-3.3-70b-instruct`
market estimate + deterministic discount, validation paths, web build, strict typecheck).

## Goal
Turn the Sell-flow "routing" screen (`/sell/routing`) into a real **pricing
recommendation**. Anchored to the graded condition from Phase 2, it estimates the
item's typical online (Amazon) retail price, applies a transparent condition-based
discount, and recommends a resale price with an LLM-narrated rationale.

This realises the user's vision: *look up the online price → suggest a discounted
resale price → reflect how worn the item is.*

## Scope

### In scope
- **Shared:** `PricingResult`, `PriceRequest`, `PricingFactor`, `DemandLevel`.
- **Backend:**
  - A shared **NVIDIA chat client** (`services/nvidia/client.ts`) — the grading
    (vision) and pricing (text) services now share one HTTP + JSON-extraction path.
  - A **`MarketProvider`** interface + **NVIDIA text provider** (`llama-3.3-70b`)
    that estimates typical new retail price (USD) + resale demand + a market note.
  - A **`PricingService`**: the model supplies market knowledge; the service
    deterministically sets the resale price (glass-box).
  - `POST /api/sell/price` → `PricingResult` (200) or `ApiError` (400/502).
- **Frontend:**
  - `/sell/routing` becomes real: auto-prices on mount using the grading result,
    with loading / success / error(+retry) / no-input states.
  - Sell-flow context carries `pricing`; a fresh grade clears stale pricing.
  - `priceItem` added to the API client (refactored to a shared `postJson`).

### Out of scope
- **Live** Amazon price scraping — retail is an **AI estimate**, labelled as such.
- Non-USD currency (INR is a later swap; `Money` is USD today).
- Local buyer matching (the handoff phase), health card, done.
- Persistence/auth.

## Pricing logic (glass-box)
1. LLM (`llama-3.3-70b`) → `{ estimatedRetailUsd, demand, note }`.
2. Retail clamped to a sane range ($1–$10,000).
3. Resale **factor by condition**: new .80 / like-new .70 / good .55 / fair .40 /
   poor .22, nudged by demand (high +.05, low −.05), clamped to [.10, .90].
4. `suggestedPrice = retail × factor`; `discountPct = 1 − factor`.
5. Rationale = the model's market note + the deterministic discount reasoning.
   Factors (retail, condition, demand, factor) are surfaced for the explanation.

The model narrates; the math is deterministic and auditable.

## Data contracts (`packages/shared/src/pricing.ts`)
`PricingResult { id, productId, grade, estimatedRetail: Money, suggestedPrice:
Money, discountPct, demand, rationale, factors: PricingFactor[], pricedAt }`;
`PriceRequest { draft, grade, detectedIssues }`; `DemandLevel = low|medium|high`.

## Config / APIs
- `PRICING_MODEL` (default `meta/llama-3.3-70b-instruct`), reuses `NVIDIA_API_KEY`
  + `NVIDIA_BASE_URL`. One NVIDIA account key serves both vision + text models
  (verified).

## Acceptance criteria
1. `POST /api/sell/price` returns a `PricingResult` with an AI-estimated retail, a
   condition-discounted suggested price, demand, factors, and a narrated rationale.
2. `/sell/routing` auto-prices from the grading result and shows
   loading/success/error/no-input; the price persists in context across the flow.
3. Bad input (unknown grade) → 400; provider failure → 502; server never crashes.
4. Discount is deterministic and matches the grade/demand rule; retail is clamped.
5. `pnpm -r typecheck` passes (strict, no `any`); web builds.
6. Downstream (health card / handoff / done) remain placeholders.

## Verified example
PUMA Slipstream, `fair`: est. retail **$80** → suggested **$32 (60% off)**, demand
medium, rationale narrating the model's popularity + the discount.

## Reliability hardening (added during integration)
- **Never-zero retail:** the prompt forbids returning 0; generic titles (e.g.
  "shoes") must be priced from the category.
- **Retry + category fallback:** if the model still returns 0/invalid, retry once,
  then fall back to a per-category default — pricing never hard-fails on a
  generic title.
- Shares the same 45s timeout via the NVIDIA client.

## Notes for later
- Swap AI-estimated retail for a real price source when available; add INR.
- Feed pricing into the Health Card (Phase 4) and local match (Phase 5).
