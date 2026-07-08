// In-app notification service (spec 024, phase 1) — the real inbox behind the
// seller dashboard's bell. Fed by the matching cascade job, the Sales Agent,
// and the Listing Agent. Error-tolerant throughout, matching
// apps/api/src/jobs/matchingCascade.ts's style: a notification failure must
// never take down the caller (a cascade tick, an agent action).
//
// Phase 4: an optional LLM rephrases the body (same Completer+fallback
// pattern as reprice-narrate.ts — narration never changes which events fire,
// only prose), and per-seller preferences can mute a kind entirely or quiet
// non-urgent (`info`) notifications during set hours.

import { ObjectId, type WithId } from 'mongodb';
import { getDb } from '../../lib/mongo.js';
import { log } from '../../lib/logger.js';
import {
  NOTIFICATIONS,
  NOTIFICATION_PREFS,
  RETURNS,
  type NotificationDoc,
  type NotificationPrefsDoc,
  type ReturnRecordDoc,
} from '../../lib/collections.js';
import { narrateNotification, type Completer } from './notification-narrate.js';

export type CreateNotificationInput = Omit<NotificationDoc, '_id' | 'created_at' | 'read'>;

// Module-level, configured once at boot from the composition root (index.ts),
// same singleton-seam convention as lib/mongo.ts's getDb()/isMongoConfigured()
// — every call site here already gets the DB handle this way, not via DI.
let llmCompleter: Completer | undefined;

export function configureNotificationNarration(llm: Completer | undefined): void {
  llmCompleter = llm;
}

function inQuietHours(prefs: NotificationPrefsDoc, at: Date): boolean {
  const { quiet_hours_start: start, quiet_hours_end: end } = prefs;
  if (start === undefined || end === undefined) return false;
  const hour = at.getHours();
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** Create a notification, unless the seller has muted this kind or it's a
 *  non-urgent (`info`) notification during their quiet hours. Returns `null`
 *  when suppressed — not an error, just nothing to show. */
export async function createNotification(input: CreateNotificationInput): Promise<WithId<NotificationDoc> | null> {
  const db = await getDb();
  const prefs = await db.collection<NotificationPrefsDoc>(NOTIFICATION_PREFS).findOne({ seller_id: input.seller_id });
  if (prefs) {
    if (prefs.muted_kinds.includes(input.kind)) return null;
    if (input.severity === 'info' && inQuietHours(prefs, new Date())) return null;
  }

  const body = await narrateNotification(
    { title: input.title, body: input.body },
    llmCompleter,
    { name: 'notification.narrate', listingId: input.listing_id, returnId: input.return_id },
  );
  const doc: NotificationDoc = { ...input, body, read: false, created_at: new Date() };
  const { insertedId } = await db.collection<NotificationDoc>(NOTIFICATIONS).insertOne(doc);
  return { ...doc, _id: insertedId };
}

/** Look up the owning seller for a return and notify them. Never throws — a
 * return with no seller_id attached (e.g. a demo return) is logged and
 * skipped, and any Mongo error is logged and swallowed, so this can always be
 * called fire-and-forget from a cascade tick or agent action. */
export async function createNotificationForReturn(
  returnId: string,
  input: Omit<CreateNotificationInput, 'seller_id'>,
): Promise<void> {
  try {
    const db = await getDb();
    const record = await db.collection<ReturnRecordDoc>(RETURNS).findOne({ returnId });
    if (!record?.seller_id) {
      log('warn', 'createNotificationForReturn: no seller_id on return, skipping', { returnId, kind: input.kind });
      return;
    }
    await createNotification({ ...input, seller_id: record.seller_id, return_id: input.return_id ?? returnId });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error';
    log('error', 'createNotificationForReturn failed (continuing)', { returnId, detail });
  }
}

export async function listNotifications(
  sellerId: string,
  opts: { unreadOnly?: boolean; limit?: number } = {},
): Promise<WithId<NotificationDoc>[]> {
  const db = await getDb();
  const query: Record<string, unknown> = { seller_id: sellerId };
  if (opts.unreadOnly) query.read = false;
  return db
    .collection<NotificationDoc>(NOTIFICATIONS)
    .find(query)
    .sort({ created_at: -1 })
    .limit(opts.limit ?? 50)
    .toArray();
}

export async function markRead(id: string): Promise<void> {
  const db = await getDb();
  await db.collection<NotificationDoc>(NOTIFICATIONS).updateOne({ _id: new ObjectId(id) }, { $set: { read: true } });
}

export async function markAllRead(sellerId: string): Promise<void> {
  const db = await getDb();
  await db.collection<NotificationDoc>(NOTIFICATIONS).updateMany({ seller_id: sellerId, read: false }, { $set: { read: true } });
}

export async function getPreferences(sellerId: string): Promise<NotificationPrefsDoc> {
  const db = await getDb();
  const doc = await db.collection<NotificationPrefsDoc>(NOTIFICATION_PREFS).findOne({ seller_id: sellerId });
  return doc ?? { seller_id: sellerId, muted_kinds: [] };
}

export async function setPreferences(
  sellerId: string,
  prefs: Omit<NotificationPrefsDoc, 'seller_id'>,
): Promise<NotificationPrefsDoc> {
  const db = await getDb();
  const doc: NotificationPrefsDoc = { seller_id: sellerId, ...prefs };
  await db
    .collection<NotificationPrefsDoc>(NOTIFICATION_PREFS)
    .updateOne({ seller_id: sellerId }, { $set: doc }, { upsert: true });
  return doc;
}
