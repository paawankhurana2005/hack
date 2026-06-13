# Spec 004 — Sell Flow, Phase 4: Product Health Card

**Status:** Shipped & verified end-to-end 2026-06-13 (real endpoint, authenticity
rule, web build, strict typecheck).

## Goal
Turn `/sell/health-card` into the real **trust layer**: assemble the grade +
price into a verifiable Product Health Card with condition, authenticity, history,
listing price, and a shareable link that "travels with the item to its next owner".

## Scope

### In scope
- **Shared:** enrich `ProductHealthCard` (confidence, summary, detectedIssues,
  listingPrice, issuedAt); add `HealthCardRequest`.
- **Backend:** `HealthCardService` + `POST /api/sell/health-card`. **Pure
  assembly** from the grade + price already computed — no external/model call, so
  it cannot fail on an upstream and is instant.
  - **Authenticity rule:** if a model/serial number (≥4 consecutive digits) is
    present in the title or notes (e.g. a shoe's `392434-01` label), mark
    `authenticityVerified` + add a "Verified by model number" history event.
  - History: Graded → Priced → (Verified) → Health Card issued.
  - Generates id + stub shareable `healthCardUrl`.
- **Frontend:** `/sell/health-card` auto-issues the card on mount from the
  grading + pricing in context; loading / success / error(+retry) / no-input
  states. Renders a trust card: title, grade + authenticity badges, summary,
  condition notes, history timeline, listing price, and a copy-able link.
  - Sell-flow context carries `card`; a fresh grade or price clears it.

### Out of scope
- Persistence — the card isn't stored, so the shareable URL is a stub.
- Real authenticity verification (serial lookup, provenance) — heuristic for now.
- Handoff (Phase 5), done (Phase 6).

## Data contract (`packages/shared/src/health-card.ts`)
`ProductHealthCard { id, productId, title, grade, confidence, summary,
detectedIssues, authenticityVerified, listingPrice?: Money, history:
HealthCardEvent[], healthCardUrl, issuedAt }`;
`HealthCardRequest { draft, grading: GradingResult, pricing: PricingResult }`.
The client strips `grading.photoUrls` before sending (the card doesn't need the
base64 images).

## Acceptance criteria
1. `POST /api/sell/health-card` returns a `ProductHealthCard` assembled from the
   grade + price; bad input → 400. No external call, so no 502 path.
2. Authenticity is true iff a model/serial number appears in title/notes; the
   history reflects it. (Verified: Puma `392434-01`; unverified: title "shoes".)
3. `/sell/health-card` auto-issues from context and renders the card with a
   working copy-link; states behave (no-input when grade/price missing).
4. `pnpm -r typecheck` passes; web builds.
5. Handoff/done remain placeholders.

## Verified example
Puma (with model number) → verified card, grade `fair`, listing `$34.00`, full
history incl. "Verified by model number". Generic "shoes" → unverified.

## Notes for later
- Persist cards so the shareable URL resolves to a real public card page.
- Stronger authenticity (serial/provenance lookups).
- Feed the card into the local match / handoff (Phase 5).
