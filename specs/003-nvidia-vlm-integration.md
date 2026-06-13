# Spec 003 — NVIDIA NIM Integration (Backend API Layer)

## Goal

Replace the three mock call sites in the return flow with real NVIDIA NIM model calls, wired through a new Express API layer. The frontend continues running on its existing mock functions — frontend wiring is a separate spec (004). This spec delivers real AI grading, AI narration, and AI health-card generation behind three typed, gracefully-degrading API endpoints.

Architecture principle from CLAUDE.md: the routing DECISION is deterministic TypeScript rules (glass-box). The LLM narrates. Logic decides.

## Scope

### In scope
- `apps/api/src/lib/nvidia-client.ts` — single NVIDIA NIM HTTP client
- `apps/api/src/lib/errors.ts` — typed error classes
- `apps/api/src/lib/env.ts` — env validation + mock-mode flag
- `apps/api/src/lib/mocks.ts` — API-local mock fallbacks (typed against `@reloop/shared`; does NOT import from `apps/web`)
- `apps/api/src/lib/routing-engine.ts` — deterministic TypeScript routing rules
- `apps/api/src/routes/grade.ts` — POST /api/grade
- `apps/api/src/routes/route.ts` — POST /api/route
- `apps/api/src/routes/health-card.ts` — POST /api/health-card
- `apps/api/src/index.ts` — register routes, add `express.json()` middleware
- `apps/api/.env.example` — document required env vars
- `packages/shared/src/return.ts` — add `ReturnHealthCard` type
- `packages/shared/src/index.ts` — already re-exports `return.ts`; no change needed

### Out of scope (explicitly)
- `apps/web` — zero changes. Frontend continues using mock functions from `apps/web/src/lib/mocks/return-flow.ts`. Frontend-to-API wiring is spec 004.
- Real inventory data, real demand signals, or real SKU pricing — routing engine uses mock pricing keyed on SKU/category.
- Authentication or session management on the API.
- CORS headers — not needed until spec 004 wires the frontend. Add as a one-liner note in `index.ts` when that spec lands.
- The sell flow (`/sell/*`), seller dashboard, Prevention pillar.
- The scaffold-era `ProductHealthCard` type — untouched.

## Affected files

| Action | File |
|--------|------|
| Create | `apps/api/src/lib/nvidia-client.ts` |
| Create | `apps/api/src/lib/errors.ts` |
| Create | `apps/api/src/lib/env.ts` |
| Create | `apps/api/src/lib/mocks.ts` |
| Create | `apps/api/src/lib/routing-engine.ts` |
| Create | `apps/api/src/routes/grade.ts` |
| Create | `apps/api/src/routes/route.ts` |
| Create | `apps/api/src/routes/health-card.ts` |
| Update | `apps/api/src/index.ts` |
| Create | `apps/api/.env.example` |
| Update | `packages/shared/src/return.ts` |

## Data contracts

### New type: `ReturnHealthCard` — add to `packages/shared/src/return.ts`

This is the LLM-generated health card content returned from `/api/health-card`. It is distinct from the scaffold-era `ProductHealthCard` in `health-card.ts` (which uses `ConditionGrade` and is scoped to the sell flow).

```ts
// packages/shared/src/return.ts — append to existing exports

export interface ReturnHealthCard {
  summary: string;              // 1–2 sentences, plain English condition summary
  verifiedAttributes: string[]; // what was actually checked from photos
  notVerified: string[];        // what could not be verified from photos alone
  trustScore: number;           // 0–100
}
```

### Request/response shapes for the three routes

These are not exported from `packages/shared` — they are Express-internal contracts. Defined as TypeScript interfaces in each route file.

