// Typed client for apps/api. Reads the base URL from env so deploys can point
// elsewhere; defaults to the local API.

import type {
  AgentNarrateRequest,
  AgentNarrateResponse,
  ApiError,
  DemandEventType,
  GradeRequest,
  GradingResult,
  HealthCardRequest,
  PriceBreakdown,
  PriceRequest,
  PricingDecision,
  PricingResult,
  PricingStateVector,
  ProductHealthCard,
  ReturnRecordInput,
  RufusRequest,
  RufusResponse,
} from '@reloop/shared';
import type { Account } from './accounts';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

/** Thrown when the API returns a typed ApiError or an unexpected failure. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiError).error?.message === 'string'
  );
}

// Hard ceiling on any single request so a hung/slow API can never freeze the UI.
const REQUEST_TIMEOUT_MS = 30_000;

function withTimeout(): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

async function postJson<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  let res: Response;
  const t = withTimeout();
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: t.signal,
    });
  } catch {
    throw new ApiRequestError(
      'Could not reach the ReLoop service. Is the API running?',
      'network_error',
      0,
    );
  } finally {
    t.done();
  }

  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    if (isApiError(data)) {
      throw new ApiRequestError(data.error.message, data.error.code, res.status);
    }
    throw new ApiRequestError('Request failed.', 'unknown_error', res.status);
  }

  return data as TRes;
}

async function getJson<TRes>(path: string): Promise<TRes> {
  let res: Response;
  const t = withTimeout();
  try {
    res = await fetch(`${BASE_URL}${path}`, { signal: t.signal });
  } catch {
    throw new ApiRequestError(
      'Could not reach the ReLoop service. Is the API running?',
      'network_error',
      0,
    );
  } finally {
    t.done();
  }

  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    if (isApiError(data)) {
      throw new ApiRequestError(data.error.message, data.error.code, res.status);
    }
    throw new ApiRequestError('Request failed.', 'unknown_error', res.status);
  }

  return data as TRes;
}

/** List the demo accounts (no passwords) for the login screen. */
export function listAccounts(): Promise<Account[]> {
  return getJson<Account[]>('/api/auth/accounts');
}

/** Validate a handle + password against MongoDB. Throws ApiRequestError on
 *  bad credentials (401) or when the auth DB is unavailable (503). */
export async function login(handle: string, password: string): Promise<Account> {
  const res = await postJson<{ handle: string; password: string }, { account: Account; token: string }>(
    '/api/auth/login',
    { handle, password },
  );
  return res.account;
}

export function gradeItem(req: GradeRequest): Promise<GradingResult> {
  return postJson<GradeRequest, GradingResult>('/api/sell/grade', req);
}

export function priceItem(req: PriceRequest): Promise<PricingResult> {
  return postJson<PriceRequest, PricingResult>('/api/sell/price', req);
}

/** Minimum fields the dynamic reprice engine needs; the rest are server-defaulted. */
export type PricingDecideRequest = {
  listingId: string;
  /** The listing's real current price (₹) so step-caps are correct per call. */
  currentPrice?: number;
  event: { type: DemandEventType; payload?: Record<string, unknown> };
  state: Pick<
    PricingStateVector,
    'category' | 'gradeKey' | 'compMedianPrice' | 'amazonNewPrice' | 'sellerFloor' | 'routeElsewhereValue'
  > &
    Partial<PricingStateVector>;
};

/** Dynamic-pricing engine (spec 014): an event → a clamped, narrated price. */
export function decidePricing(req: PricingDecideRequest): Promise<PricingDecision> {
  return postJson<PricingDecideRequest, PricingDecision>('/api/pricing/decide', req);
}

export function narrateAgent(req: AgentNarrateRequest): Promise<AgentNarrateResponse> {
  return postJson<AgentNarrateRequest, AgentNarrateResponse>('/api/agent/narrate', req);
}

export function askRufus(req: RufusRequest): Promise<RufusResponse> {
  return postJson<RufusRequest, RufusResponse>('/api/rufus/ask', req);
}

/** Upsert the structured return record so the pricing engine can price it.
 *  Called when a seller approves a return for local routing. */
export function upsertReturnRecord(req: ReturnRecordInput): Promise<{ ok: boolean; returnId: string }> {
  return postJson<ReturnRecordInput, { ok: boolean; returnId: string }>('/api/returns', req);
}

/** Fetch the live, dynamic price breakdown for a return from the pricing engine.
 *  (/api/return-pricing — /api/pricing is the spec-014 reprice engine.) */
export function getPricing(returnId: string): Promise<PriceBreakdown> {
  return getJson<PriceBreakdown>(`/api/return-pricing/${encodeURIComponent(returnId)}`);
}

export function createHealthCard(req: HealthCardRequest): Promise<ProductHealthCard> {
  // Drop the heavy base64 photo data URLs — the card doesn't need them.
  const lean: HealthCardRequest = {
    ...req,
    grading: { ...req.grading, photoUrls: [] },
  };
  return postJson<HealthCardRequest, ProductHealthCard>('/api/sell/health-card', lean);
}
