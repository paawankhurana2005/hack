// Lazy AWS SDK clients for the return-init/return-status fallback (spec 025).
// Same graceful-degrade convention as mongo.ts: when AWS credentials aren't
// configured, isAwsConfigured() is false and callers 503 instead of throwing.
//
// Why this exists at all: the account's Lambda Function URL public-invoke
// path is currently blocked by an AWS account-level restriction (Lambda
// concurrent-execution quota stuck at 10 with quota-increase requests
// disabled) — see infra/lambda/index.mjs's /return-init and /return-status,
// which do the same work but hit the same 403. These authenticated,
// server-to-server AWS SDK calls aren't subject to that restriction, so this
// is the fallback path until AWS Support lifts it.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { config } from '../config.js';

let ddbClient: DynamoDBDocumentClient | null = null;
let s3Client: S3Client | null = null;

export function isAwsConfigured(): boolean {
  return Boolean(config.AWS_ACCESS_KEY_ID && config.AWS_SECRET_ACCESS_KEY);
}

function credentials() {
  if (!config.AWS_ACCESS_KEY_ID || !config.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS credentials not configured');
  }
  return { accessKeyId: config.AWS_ACCESS_KEY_ID, secretAccessKey: config.AWS_SECRET_ACCESS_KEY };
}

export function getDdb(): DynamoDBDocumentClient {
  if (!ddbClient) {
    ddbClient = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: config.AWS_REGION, credentials: credentials() }),
    );
  }
  return ddbClient;
}

export function getS3(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({ region: config.AWS_REGION, credentials: credentials() });
  }
  return s3Client;
}