```ts
// POST /api/grade
interface GradeRequest {
  photos: string[];       // base64-encoded image strings
  reason: ReturnReason;
  sku: string;
}
type GradeResponse =
  | ReturnGradingResult                    // success
  | { fallback: true; decision: 'warehouse' }; // any failure

// POST /api/route
interface RouteRequest {
  gradingResult: ReturnGradingResult;
  reason: ReturnReason;
  sku: string;
  sellerType: '1P' | '3P';
}
type RouteResponse =
  | ReturnRoutingDecision                  // success
  | { fallback: true; decision: 'warehouse' }; // any failure

// POST /api/health-card
interface HealthCardRequest {
  gradingResult: ReturnGradingResult;
  orderId: string;
  productName: string;
}
type HealthCardResponse =
  | ReturnHealthCard                       // success
  | { fallback: true; summary: string };  // any failure
```

## API behavior

### Shared: NVIDIA NIM client — `apps/api/src/lib/nvidia-client.ts`

Single export:

```ts
interface NvidiaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | NvidiaContentBlock[];
}

interface NvidiaContentBlock {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string }; // "data:image/jpeg;base64,..."
}

async function nvidiaChat(params: {
  model: string;
  messages: NvidiaMessage[];
  maxTokens?: number;    // default 512
  temperature?: number;  // default 0.2
}): Promise<string>      // returns choices[0].message.content
```

Implementation rules:
- Base URL: `https://integrate.api.nvidia.com/v1/chat/completions`
- Auth header: `Authorization: Bearer ${env.NVIDIA_API_KEY}`
- `Content-Type: application/json`
- 30-second fetch timeout via `AbortController`
- Non-200 response → throw `NvidiaApiError(status, body)`
- Returns `response.choices[0].message.content` as a string, trimmed
- No error swallowing — callers decide fallback behavior

---

### Shared: Error types — `apps/api/src/lib/errors.ts`

```ts
export class NvidiaApiError extends Error {
  constructor(public readonly status: number, public readonly body: string) {
    super(`NVIDIA API error ${status}: ${body.slice(0, 200)}`);
    this.name = 'NvidiaApiError';
  }
}

export class GradingServiceError extends Error {
  constructor(message: string) { super(message); this.name = 'GradingServiceError'; }
}

export class RoutingNarrationError extends Error {
  constructor(message: string) { super(message); this.name = 'RoutingNarrationError'; }
}

export class HealthCardError extends Error {
  constructor(message: string) { super(message); this.name = 'HealthCardError'; }
}
```

---

### Shared: Env validation — `apps/api/src/lib/env.ts`

Runs once at module load. Exports:

```ts
export const env = {
  NVIDIA_API_KEY: process.env.NVIDIA_API_KEY ?? '',
  PORT: Number(process.env.PORT ?? 4000),
};

export const MOCK_MODE: boolean = env.NVIDIA_API_KEY === '';
```

On startup, if `MOCK_MODE` is true: log `[reloop/api] NVIDIA_API_KEY not set — running in mock mode`. Never throw. Never crash.

---

### Shared: API-local mocks — `apps/api/src/lib/mocks.ts`

Mirrors the behavior of `apps/web/src/lib/mocks/return-flow.ts` but lives entirely within `apps/api`. Typed against `@reloop/shared`. Does NOT import anything from `apps/web`.

Exports:
- `mockGradeResult(reason: ReturnReason): ReturnGradingResult` — sync, returns a high-confidence grade A result
- `mockRoutingResult(reason: ReturnReason): ReturnRoutingDecision` — sync, returns a local_resale result (or `recycle` if `arrived_damaged`, `warehouse` if `wrong_item`)
- `mockHealthCard(gradingResult: ReturnGradingResult): ReturnHealthCard` — sync, builds from grade fields

These are only used by route handlers when `MOCK_MODE === true` or when a real call fails.

---

### Shared: Routing engine — `apps/api/src/lib/routing-engine.ts`

Deterministic TypeScript function — no LLM, no randomness. Called by `/api/route` before the NVIDIA narration call.

