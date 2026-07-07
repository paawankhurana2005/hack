// Spec 025: the async return-grading pipeline (S3 -> SQS -> Lambda) contract.
// The web client and the AWS worker Lambda (infra/lambda/return-worker.mjs)
// both speak this shape; the Lambda is plain JS with no build step, so it
// can't import this file directly, but must stay byte-for-byte consistent
// with it by convention (see the comment in return-worker.mjs).

import type { ReturnGradeResponse, ReturnRouteResponse, ReturnHealthCard, ReturnReason } from './return.js';

export type ReturnJobStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';

export interface ReturnJobResult {
  gradingResult: ReturnGradeResponse;
  routingDecision: ReturnRouteResponse;
  healthCard: ReturnHealthCard | { fallback: true; summary: string };
}

export interface ReturnJobStatusResponse {
  returnId: string;
  status: ReturnJobStatus;
  result?: ReturnJobResult;
  error?: string;
  updatedAt: string; // ISO timestamp
}

export interface ReturnInitRequest {
  returnId: string;
  photoCount: number;
  contentType?: string; // default image/jpeg, matches the existing /presign default
}

export interface ReturnInitResponse {
  uploadUrls: string[]; // presigned PUT, index-aligned with returns/{returnId}/photo-{i}.jpg
  manifestUploadUrl: string; // presigned PUT for returns/{returnId}/manifest.json
  publicPhotoUrls: string[]; // final public S3 URLs, index-aligned with uploadUrls
}

// The object the client PUTs to `manifestUploadUrl` last — its arrival is what
// triggers the S3 -> SQS -> worker Lambda pipeline (see infra/provision.sh).
export interface ReturnManifest {
  returnId: string;
  orderId: string;
  sku: string;
  reason: ReturnReason;
  sellerType: '1P' | '3P';
  photoCount: number;
  createdAt: string; // ISO timestamp
}
