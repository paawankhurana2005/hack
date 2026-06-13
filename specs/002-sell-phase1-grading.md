# Spec 002 — Sell Flow, Phase 1: Intent capture + real AI grading

**Status:** Shipped & verified end-to-end 2026-06-12 (real `meta/llama-3.2-90b-vision-instruct`
grading, validation error paths, web build, strict typecheck).

## Goal
Turn the first two Sell-flow screens from placeholders into real functionality:
the user describes an item and uploads photo(s) (`/sell`), the backend runs a
real **vision-language model** to assess condition, and the result renders as a
genuine `GradingResult` (`/sell/grading`). This delivers the **AI Grading pillar
("the eyes")** end-to-end for the Sell flow.

Everything downstream (routing, health card, handoff, done) stays a placeholder
this phase.

## Scope

### In scope
- **Shared contracts:** add the request/response and item-draft types for grading.
- **Backend (`apps/api`):**
  - A `GradingService` behind a **`VlmProvider` interface** (provider-agnostic).
  - An NVIDIA provider implementation (configurable model via env).
  - `POST /api/sell/grade` — accepts item draft + base64 image(s), returns a
    `GradingResult`.
  - Config/secrets via `.env` (NVIDIA key stays server-side), CORS for the web app,
    request validation, and structured error responses.
- **Frontend (`apps/web`):**
  - `/sell` becomes a real **intent + capture** form: category/title/notes +
    photo upload with **client-side downscale/compress** (stay under provider's
    inline image limit).
  - A small **Sell-flow context** (in the existing `sell/layout`) holding the
    in-progress draft + grading result in memory across the two screens.
  - `/sell/grading` shows live states: idle → uploading/grading → result (grade,
    confidence, detected issues, summary, thumbnails) → error w/ retry.
  - A typed `apiClient` helper for talking to `apps/api`.

### Out of scope (unchanged placeholders)
- `/sell/routing`, `/sell/health-card`, `/sell/handoff`, `/sell/done`.
- The entire Return flow and Seller dashboard.
- Persistence/DB — grading is computed on demand and held in memory only.
- Auth, accounts, rate limiting, the assets API for large images.
- Pricing logic (lives in the Routing phase).

## APIs / external dependencies — RESOLVED
- **Provisioned & chosen:** `meta/llama-3.2-90b-vision-instruct` on NVIDIA's
  OpenAI-compatible chat API (`https://integrate.api.nvidia.com/v1/chat/completions`).
  Instruction-following VLM → returns structured JSON per image.
- **One image per request (hard limit on the hosted endpoint).** So multi-angle
  grading is **one model call per photo, in parallel**, then a deterministic
  glass-box **aggregation**: overall grade = the most-worn angle; `detectedIssues`
  = de-duplicated union across angles; confidence = mean. More angles catch more —
  which is the point of grading at the source. Partial failures are tolerated
  (grade with whatever angles succeed); all-fail → 502.
- **Image format:** OpenAI-style content array —
  `{ type: 'text', ... }` + one `{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,…' } }`.
  Inline data URLs kept small via client-side downscale; capped at **4 images/item**.
- The provider interface still abstracts the model, so PaliGemma or a text LLM can
  be slotted in later via config + one file.
- **Env (server-side only):**
  `NVIDIA_API_KEY`, `NVIDIA_BASE_URL` (default `https://integrate.api.nvidia.com/v1`),
  `GRADING_MODEL` (default `meta/llama-3.2-90b-vision-instruct`),
  `GRADING_PROVIDER` (`chat-vlm`). An `.env.example` documents them; real `.env`
  is gitignored. (A second key — the PaliGemma key — can be parked in `.env` for
  later phases but is unused in Phase 1.)

## Demo items (added per request)
To make demos smooth, `/sell` offers **"Try a sample item"**: 5 curated products
preloaded with real, license-free **Unsplash** images (free for commercial use,
no attribution required). Picking one loads its photo(s) into the same capture
state a user upload would, then grades it **for real** through the VLM — so the
demo shows genuine model output, not canned results.

