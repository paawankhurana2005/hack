// Client for the ReLoop AWS data service (Lambda Function URL → DynamoDB + S3).
// Everything here is best-effort: every call swallows errors and returns
// null/false, so localStorage stays the bulletproof source of truth and AWS being
// down can never break the demo. When NEXT_PUBLIC_DATA_API_URL is unset, the data
// service is simply skipped (pure-localStorage mode).

import type { ItemCategory, ProvenanceChain, ProvenanceEvent } from '@reloop/shared';

const BASE = (process.env.NEXT_PUBLIC_DATA_API_URL ?? '').replace(/\/+$/, '');

/** Whether the AWS data service is configured for this build. */
export const dataApiEnabled = BASE.length > 0;

/** Read a full provenance chain from DynamoDB. Returns null on miss/error. */
export async function fetchChain(itemId: string): Promise<ProvenanceChain | null> {
  if (!BASE) return null;
  try {
    const res = await fetch(`${BASE}/chain?itemId=${encodeURIComponent(itemId)}`);
    if (!res.ok) return null;
    const chain = (await res.json()) as ProvenanceChain;
    return chain.events?.length ? chain : null;
  } catch {
    return null;
  }
}

/** Append one event to the DynamoDB ledger (fire-and-forget; never throws). */
export function pushEvent(
  itemId: string,
  event: ProvenanceEvent,
  meta: { category: ItemCategory; title: string },
): void {
  if (!BASE) return;
  void fetch(`${BASE}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ itemId, event, category: meta.category, title: meta.title }),
  }).catch(() => {});
}

/** Upload an image (data URL) to S3 via a presigned PUT. Returns the public URL
 *  or null on any failure. */
export async function uploadImage(key: string, dataUrl: string): Promise<string | null> {
  if (!BASE) return null;
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const presign = await fetch(`${BASE}/presign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, contentType: blob.type || 'image/jpeg' }),
    });
    if (!presign.ok) return null;
    const { uploadUrl, publicUrl } = (await presign.json()) as {
      uploadUrl: string;
      publicUrl: string;
    };
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': blob.type || 'image/jpeg' },
      body: blob,
    });
    return put.ok ? publicUrl : null;
  } catch {
    return null;
  }
}
