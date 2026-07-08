// Narration for notification bodies (spec 024, phase 4) — same pattern as
// reprice-narrate.ts: the deterministic body every call site already builds
// (matchingCascade.ts, matchingEngine.ts, the Sales Agent) is ALWAYS correct
// and reproducible; an LLM may rephrase it more naturally, but on any
// failure/timeout the deterministic body stands untouched. Narration never
// changes title, severity, or which events fire — only prose.

import type { TraceMeta } from '../../lib/langfuse.js';

export interface Completer {
  complete: (prompt: string, meta?: TraceMeta) => Promise<string>;
}

export interface NotificationNarrateInput {
  title: string;
  body: string;
}

/** Try the LLM; fall back to the caller's own deterministic body. Never throws. */
export async function narrateNotification(
  input: NotificationNarrateInput,
  llm?: Completer,
  meta?: TraceMeta,
): Promise<string> {
  if (!llm) return input.body;
  try {
    const prompt = [
      'Rewrite this app notification body as exactly one short, friendly sentence.',
      'Keep every number and fact exactly as given — do not invent anything.',
      `Title: ${input.title}`,
      `Body: ${input.body}`,
      'One sentence only:',
    ].join('\n');
    const out = (await llm.complete(prompt, meta)).trim().split('\n')[0];
    return out && out.length > 0 ? out : input.body;
  } catch {
    return input.body;
  }
}
