// Spec 025: SQS-triggered worker for the async return-grading pipeline.
// Triggered by the S3 -> SQS event fired when a client finishes uploading
// returns/{returnId}/manifest.json (see infra/lambda/index.mjs's /return-init
// and infra/provision.sh's bucket-notification wiring). This Lambda is pure
// orchestration/glue: it does NOT reimplement grading or routing — it fetches
// the photos from S3 and calls the same, unmodified Render API endpoints the
// browser used to call directly (POST /api/grade, /api/route, /api/health-card).
//
// Contract note: the shapes below (ReturnManifest, ReturnJobResult, etc.) must
// stay in sync with packages/shared/src/return-job.ts by hand — this file has
// no build step and can't import TS.
//
// Runtime: Node.js 20 (AWS SDK v3 preinstalled — no bundled deps, uses global fetch).

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const REGION = process.env.AWS_REGION || 'ap-south-1';
const JOBS_TABLE = process.env.JOBS_TABLE_NAME || 'reloop-return-jobs';
const RENDER_API_BASE = (process.env.RENDER_API_BASE || '').replace(/\/+$/, '');
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || '';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const s3 = new S3Client({ region: REGION });

async function streamToString(body) {
  const chunks = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

async function streamToBase64(body) {
  const chunks = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks).toString('base64');
}

async function callRenderApi(path, payload) {
  const res = await fetch(`${RENDER_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(INTERNAL_API_SECRET ? { 'x-reloop-internal-secret': INTERNAL_API_SECRET } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`${path} responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

// Marks the job PROCESSING iff it's still PENDING. Returns false (no-op) when
// another delivery of the same at-least-once SQS message already claimed it —
// the guard against double-calling (and double-billing) the Render API.
async function claimJob(returnId) {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: JOBS_TABLE,
        Key: { pk: returnId },
        UpdateExpression: 'SET #status = :processing, updatedAt = :now',
        ConditionExpression: '#status = :pending',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':processing': 'PROCESSING', ':pending': 'PENDING', ':now': new Date().toISOString() },
      }),
    );
    return true;
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

async function writeResult(returnId, result) {
  await ddb.send(
    new UpdateCommand({
      TableName: JOBS_TABLE,
      Key: { pk: returnId },
      UpdateExpression: 'SET #status = :done, #result = :result, updatedAt = :now REMOVE #error',
      ExpressionAttributeNames: { '#status': 'status', '#result': 'result', '#error': 'error' },
      ExpressionAttributeValues: { ':done': 'DONE', ':result': JSON.stringify(result), ':now': new Date().toISOString() },
    }),
  );
}

async function writeFailure(returnId, message) {
  await ddb.send(
    new UpdateCommand({
      TableName: JOBS_TABLE,
      Key: { pk: returnId },
      UpdateExpression: 'SET #status = :failed, #error = :error, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status', '#error': 'error' },
      ExpressionAttributeValues: { ':failed': 'FAILED', ':error': message, ':now': new Date().toISOString() },
    }),
  );
}

async function processManifestObject(bucket, key) {
  // key looks like returns/{returnId}/manifest.json
  const match = key.match(/^returns\/([^/]+)\/manifest\.json$/);
  if (!match) {
    console.warn(`ignoring unexpected key: ${key}`);
    return;
  }
  const returnId = match[1];

  const claimed = await claimJob(returnId);
  if (!claimed) {
    console.log(`job ${returnId} already claimed — skipping duplicate delivery`);
    return;
  }

  try {
    const manifestObj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const manifest = JSON.parse(await streamToString(manifestObj.Body));
    const { orderId, sku, reason, sellerType, photoCount } = manifest;

    const photos = [];
    for (let i = 0; i < photoCount; i += 1) {
      const photoObj = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: `returns/${returnId}/photo-${i}.jpg` }),
      );
      photos.push(await streamToBase64(photoObj.Body));
    }

    const gradingResult = await callRenderApi('/api/grade', { photos, reason, sku });
    const routingDecision =
      'fallback' in gradingResult
        ? gradingResult
        : await callRenderApi('/api/route', { gradingResult, reason, sku, sellerType });
    let healthCard = { fallback: true, summary: 'Health Card unavailable.' };
    if (!('fallback' in gradingResult)) {
      try {
        healthCard = await callRenderApi('/api/health-card', { gradingResult });
      } catch (err) {
        console.warn(`health-card enrichment failed for ${returnId}: ${err.message}`);
      }
    }

    await writeResult(returnId, { gradingResult, routingDecision, healthCard, orderId });
  } catch (err) {
    await writeFailure(returnId, err.message || String(err));
    throw err; // rethrow so the SQS message isn't deleted — let redrive-policy retry
  }
}

export async function handler(event) {
  for (const record of event.Records || []) {
    const s3Event = JSON.parse(record.body);
    for (const s3Record of s3Event.Records || []) {
      const bucket = s3Record.s3.bucket.name;
      const key = decodeURIComponent(s3Record.s3.object.key.replace(/\+/g, ' '));
      await processManifestObject(bucket, key);
    }
  }
}