The 5 (verified, single-product shots across categories):

| Sample | Category | Why it demos well |
|---|---|---|
| Nike running sneakers | sports | visible scuffs / sole wear |
| Over-ear headphones | electronics | ear-pad wear, scratches |
| Leather handbag | fashion | leather condition, hardware |
| Smartphone (screen on) | electronics | screen + body condition |
| Mirrorless camera + lenses | electronics | body wear, lens glass |

Images are downloaded at build time into `apps/web/public/demo/` (committed,
same-origin so they flow through the exact upload→downscale→grade pipeline). A
short Unsplash credit goes in the README.

## Data contracts (`packages/shared`)
New file `src/sell.ts` (+ re-export from `index.ts`). Extend `GradingResult`
minimally.

```ts
// sell.ts
export type ItemCategory =
  | 'electronics' | 'home' | 'fashion' | 'sports' | 'toys' | 'books' | 'other';

/** What the user provides on the Sell entry screen. */
export interface SellItemDraft {
  title: string;
  category: ItemCategory;
  notes?: string;
}

/** Request body for POST /api/sell/grade. Images are base64 (no data: prefix). */
export interface GradeRequest {
  draft: SellItemDraft;
  imagesBase64: string[];   // 1..N downscaled JPEGs
}

/** Standard API error envelope. */
export interface ApiError {
  error: { code: string; message: string };
}
```

```ts
// grading.ts — extend GradingResult with one human-readable field
export interface GradingResult {
  id: ID;
  productId: ID;
  grade: ConditionGrade;
  confidence: number;          // 0..1
  detectedIssues: string[];
  summary: string;             // NEW: one-line plain-English condition summary
  photoUrls: string[];         // echoed thumbnails (data URLs) for the demo
  gradedAt: string;            // ISO timestamp
}
```

`POST /api/sell/grade` returns `GradingResult` on success (200) or `ApiError`
(4xx/5xx).

## Behavior — grading service
1. Validate request (≥1 image, sane sizes, known category).
2. Build a condition-assessment prompt instructing the model to return JSON:
   `{ grade, confidence, detectedIssues[], summary }`, with `grade` constrained to
   the `ConditionGrade` union and `confidence` in 0..1.
3. Call the configured provider with the image(s) + prompt.
4. Parse + **defensively validate** the model output; clamp/normalize (e.g. coerce
   an out-of-range confidence, default issues to `[]`). If parsing fails, return a
   `502 grading_failed` `ApiError` — never crash, never fabricate a grade silently.
5. Assemble the `GradingResult` (generate ids + `gradedAt`, echo thumbnails).

The grade is **model-driven**, not hardcoded. The deterministic part is only the
plumbing (validation, normalization, assembly).

## UI / behavior
- **`/sell`** — form: title (text), category (select), notes (optional), photo
  picker (`<input type="file" accept="image/*" multiple>` + drag/drop). On select,
  downscale to ~max 1024px and JPEG-compress in-browser via `<canvas>` to stay
  under the inline limit; show thumbnails. **"Try a sample item"** row above the
  form: clicking a sample fills the title/category and loads its bundled image(s)
  through the same downscale pipeline. "Start grading" stores the draft+images in
  Sell-flow context and routes to `/sell/grading`.
- **`/sell/grading`** — on mount, if a draft exists, POST to the API and show:
  - loading: a "Reading your photos…" state;
  - success: grade badge, confidence, detected-issues list, summary, thumbnails,
    and the existing FlowNav → `/sell/routing`;
  - error: message + "Try again"; if no draft in context, prompt to go back to
    `/sell`.
- StepIndicator and overall design system unchanged.