```ts
interface RoutingInputs {
  grade: ReturnGradingResult['grade'];
  reason: ReturnReason;
  sku: string;
  sellerType: '1P' | '3P';
  authenticityMatch: boolean;
  functionallyVerifiable: boolean;
}

interface RoutingComputed {
  decision: ReturnRoutingDecision['decision'];
  residualValue: number;       // INR, estimated resale value
  localHandlingCost: number;   // INR, cost to handle locally
  nearbyBuyers: number;        // mock count keyed on SKU category
  radiusKm: number;
  co2SavedKg: number;
  dwellBudgetHours: number;
  sellerType: '1P' | '3P';
  fallbackChain: ReturnRoutingDecision['decision'][];
}

export function computeRouting(inputs: RoutingInputs): RoutingComputed
```

**Rules (applied in order; first match wins):**

| Condition | Decision |
|-----------|----------|
| `sellerType === '3P'` | `return_to_seller` |
| `reason === 'counterfeit'` or `reason === 'not_as_described'` | `return_to_seller` |
| `reason === 'wrong_item'` | `warehouse` |
| `authenticityMatch === false` | `warehouse` |
| `grade === 'Salvage'` or `grade === null` | `recycle` |
| `reason === 'arrived_damaged'` | `recycle` |
| `residualValue - localHandlingCost < 300` | `donate` |
| `grade === 'C'` and `!functionallyVerifiable` | `refurbish` |
| `grade === 'B'` and `!functionallyVerifiable` | `refurbish` |
| `residualValue - localHandlingCost >= 300` and `nearbyBuyers >= 3` | `local_resale` |
| default | `warehouse` |

**Mock pricing (keyed on SKU category, derived from first three characters of SKU):**
- Electronics (SKU starts with `B09`): `residualValue = 2499`, `localHandlingCost = 380`, `nearbyBuyers = 8`, `radiusKm = 4`, `co2SavedKg = 2.4`
- Apparel (SKU starts with `B08`): `residualValue = 799`, `localHandlingCost = 220`, `nearbyBuyers = 5`, `radiusKm = 3`, `co2SavedKg = 0.8`
- Kitchenware (SKU starts with `B07`): `residualValue = 599`, `localHandlingCost = 180`, `nearbyBuyers = 4`, `radiusKm = 3`, `co2SavedKg = 0.6`
- Unknown: `residualValue = 500`, `localHandlingCost = 300`, `nearbyBuyers = 2`, `radiusKm = 5`, `co2SavedKg = 0.5`

`dwellBudgetHours`: `local_resale` → 48, `refurbish` → 72, `donate` → 96, others → 0.

`fallbackChain`: `local_resale` → `['donate', 'recycle']`, `refurbish` → `['warehouse']`, `donate` → `['recycle']`, others → `[]`.

---

### Route 1: POST /api/grade — `apps/api/src/routes/grade.ts`

**Request:** `{ photos: string[], reason: ReturnReason, sku: string }`

**Validation:** `photos` must be an array (may be empty if no photos were uploaded). `reason` must be a valid `ReturnReason`. If validation fails → `400` with `{ error: string }`.

**NVIDIA call (vision model):**

Model: `meta/llama-3.2-90b-vision-instruct`

System prompt (verbatim):
```
You are a product condition grading assistant. Analyze the provided product photos and return ONLY valid JSON with no preamble, explanation, or markdown fences. The JSON must have exactly these fields: grade (one of: "A", "B", "C", "Salvage"), confidence (number 0-1), defects (array of strings), authenticityMatch (boolean), wardrobingFlag (boolean), functionallyVerifiable (boolean).
```

User message content array: one `image_url` block per photo (`data:image/jpeg;base64,<photo>`), followed by one `text` block:
```
Return reason: {reason}. Assess this item's condition and return JSON only.
```

If `photos` is empty or `MOCK_MODE === true`: skip the NVIDIA call, return `mockGradeResult(reason)`.

