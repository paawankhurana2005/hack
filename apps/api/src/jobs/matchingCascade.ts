// Matching cascade job — the scheduled half of the local buyer matching engine.
//
// notifyBuyer's 2-hour timeout is detected here from a stored timestamp, never
// via setTimeout, so match state survives a server restart. Runs every 30
// minutes via the same node-cron scheduler already used for demand aggregation.

import cron, { type ScheduledTask } from 'node-cron';
import type { Db, WithId } from 'mongodb';
import { getDb, isMongoConfigured } from '../lib/mongo.js';
import { log } from '../lib/logger.js';
import { MATCH_SESSIONS, RETURNS, type MatchSessionDoc, type ReturnRecordDoc } from '../lib/collections.js';
import { findCandidates, notifyBuyer, toCandidateList, NOTIFY_TIMEOUT_MS } from '../services/matchingEngine.js';

const CRON_EXPRESSION = '*/30 * * * *'; // every 30 minutes
// Don't re-run findCandidates for the same "searching" session more than once
// per window — updated_at doubles as "last search attempt" for sessions with
// no active notification in flight.
const SEARCH_RETRY_INTERVAL_MS = 2 * 60 * 60 * 1000;

export interface CascadeSummary {
  timeoutsAdvanced: number;
  searchesRetried: number;
  candidatesFound: number;
  sessionsExpired: number;
}

/** Sessions stuck waiting on a candidate who never responded within the
 * 2-hour window: mark that candidate timed out and cascade to the next one. */
async function handleTimeouts(db: Db): Promise<number> {
  const sessions = db.collection<MatchSessionDoc>(MATCH_SESSIONS);
  const cutoff = new Date(Date.now() - NOTIFY_TIMEOUT_MS);
  const notifying = await sessions.find({ status: 'notifying' }).toArray();

  let advanced = 0;
  for (const session of notifying) {
    const idx = session.current_candidate_index;
    const candidate = session.candidate_list[idx];
    if (!candidate || candidate.response !== 'pending' || !candidate.notified_at) continue;
    if (candidate.notified_at > cutoff) continue; // still within the window

    const now = new Date();
    await sessions.updateOne(
      { _id: session._id },
      {
        $set: {
          [`candidate_list.${idx}.response`]: 'timeout',
          [`candidate_list.${idx}.response_at`]: now,
          updated_at: now,
        },
      },
    );

    const nextIndex = idx + 1;
    if (nextIndex < session.candidate_list.length) {
      await notifyBuyer(session._id.toString(), nextIndex);
    } else {
      await sessions.updateOne({ _id: session._id }, { $set: { status: 'searching', updated_at: now } });
    }
    advanced += 1;
  }
  return advanced;
}

/** Sessions with no candidates left (or none ever found): re-run findCandidates
 * in case new buyers registered since the last attempt. */
async function retrySearches(db: Db): Promise<{ retried: number; found: number }> {
  const sessions = db.collection<MatchSessionDoc>(MATCH_SESSIONS);
  const now = new Date();
  const retryCutoff = new Date(now.getTime() - SEARCH_RETRY_INTERVAL_MS);

  const candidatesForRetry: WithId<MatchSessionDoc>[] = await sessions
    .find({ status: 'searching', pickup_deadline: { $gt: now }, updated_at: { $lte: retryCutoff } })
    .toArray();

  let retried = 0;
  let found = 0;
  for (const session of candidatesForRetry) {
    retried += 1;
    try {
      const ranked = await findCandidates(session.return_id);
      if (ranked.length > 0) {
        await sessions.updateOne(
          { _id: session._id },
          {
            $set: {
              candidate_list: toCandidateList(ranked),
              current_candidate_index: 0,
              status: 'notifying',
              updated_at: now,
            },
          },
        );
        await notifyBuyer(session._id.toString(), 0);
        found += 1;
      } else {
        await sessions.updateOne({ _id: session._id }, { $set: { updated_at: now } });
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error';
      log('error', 'matching cascade: retry search failed for session (continuing)', {
        sessionId: session._id.toString(),
        returnId: session.return_id,
        detail,
      });
    }
  }
  return { retried, found };
}

/** Sessions whose pickup window has closed without a match: fall back to the
 * warehouse so the item doesn't sit waiting forever. */
async function handleExpiry(db: Db): Promise<number> {
  const sessions = db.collection<MatchSessionDoc>(MATCH_SESSIONS);
  const now = new Date();
  const expiring: WithId<MatchSessionDoc>[] = await sessions
    .find({ pickup_deadline: { $lte: now }, status: { $nin: ['matched', 'warehouse_fallback', 'expired'] } })
    .toArray();

  for (const session of expiring) {
    await sessions.updateOne({ _id: session._id }, { $set: { status: 'warehouse_fallback', updated_at: now } });
    await db
      .collection<ReturnRecordDoc>(RETURNS)
      .updateOne({ returnId: session.return_id }, { $set: { local_routing_accepted: false } });
    log('warn', 'match session expired — falling back to warehouse', {
      returnId: session.return_id,
      sessionId: session._id.toString(),
    });
  }
  return expiring.length;
}

/** Run one cascade pass now. Exported directly so it can be triggered on
 * demand (tests, manual runs) without waiting for the cron tick. */
export async function runMatchingCascade(): Promise<CascadeSummary> {
  if (!isMongoConfigured()) {
    log('warn', 'matching cascade skipped — MongoDB not configured');
    return { timeoutsAdvanced: 0, searchesRetried: 0, candidatesFound: 0, sessionsExpired: 0 };
  }

  const db = await getDb();
  const timeoutsAdvanced = await handleTimeouts(db);
  const { retried, found } = await retrySearches(db);
  const sessionsExpired = await handleExpiry(db);

  const summary: CascadeSummary = {
    timeoutsAdvanced,
    searchesRetried: retried,
    candidatesFound: found,
    sessionsExpired,
  };
  log('info', 'matching cascade complete', { ...summary });
  return summary;
}

/** Schedule the 30-minute cascade. Returns the scheduled task (stoppable in
 * tests) or null when MongoDB isn't configured. Non-fatal: a failed run is
 * logged and the next tick still fires. */
export function scheduleMatchingCascade(): ScheduledTask | null {
  if (!isMongoConfigured()) {
    log('warn', 'matching cascade cron not scheduled — MongoDB not configured');
    return null;
  }
  const task = cron.schedule(CRON_EXPRESSION, () => {
    runMatchingCascade().catch((err: unknown) => {
      const detail = err instanceof Error ? err.message : 'unknown error';
      log('error', 'scheduled matching cascade failed', { detail });
    });
  });
  log('info', 'matching cascade scheduled', { cron: CRON_EXPRESSION });
  return task;
}
