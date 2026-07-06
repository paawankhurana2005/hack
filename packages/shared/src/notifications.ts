// In-app notification contracts (spec 024, phase 1). Before this, every
// seller-relevant state change — a matching cascade timing out, a buyer
// accepting, an agent escalating a listing — was only a structured log line
// (see apps/api/src/services/matchingEngine.ts's sendNotification stub). This
// is the first real, persisted, seller-visible notification surface. Stays
// in-app only: no real SMS/email/push provider (that's still out of scope,
// same deferral spec 020 already made twice).

export type NotificationKind = 'cascade_update' | 'sales_agent' | 'listing_agent';
export type NotificationSeverity = 'info' | 'warning' | 'success';

export interface Notification {
  id: string;
  sellerId: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  body: string;
  returnId?: string;
  listingId?: string;
  read: boolean;
  createdAt: string; // ISO
}

/** Per-seller notification preferences (spec 024, phase 4). `mutedKinds`
 *  suppresses a kind entirely; quiet hours (server-local hour-of-day, 0–23,
 *  wrapping past midnight when `start > end`) suppress only `info`-severity
 *  notifications — a `warning`/`success` always comes through, since those
 *  are the ones actually worth waking up for. A demo simplification: hours
 *  are server-local, not per-seller timezone. */
export interface NotificationPreferences {
  sellerId: string;
  mutedKinds: NotificationKind[];
  quietHoursStart?: number; // 0-23
  quietHoursEnd?: number; // 0-23
}
