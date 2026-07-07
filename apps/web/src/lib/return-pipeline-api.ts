// Client for the ReLoop async return-grading pipeline (spec 025): S3 -> SQS ->
// return-worker Lambda. `/return-init` and `/return-status` are served by the
// Render API (apps/api/src/routes/return-pipeline.ts) rather than the AWS
// Lambda Function URL — the account's Function URL public-invoke path is
// currently blocked by an AWS account-level restriction (pending an AWS
// Support case), so the Render API makes the same authenticated AWS SDK
// calls instead. Best-effort by design: on any failure, callers fall back to
// the synchronous /api/grade|route|health-card path (see BuyerStep2Pickup.tsx).

import type { ReturnInitResponse, ReturnJobStatusResponse, ReturnManifest } from '@reloop/shared';

const BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

/** Mint a job row + get presigned upload URLs for photos and the manifest. */
export async function initReturn(
  returnId: string,
  photoCount: number,
): Promise<ReturnInitResponse | null> {
  try {
    const res = await fetch(`${BASE}/api/return-init`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ returnId, photoCount }),
    });
    if (!res.ok) return null;
    return (await res.json()) as ReturnInitResponse;
  } catch {
    return null;
  }
}

/** Upload one photo (data URL) to S3 via a presigned PUT. */
async function uploadToPresignedUrl(uploadUrl: string, dataUrl: string, contentType: string): Promise<boolean> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': blob.type || contentType },
      body: blob,
    });
    return put.ok;
  } catch {
    return false;
  }
}

/**
 * Uploads every photo, then the manifest last — the manifest's arrival is
 * what triggers the S3 -> SQS -> return-worker pipeline. Returns false if any
 * step fails (callers should fall back to the synchronous path).
 */
export async function submitReturnPhotos(
  init: ReturnInitResponse,
  photos: string[],
  manifest: ReturnManifest,
): Promise<boolean> {
  for (let i = 0; i < photos.length; i += 1) {
    const uploadUrl = init.uploadUrls[i];
    const photo = photos[i];
    if (!uploadUrl || !photo) return false;
    const ok = await uploadToPresignedUrl(uploadUrl, photo, 'image/jpeg');
    if (!ok) return false;
  }
  try {
    const put = await fetch(init.manifestUploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(manifest),
    });
    return put.ok;
  } catch {
    return false;
  }
}

/** Poll the async job's status. Returns null on any failure (never throws). */
export async function pollReturnStatus(returnId: string): Promise<ReturnJobStatusResponse | null> {
  try {
    const res = await fetch(`${BASE}/api/return-status?returnId=${encodeURIComponent(returnId)}`);
    if (!res.ok) return null;
    return (await res.json()) as ReturnJobStatusResponse;
  } catch {
    return null;
  }
}
