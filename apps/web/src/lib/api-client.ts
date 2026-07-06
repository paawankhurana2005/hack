// Typed client for apps/api. Reads the base URL from env so deploys can point
// elsewhere; defaults to the local API.

import type {
  AgentNarrateRequest,
  AgentNarrateResponse,
  ApiError,
  CheckpointEvidence,
  DemandEventType,
  GradeRequest,
  GradingResult,
  HealthCardRequest,
  Notification,
  NotificationKind,
  NotificationPreferences,
  NotificationSeverity,
  PriceBreakdown,
  PriceRequest,
  PricingDecision,
  PricingResult,
  PricingStateVector,
  ProductHealthCard,
  ReturnGradeResponse,
  ReturnGradingResult,
  ReturnHealthCard,
  ReturnItemState,
  ReturnReason,
  ReturnRecordInput,
  ReturnRouteResponse,
  ReturnStateTransition,
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

async function patchJson<TRes>(path: string): Promise<TRes> {
  let res: Response;
  const t = withTimeout();
  try {
    res = await fetch(`${BASE_URL}${path}`, { method: 'PATCH', signal: t.signal });
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

async function putJson<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  let res: Response;
  const t = withTimeout();
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'PUT',
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
  /** Lets the engine resolve real geo/local features (spec 024) for a
   *  return-sourced listing instead of its flat placeholder defaults. */
  pincode?: string;
  returnId?: string;
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

// --- Return pipeline (spec 016/022) — doorstep grading, the Intelligent
// Bridge, checkpoints, and buyer matching. Distinct from the Sell-flow
// functions above (gradeItem/priceItem/createHealthCard hit /api/sell/*).

/** Doorstep AI grading for a return. Strips the `data:image/...;base64,`
 *  prefix from each photo — the API expects raw base64, not a data URL. */
export function gradeReturnItem(req: {
  photos: string[];
  reason: ReturnReason;
  sku?: string;
}): Promise<ReturnGradeResponse> {
  const stripped = req.photos.map((p) => {
    const idx = p.indexOf(',');
    return idx === -1 ? p : p.slice(idx + 1);
  });
  return postJson<{ photos: string[]; reason: ReturnReason; sku?: string }, ReturnGradeResponse>(
    '/api/grade',
    { ...req, photos: stripped },
  );
}

/** The Intelligent Bridge — deterministic EV routing engine + narrated
 *  reasoning (LLM-narrated for most decisions, deterministic template for
 *  liquidate/returnless_refund/return_to_seller). */
export function routeReturnItem(req: {
  gradingResult: ReturnGradingResult | null;
  reason: ReturnReason;
  sku: string;
  sellerType: '1P' | '3P';
}): Promise<ReturnRouteResponse> {
  return postJson<typeof req, ReturnRouteResponse>('/api/route', req);
}

/** Spec 016: re-run the routing engine with checkpoint evidence (driver scan,
 *  hub bench) against the production-shaped endpoint — the same engine the
 *  demo previously ran directly against the shared package client-side. */
export function checkpointReturnItem(req: {
  gradingResult: ReturnGradingResult;
  reason: ReturnReason;
  sku: string;
  sellerType: '1P' | '3P';
  evidence: CheckpointEvidence;
  from: ReturnItemState;
}): Promise<{ decision: ReturnRouteResponse; transition: ReturnStateTransition }> {
  return postJson<typeof req, { decision: ReturnRouteResponse; transition: ReturnStateTransition }>(
    '/api/return/checkpoint',
    req,
  );
}

/** Return-flow Product Health Card (distinct from createHealthCard, which
 *  hits the Sell-flow's /api/sell/health-card). */
export function createReturnHealthCard(req: {
  gradingResult: ReturnGradingResult;
}): Promise<ReturnHealthCard | { fallback: true; summary: string }> {
  return postJson<typeof req, ReturnHealthCard | { fallback: true; summary: string }>(
    '/api/health-card',
    req,
  );
}

/** Seller accepted local routing — opens a match session, ranks nearby
 *  buyers, notifies the top candidate. Idempotent server-side: safe to retry. */
export function initiateMatching(returnId: string): Promise<{
  sessionId: string;
  returnId: string;
  status: string;
  candidateCount: number;
}> {
  return postJson<Record<string, never>, {
    sessionId: string;
    returnId: string;
    status: string;
    candidateCount: number;
  }>(`/api/matching/initiate/${encodeURIComponent(returnId)}`, {});
}

/** Poll the current state of a return's match session (seller dashboard). */
export function getMatchingStatus(returnId: string): Promise<{
  sessionId: string;
  returnId: string;
  status: string;
  offeredPrice: number;
  candidateCount: number;
  currentCandidateIndex: number;
  matchedBuyerId: string | null;
  matchedAt: string | null;
  pickupDeadline: string;
}> {
  return getJson(`/api/matching/status/${encodeURIComponent(returnId)}`);
}

export function createHealthCard(req: HealthCardRequest): Promise<ProductHealthCard> {
  // Drop the heavy base64 photo data URLs — the card doesn't need them.
  const lean: HealthCardRequest = {
    ...req,
    grading: { ...req.grading, photoUrls: [] },
  };
  return postJson<HealthCardRequest, ProductHealthCard>('/api/sell/health-card', lean);
}

// --- In-app notifications (spec 024) — the seller dashboard's bell/inbox. ---

export function createNotification(req: {
  sellerId: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  body: string;
  returnId?: string;
  listingId?: string;
}): Promise<Notification> {
  return postJson<typeof req, Notification>('/api/notifications', req);
}

export function listNotifications(
  sellerId: string,
  opts: { unreadOnly?: boolean; limit?: number } = {},
): Promise<{ notifications: Notification[] }> {
  const params = new URLSearchParams();
  if (opts.unreadOnly) params.set('unreadOnly', 'true');
  if (opts.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return getJson(`/api/notifications/${encodeURIComponent(sellerId)}${qs ? `?${qs}` : ''}`);
}

export function markNotificationRead(id: string): Promise<{ ok: boolean }> {
  return patchJson(`/api/notifications/${encodeURIComponent(id)}/read`);
}

export function markAllNotificationsRead(sellerId: string): Promise<{ ok: boolean }> {
  return patchJson(`/api/notifications/${encodeURIComponent(sellerId)}/read-all`);
}

export function getNotificationPreferences(sellerId: string): Promise<NotificationPreferences> {
  return getJson(`/api/notifications/${encodeURIComponent(sellerId)}/preferences`);
}

export function setNotificationPreferences(
  sellerId: string,
  prefs: Pick<NotificationPreferences, 'mutedKinds' | 'quietHoursStart' | 'quietHoursEnd'>,
): Promise<NotificationPreferences> {
  return putJson(`/api/notifications/${encodeURIComponent(sellerId)}/preferences`, prefs);
}

// --- Per-listing engagement capture (spec 024, phase 3) ---------------------
// Real signal for the reprice engine's demand-signal feature group. Callers
// should NOT await this for correctness — it's a fire-and-forget side effect,
// same convention as the notification helpers above.
export type ListingEventType = 'view' | 'save' | 'message' | 'cart_abandon';

export function logListingEvent(listingId: string, eventType: ListingEventType): Promise<{ ok: boolean }> {
  return postJson(`/api/listings/${encodeURIComponent(listingId)}/events`, { eventType });
}
