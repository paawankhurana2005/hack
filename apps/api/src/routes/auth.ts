// Auth routes — dummy username/password login backed by MongoDB Atlas.
// /accounts lists the demo accounts (no passwords) for the login screen;
// /login validates a handle + password and returns the public account.
//
// Security is intentionally minimal (demo): plaintext dummy passwords, an opaque
// (unverified) token. Real auth would hash passwords and verify the token.

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { ApiError } from '@reloop/shared';
import { getDb, isMongoConfigured } from '../lib/mongo.js';
import { COLLECTION, ensureSeeded, toPublic, type SeedAccount } from '../lib/accounts-seed.js';

const loginSchema = z.object({
  handle: z.string().trim().min(1).max(60),
  password: z.string().min(1).max(120),
});

function apiError(code: string, message: string): ApiError {
  return { error: { code, message } };
}

export function createAuthRouter(): Router {
  const router = Router();

  // List demo accounts for the login chips (never includes passwords).
  router.get('/accounts', async (_req, res) => {
    if (!isMongoConfigured()) {
      return res.status(503).json(apiError('auth_unavailable', 'Auth database not configured'));
    }
    try {
      const db = await getDb();
      await ensureSeeded(db);
      const docs = await db
        .collection<SeedAccount>(COLLECTION)
        .find({}, { projection: { _id: 0, password: 0 } })
        .toArray();
      return res.json(docs);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      // eslint-disable-next-line no-console
      console.error('[reloop/api] accounts list failed:', detail);
      return res.status(503).json(apiError('auth_unavailable', 'Could not reach the auth database'));
    }
  });

  // Validate a handle + password.
  router.post('/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join('; ');
      return res.status(400).json(apiError('invalid_request', message));
    }
    if (!isMongoConfigured()) {
      return res.status(503).json(apiError('auth_unavailable', 'Auth database not configured'));
    }

    const handle = parsed.data.handle.toLowerCase();
    const { password } = parsed.data;

    try {
      const db = await getDb();
      await ensureSeeded(db);
      const account = await db
        .collection<SeedAccount>(COLLECTION)
        .findOne({ handle }, { projection: { _id: 0 } });

      const passwordOk = account ? await bcrypt.compare(password, account.password) : false;
      if (!account || !passwordOk) {
        return res.status(401).json(apiError('invalid_credentials', 'Incorrect username or password'));
      }

      return res.json({ account: toPublic(account), token: `demo_${randomUUID()}` });
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      // eslint-disable-next-line no-console
      console.error('[reloop/api] login failed:', detail);
      return res.status(503).json(apiError('auth_unavailable', 'Could not reach the auth database'));
    }
  });

  return router;
}