**Response parsing:**
1. Strip leading/trailing whitespace
2. If wrapped in ` ```json ... ``` ` fences: strip them
3. `JSON.parse` the result
4. Validate: `grade` ∈ `['A','B','C','Salvage']`, `confidence` is a number in 0–1, `defects` is `string[]`, `authenticityMatch`/`wardrobingFlag`/`functionallyVerifiable` are booleans
5. If any validation fails: throw `GradingServiceError`
6. Append `rawReason: reason` to form a complete `ReturnGradingResult`

**On any error** (network, parse, `GradingServiceError`, timeout): return `200` with `{ fallback: true, decision: 'warehouse' }`. Never return 500 to the client.

`maxTokens`: 256. `temperature`: 0.1.

---

### Route 2: POST /api/route — `apps/api/src/routes/route.ts`

**Request:** `{ gradingResult: ReturnGradingResult, reason: ReturnReason, sku: string, sellerType: '1P' | '3P' }`

**Step A — deterministic routing (no LLM):**

Call `computeRouting({ grade, reason, sku, sellerType, authenticityMatch, functionallyVerifiable })` from `routing-engine.ts`. This produces a `RoutingComputed` object with `decision` and all numeric inputs.

For `decision === 'return_to_seller'`: skip the NVIDIA narration call. Use hardcoded reasoning:
- `'3P seller not opted into ReLoop local routing. Item returned per seller policy.'`

**Step B — NVIDIA narration call (text model):**

Model: `meta/llama-3.1-70b-instruct`

System prompt:
```
You are a logistics assistant. Write exactly one plain English sentence explaining this routing decision. No jargon. Be specific about the numbers. Maximum 30 words.
```

User message (JSON stringified `RoutingComputed` numbers):
```json
{
  "decision": "<decision>",
  "residualValue": <number>,
  "localHandlingCost": <number>,
  "nearbyBuyers": <number>,
  "radiusKm": <number>,
  "co2SavedKg": <number>
}
```

Take the text response verbatim as `reasoning`. Strip leading/trailing whitespace.

**Fallback** if NVIDIA call fails or `MOCK_MODE === true`:
```
Value ₹{residualValue} exceeds handling cost ₹{localHandlingCost}. {nearbyBuyers} buyers within {radiusKm}km. Routed to {decision}.
```

**Final response:** a complete `ReturnRoutingDecision`:
```ts
{
  decision,
  reasoning,          // from LLM or fallback template
  co2SavedKg,
  dwellBudgetHours,
  sellerType,
  fallbackChain,
}
```

On any unrecoverable error: return `200` with `{ fallback: true, decision: 'warehouse' }`.

`maxTokens`: 64. `temperature`: 0.3.

---

### Route 3: POST /api/health-card — `apps/api/src/routes/health-card.ts`

**Request:** `{ gradingResult: ReturnGradingResult, orderId: string, productName: string }`

**NVIDIA call (text model):**

Model: `meta/llama-3.1-70b-instruct`

System prompt:
```
You are writing a product condition summary for a second-hand buyer. Be factual, concise, and trustworthy. Return ONLY valid JSON with no preamble or markdown fences.
```

User message: `JSON.stringify(gradingResult)`

Expected JSON shape from model:
```json
{
  "summary": "string",
  "verifiedAttributes": ["string"],
  "notVerified": ["string"],
  "trustScore": 0
}
```

**Response parsing:** same strip-fences → `JSON.parse` → validate pattern as `/api/grade`. Required fields: `summary` (non-empty string), `verifiedAttributes` (string[]), `notVerified` (string[]), `trustScore` (number 0–100). If any field fails → throw `HealthCardError`.

**On any error** (network, parse, `HealthCardError`, timeout, `MOCK_MODE === true`): return a minimal fallback built from raw `gradingResult` fields — never block:
```ts
{
  fallback: true,
  summary: `Item assessed as Grade ${gradingResult.grade ?? 'unknown'}. ${gradingResult.defects.length} issue(s) detected.`,
}
```

