// Spec 026: plain-language proof a real model call happened, or an honest
// note that it didn't. Never shows trace ids, model version strings, or the
// word "Langfuse" — this is seller-facing, not a technical debug view.
// Langfuse itself (once credentialed) is a separate, deeper trace store for
// anyone who goes looking outside the app.

import type { AgentModelMeta } from '@reloop/shared';

export function ModelMetaBadge({ modelMeta }: { modelMeta?: AgentModelMeta }) {
  if (!modelMeta) return null;
  if (modelMeta.usedFallback) {
    return (
      <span className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-muted-foreground/50" />
        Used a saved response — AI check unavailable
      </span>
    );
  }
  return (
    <span className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] text-success">
      <span className="size-1.5 rounded-full bg-success" />
      AI checked the market just now ({modelMeta.latencyMs}ms)
    </span>
  );
}
