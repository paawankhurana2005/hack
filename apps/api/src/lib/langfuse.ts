// Langfuse tracing for every NVIDIA model call (spec 022). Mirrors lib/mongo.ts's
// shape: a lazily-constructed singleton, gated entirely by whether keys are
// configured, so the app boots and every model call behaves identically with
// or without an account — tracing is pure enrichment, never a dependency.

import { Langfuse } from 'langfuse';
import { config } from '../config.js';

let client: Langfuse | null = null;

/** Whether Langfuse credentials are configured for this process. */
export function isLangfuseConfigured(): boolean {
  return Boolean(config.LANGFUSE_PUBLIC_KEY && config.LANGFUSE_SECRET_KEY);
}

function getClient(): Langfuse {
  if (!client) {
    client = new Langfuse({
      publicKey: config.LANGFUSE_PUBLIC_KEY,
      secretKey: config.LANGFUSE_SECRET_KEY,
      baseUrl: config.LANGFUSE_BASE_URL,
    });
  }
  return client;
}

/** Correlating ids a caller can attach to a traced model call — all optional,
 *  since not every call site has every id in scope. */
export interface TraceMeta {
  name?: string;
  returnId?: string;
  listingId?: string;
  reqId?: string;
}

/** Token counts from the model provider's response, when it reports them —
 *  lets Langfuse compute cost automatically instead of a trace with no usage. */
export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ModelCallResult {
  output: string;
  usage?: TokenUsage;
}

/**
 * Wrap a single model call in a Langfuse trace + generation. No-ops (just
 * calls `fn()`) when Langfuse isn't configured, so this is safe to call
 * unconditionally from every model call site.
 *
 * `sessionId` groups every trace for one listing/return together (falls back
 * to `returnId` when there's no listing yet, e.g. a doorstep grading call) so
 * a seller's whole "story" for one item is one Session in the Langfuse UI.
 * `tags` gets one entry — the call site's feature area, derived from the
 * `name`'s prefix (`agent.narrate` → `agent`) — for free per-feature filtering
 * with no extra parameter for every call site to pass.
 */
export async function traceModelCall(
  meta: TraceMeta,
  model: string,
  input: unknown,
  fn: () => Promise<ModelCallResult>,
): Promise<string> {
  if (!isLangfuseConfigured()) return (await fn()).output;

  const name = meta.name ?? 'nvidia-chat';
  const sessionId = meta.listingId ?? meta.returnId;
  const feature = name.split('.')[0] ?? name;
  const lf = getClient();
  const trace = lf.trace({
    name,
    sessionId,
    tags: [feature],
    metadata: { returnId: meta.returnId, listingId: meta.listingId, reqId: meta.reqId },
  });
  const generation = trace.generation({ name, model, input });

  try {
    const result = await fn();
    generation.end({ output: result.output, usage: result.usage });
    return result.output;
  } catch (err) {
    generation.end({
      output: null,
      level: 'ERROR',
      statusMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    // Fire-and-forget: this is a long-running Express process, not a
    // short-lived function, so we don't need to block the request on the
    // flush — just make sure buffered events don't sit in memory forever.
    void lf.flushAsync().catch(() => {});
  }
}

/** Flush buffered events on graceful shutdown. */
export async function shutdownLangfuse(): Promise<void> {
  if (client) await client.shutdownAsync();
}