`maxTokens`: 256. `temperature`: 0.2.

---

### Updated `apps/api/src/index.ts`

Add before route registration:
```ts
app.use(express.json({ limit: '10mb' })); // photos are base64 — need a generous limit
```

Register routes:
```ts
app.post('/api/grade', gradeRouter);
app.post('/api/route', routeRouter);
app.post('/api/health-card', healthCardRouter);
```

Import `env` and `MOCK_MODE` from `lib/env.ts` and log mock-mode status on startup.

---

### `apps/api/.env.example`

```
# NVIDIA NIM API key — get yours at build.nvidia.com
NVIDIA_API_KEY=nvapi-xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Express server port (default: 4000)
PORT=4000
```

## Acceptance criteria

- [ ] POST /api/grade with valid photos + reason returns a correctly-typed `ReturnGradingResult` (all 6 fields present, correct types, `rawReason` set)
- [ ] POST /api/grade with empty `photos` array skips the NVIDIA call and returns mock data (not a failure)
- [ ] POST /api/grade with any NVIDIA failure (bad key, network error, malformed JSON response) returns `{ fallback: true, decision: 'warehouse' }` with HTTP 200 — never 500
- [ ] POST /api/route runs `computeRouting` first; NVIDIA is only called for `reasoning` string
- [ ] POST /api/route with `decision === 'return_to_seller'` skips NVIDIA call and uses hardcoded reasoning
- [ ] POST /api/route NVIDIA narration failure falls back to template string — `reasoning` is never empty
- [ ] POST /api/route returns a complete `ReturnRoutingDecision` with all fields matching the type
- [ ] POST /api/health-card returns a `ReturnHealthCard` with all 4 fields on success
- [ ] POST /api/health-card on any failure returns `{ fallback: true, summary: string }` with HTTP 200
- [ ] `nvidia-client.ts` is the only file containing the NVIDIA endpoint URL and auth header
- [ ] `NVIDIA_API_KEY` absent at startup → server starts, logs warning, all routes return mock/fallback data — server never crashes
- [ ] `computeRouting` produces deterministic output for all 9 reason values and all grade levels (unit-testable pure function)
- [ ] `express.json({ limit: '10mb' })` is applied so base64 photo payloads are accepted
- [ ] No `any` types anywhere; all returned objects match `packages/shared` types exactly
- [ ] TypeScript check passes on both `@reloop/api` and `@reloop/shared`

## Open questions

1. **Vision model availability** — The spec uses `meta/llama-3.2-90b-vision-instruct`. Confirm this is available on your NVIDIA NIM account before building, or provide an alternative (e.g. `nvidia/neva-22b`). This only affects one constant in `nvidia-client.ts` call sites — easy to swap.

2. **Health card trigger timing** — The spec builds `/api/health-card` as a standalone endpoint. Should it be called automatically by `/api/route` when `decision === 'local_resale'` (return a combined response), or remain a separate call triggered explicitly by spec 004? Recommendation: keep it separate — cleaner contract boundaries, easier to test.

3. **`return_to_seller` narration** — For the 3P return-to-seller path, this spec uses a hardcoded reasoning string and skips the LLM call. Confirm this is acceptable, or if you'd prefer the LLM to narrate it anyway.

4. **Mock pricing data** — The routing engine uses SKU prefix (`B09`/`B08`/`B07`) to key mock pricing. This is sufficient for the three demo orders. Confirm before build, or provide a different keying strategy (e.g. `category` field from the request body instead of SKU prefix).

5. **`express.json` body size limit** — `10mb` is set to handle base64 photos. Each base64-encoded 2MB image is ~2.7MB; 5 photos = ~13.5MB. Consider raising to `20mb` or compressing photos client-side before sending. Flag this before spec 004.
