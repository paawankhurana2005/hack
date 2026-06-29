// Typed client for apps/api. Reads the base URL from env so deploys can point
// elsewhere; defaults to the local API.

import type {
  AgentNarrateRequest,
  AgentNarrateResponse,
  ApiError,
  GradeRequest,
  GradingResult,
  HealthCardRequest,
  PriceRequest,
  PricingResult,
  ProductHealthCard,
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

async function postJson<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(
      'Could not reach the ReLoop service. Is the API running?',
      'network_error',
      0,
    );
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
  try {
    res = await fetch(`${BASE_URL}${path}`);
  } catch {
    throw new ApiRequestError(
      'Could not reach the ReLoop service. Is the API running?',
      'network_error',
      0,
    );
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

export function narrateAgent(req: AgentNarrateRequest): Promise<AgentNarrateResponse> {
  return postJson<AgentNarrateRequest, AgentNarrateResponse>('/api/agent/narrate', req);
}

export function askRufus(req: RufusRequest): Promise<RufusResponse> {
  return postJson<RufusRequest, RufusResponse>('/api/rufus/ask', req);
}

export function createHealthCard(req: HealthCardRequest): Promise<ProductHealthCard> {
  // Drop the heavy base64 photo data URLs — the card doesn't need them.
  const lean: HealthCardRequest = {
    ...req,
    grading: { ...req.grading, photoUrls: [] },
  };
  return postJson<HealthCardRequest, ProductHealthCard>('/api/sell/health-card', lean);
}