## Affected files
**Create**
- `packages/shared/src/sell.ts`
- `apps/api/src/config.ts` — env loading/validation
- `apps/api/src/services/grading/types.ts` — `VlmProvider` interface
- `apps/api/src/services/grading/nvidia-provider.ts`
- `apps/api/src/services/grading/grading-service.ts`
- `apps/api/src/routes/sell.ts` — `POST /api/sell/grade`
- `apps/api/.env.example`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/lib/image.ts` — client-side downscale/compress
- `apps/web/src/app/sell/sell-flow-context.tsx` — in-memory draft + result
- `apps/web/src/mock/demo-items.ts` — 5 curated demo products (title, category, image paths)
- `apps/web/public/demo/*.jpg` — 5 bundled Unsplash images (downloaded at build)
- `apps/web/src/components/sell/sample-picker.tsx` — "Try a sample item" row

**Change**
- `packages/shared/src/grading.ts` — add `summary`
- `packages/shared/src/index.ts` — re-export `sell.ts`
- `apps/api/src/index.ts` — mount CORS + sell routes
- `apps/api/package.json` — add `cors`, `dotenv`, `zod` (+ `@types/cors`)
- `apps/web/src/app/sell/layout.tsx` — wrap children in the Sell-flow provider
- `apps/web/src/app/sell/page.tsx` — real intent + capture form
- `apps/web/src/app/sell/grading/page.tsx` — real grading states
- `apps/web/.env.local.example` — `NEXT_PUBLIC_API_BASE_URL`

## Acceptance criteria
1. With a valid `NVIDIA_API_KEY` + provisioned model in `apps/api/.env`, uploading
   a photo on `/sell` and continuing produces a **real, model-derived**
   `GradingResult` on `/sell/grading` (grade + confidence + issues + summary).
2. `POST /api/sell/grade` returns a typed `GradingResult` (200) or a typed
   `ApiError` (4xx/5xx); bad input (no image) returns `400`, provider failure
   returns `502` — the server never crashes.
3. The NVIDIA key is **only** read server-side from env; it appears in no frontend
   bundle and no committed file. `.env` is gitignored; `.env.example` is committed.
4. Swapping `GRADING_PROVIDER` / `GRADING_MODEL` in env changes the model with no
   code change beyond config.
5. Images are downscaled client-side before upload; oversized images don't fail
   the request.
6. `/sell/grading` correctly shows loading, success, and error states (error path
   verifiable by stopping the API).
7. `pnpm -r typecheck` passes (strict, no `any`); `apps/web` builds.
8. Routing/health-card/handoff/done remain placeholders; the StepIndicator still
   reflects the right step.
9. **"Try a sample item"** on `/sell` loads any of the 5 demo products and runs
   them through the real grading pipeline, producing a real `GradingResult`.

## Resolved decisions (from your answers)
1. **Model:** `meta/llama-3.2-90b-vision-instruct` (chat-VLM), single call. ✅
2. **Multiple photos:** yes — up to 4/item. ✅
3. **Grade taxonomy:** keep 5-level `new|like-new|good|fair|poor`. ✅
4. **Demo data:** 5 curated Unsplash products bundled + "Try a sample item". ✅

## Reliability hardening (added during integration)
Real-world fixes after testing against the live NVIDIA endpoint:
- **Sequential grading**, not parallel — the hosted VLM rejects/queues concurrent
  requests from one key, which hung the whole grade. One image at a time.
- **45s per-call timeout** (AbortController) — a stuck upstream fails cleanly
  instead of hanging forever.
- **Retry-on-non-JSON** — the VLM occasionally answers in prose; we retry once
  with a firm "JSON only" nudge, then surface what it actually said.
- **Adaptive client compression** — shrink each image until its base64 is under
  ~160KB; smaller payloads = faster, more reliable calls.
- **Removed `crossOrigin` on image load** — it made Chrome hang on `blob:` file
  URLs, so uploads silently never appeared.
- **Tolerant upload handler** — per-file `allSettled`, "limit reached" / partial
  failure messages instead of silent drops.

## Known polish (minor)
- `detectedIssues` are unioned across angles with exact-match de-dup, so near
  duplicates ("scuffing on toe" vs "scuff marks on toe") can both appear.

## Open question (one left)
- **Confidence source:** Llama-3.2-vision will be *asked* to self-report a 0..1
  confidence in the JSON. If it's unreliable/missing, OK for me to fall back to a
  coarse derived value (and keep the field honest)? Assuming yes unless you object.
```

