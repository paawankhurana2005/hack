// Spec 025 fallback: /api/return-init and /api/return-status, run as
// authenticated AWS SDK calls from apps/api instead of the (currently
// account-restricted) public Lambda Function URL. Logic mirrors
// infra/lambda/index.mjs's /return-init and /return-status routes exactly —
// same DynamoDB table, same S3 bucket/key layout — so the async pipeline
// (S3 -> SQS -> return-worker Lambda) behaves identically regardless of
// which of the two front doors issued the presigned URLs.

import type { Router, Request, Response } from 'express';
import express from 'express';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { config } from '../config.js';
import { isAwsConfigured, getDdb, getS3 } from '../lib/aws-clients.js';

const JOB_TTL_SECONDS = 7 * 24 * 60 * 60;

export function createReturnPipelineRouter(): Router {
  const router = express.Router();

  router.post('/return-init', async (req: Request, res: Response) => {
    if (!isAwsConfigured()) {
      res.status(503).json({ error: 'AWS return pipeline not configured' });
      return;
    }
    const { returnId, photoCount, contentType } = req.body as {
      returnId: unknown;
      photoCount: unknown;
      contentType: unknown;
    };
    if (typeof returnId !== 'string' || !returnId || !Number.isInteger(photoCount) || (photoCount as number) < 0) {
      res.status(400).json({ error: 'returnId + integer photoCount required' });
      return;
    }

    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + JOB_TTL_SECONDS;
    try {
      await getDdb().send(
        new PutCommand({
          TableName: config.AWS_RETURN_JOBS_TABLE,
          Item: { pk: returnId, status: 'PENDING', createdAt: now, updatedAt: now, ttl },
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );
    } catch (err) {
      if (!(err instanceof Error) || err.name !== 'ConditionalCheckFailedException') throw err;
      // Job already exists (client retry) — fall through and just re-issue URLs.
    }

    const ct = typeof contentType === 'string' && contentType ? contentType : 'image/jpeg';
    const count = photoCount as number;
    const uploadUrls: string[] = [];
    const publicPhotoUrls: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const key = `returns/${returnId}/photo-${i}.jpg`;
      const cmd = new PutObjectCommand({ Bucket: config.AWS_S3_BUCKET, Key: key, ContentType: ct });
      uploadUrls.push(await getSignedUrl(getS3(), cmd, { expiresIn: 300 }));
      publicPhotoUrls.push(`https://${config.AWS_S3_BUCKET}.s3.${config.AWS_REGION}.amazonaws.com/${key}`);
    }
    const manifestCmd = new PutObjectCommand({
      Bucket: config.AWS_S3_BUCKET,
      Key: `returns/${returnId}/manifest.json`,
      ContentType: 'application/json',
    });
    const manifestUploadUrl = await getSignedUrl(getS3(), manifestCmd, { expiresIn: 300 });

    res.json({ uploadUrls, manifestUploadUrl, publicPhotoUrls });
  });

  router.get('/return-status', async (req: Request, res: Response) => {
    if (!isAwsConfigured()) {
      res.status(503).json({ error: 'AWS return pipeline not configured' });
      return;
    }
    const returnId = req.query.returnId;
    if (typeof returnId !== 'string' || !returnId) {
      res.status(400).json({ error: 'returnId required' });
      return;
    }
    const out = await getDdb().send(
      new GetCommand({ TableName: config.AWS_RETURN_JOBS_TABLE, Key: { pk: returnId } }),
    );
    if (!out.Item) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const { status, updatedAt, result, error } = out.Item as {
      status: string;
      updatedAt: string;
      result?: string;
      error?: string;
    };
    res.json({
      returnId,
      status,
      updatedAt,
      result: result ? JSON.parse(result) : undefined,
      error,
    });
  });

  return router;
}
