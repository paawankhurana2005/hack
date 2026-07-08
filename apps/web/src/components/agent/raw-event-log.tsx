// The technical twin of ActivityFeed's friendly text — renders one AgentEvent
// as the real structured object, monospace. This is the exact same data
// use-item-agent-runner.ts already logs to console.groupCollapsed while
// recording a demo; this component brings it into the page itself so it's
// visible on a shared screen without opening devtools.

import type { AgentEvent } from '@reloop/shared';

function compact(e: AgentEvent): Record<string, unknown> {
  const out: Record<string, unknown> = { day: e.day, phase: e.phase, action: e.action };
  if (e.factors?.length) out['factors'] = Object.fromEntries(e.factors.map((f) => [f.label, f.value]));
  if (e.priceFromCents !== undefined) out['priceFrom'] = `₹${Math.round(e.priceFromCents / 100)}`;
  if (e.priceToCents !== undefined) out['priceTo'] = `₹${Math.round(e.priceToCents / 100)}`;
  if (e.floorCents !== undefined) out['floor'] = `₹${Math.round(e.floorCents / 100)}`;
  if (e.routeRecommendation) out['routeRecommendation'] = e.routeRecommendation;
  if (e.listingTitle) out['listingTitle'] = e.listingTitle;
  if (e.modelMeta) out['modelMeta'] = e.modelMeta;
  out['at'] = e.at;
  return out;
}

export function RawEventLog({ event }: { event: AgentEvent }) {
  return (
    <pre className="mt-1 overflow-x-auto rounded-lg bg-[#0b1220] px-2.5 py-1.5 font-mono text-[10px] leading-4 text-[#9fe6a0]">
      {JSON.stringify(compact(event))}
    </pre>
  );
}
