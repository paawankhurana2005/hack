// Lazy MongoDB connection. The client connects on first use and is reused across
// requests (one pool per process). When MONGODB_URI is unset, the data layer is
// simply unavailable and callers fall back — the server still boots.

import { MongoClient, type Db } from 'mongodb';
import { config } from '../config.js';

let clientPromise: Promise<MongoClient> | null = null;

/** Whether a MongoDB connection string is configured for this process. */
export function isMongoConfigured(): boolean {
  return Boolean(config.MONGODB_URI);
}

/** Connect (once) and return the app database. Throws if MONGODB_URI is unset. */
export async function getDb(): Promise<Db> {
  if (!config.MONGODB_URI) {
    throw new Error('MONGODB_URI not configured');
  }
  if (!clientPromise) {
    const client = new MongoClient(config.MONGODB_URI, {
      // Fail fast instead of hanging a request if the cluster is unreachable.
      serverSelectionTimeoutMS: 8000,
    });
    clientPromise = client.connect();
  }
  const client = await clientPromise;
  return client.db(config.MONGODB_DB);
}
