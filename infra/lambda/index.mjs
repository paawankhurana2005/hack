// ReLoop data service — a single AWS Lambda behind a Function URL.
// Serves the Product Health Card provenance ledger from DynamoDB (append-only)
// and issues presigned S3 upload URLs for grading photos. The web app calls this
// directly (public Function URL); localStorage stays the bulletproof fallback.
//
// Runtime: Node.js 20 (AWS SDK v3 is preinstalled — no bundled deps).

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const REGION = process.env.AWS_REGION || 'ap-south-1';
const TABLE = process.env.TABLE_NAME || 'reloop-provenance';
const BUCKET = process.env.BUCKET_NAME || 'reloop-media-paawan';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const s3 = new S3Client({ region: REGION });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Content-Type': 'application/json',
};

const json = (status, body) => ({ statusCode: status, headers: CORS, body: JSON.stringify(body) });

export async function handler(event) {
  const method = event?.requestContext?.http?.method || 'GET';
  const path = (event?.rawPath || '/').replace(/\/+$/, '') || '/';
  if (method === 'OPTIONS') return json(204, {});

  try {
    if (path === '/health') return json(200, { ok: true, table: TABLE, bucket: BUCKET });

    // --- Read a full provenance chain -------------------------------------
    if (method === 'GET' && path === '/chain') {
      const itemId = event?.queryStringParameters?.itemId;
      if (!itemId) return json(400, { error: 'itemId required' });
      const out = await ddb.send(
        new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': itemId },
        }),
      );
      const rows = out.Items || [];
      const meta = rows.find((r) => r.sk === 'META');
      const events = rows
        .filter((r) => r.sk !== 'META')
        .sort((a, b) => (a.sk < b.sk ? -1 : 1))
        .map((r) => JSON.parse(r.data));
      if (!meta && events.length === 0) return json(404, { error: 'not found' });
      return json(200, {
        itemId,
        category: meta?.category ?? 'other',
        title: meta?.title ?? '',
        events,
      });
    }

    // --- Append one event (append-only) -----------------------------------
    if (method === 'POST' && path === '/events') {
      const body = JSON.parse(event.body || '{}');
      const { itemId, event: ev, category, title } = body;
      if (!itemId || !ev?.type || !ev?.at) return json(400, { error: 'itemId + event{type,at} required' });
      // Sort by INSERTION time (not the event's own `at`) so events appended in
      // order stay in order even when two share a timestamp (e.g. sold + owned at
      // the same handoff moment). The event's `at` is preserved in `data` for display.
      const sk = `EVT#${new Date().toISOString()}#${Math.random().toString(36).slice(2, 8)}`;
      await ddb.send(
        new PutCommand({
          TableName: TABLE,
          Item: { pk: itemId, sk, type: ev.type, at: ev.at, data: JSON.stringify(ev) },
        }),
      );
      // Upsert the chain meta (category/title) so /chain can render a header.
      if (category || title) {
        await ddb.send(
          new UpdateCommand({
            TableName: TABLE,
            Key: { pk: itemId, sk: 'META' },
            UpdateExpression: 'SET category = :c, title = :t',
            ExpressionAttributeValues: { ':c': category ?? 'other', ':t': title ?? '' },
          }),
        );
      }
      return json(200, { ok: true, sk });
    }

    // --- Presigned S3 upload URL for a grading photo ----------------------
    if (method === 'POST' && path === '/presign') {
      const body = JSON.parse(event.body || '{}');
      const { key, contentType } = body;
      if (!key) return json(400, { error: 'key required' });
      const cmd = new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: contentType || 'image/jpeg',
      });
      const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 300 });
      const publicUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
      return json(200, { uploadUrl, publicUrl });
    }

    return json(404, { error: `no route for ${method} ${path}` });
  } catch (err) {
    return json(500, { error: String(err?.message || err) });
  }
}
