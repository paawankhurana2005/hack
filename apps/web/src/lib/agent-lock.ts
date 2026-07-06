// Manual-control lock for the Listing Agent (spec 024, phase 5). A listing
// whose OWN detail page is actively driving its clock (manual "Advance 1 day"
// or auto-run) must not also be ticked by the Sales Agent's scheduled runs in
// the background — that would double-advance the listing's simulated day
// counter for a reason the seller watching the page can't see. This is the
// exact race spec 024's Phase 1 named when deciding scheduled runs were out
// of scope; this lock is what makes Phase 5 safe to turn on.
//
// In-memory only (per browser tab) — deliberately not persisted, since the
// lock only needs to outlive the page that's actively driving the clock.

const locked = new Set<string>();

export function acquireManualLock(id: string): void {
  locked.add(id);
}

export function releaseManualLock(id: string): void {
  locked.delete(id);
}

export function isManuallyLocked(id: string): boolean {
  return locked.has(id);
}
