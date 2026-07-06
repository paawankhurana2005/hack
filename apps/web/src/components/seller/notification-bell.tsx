'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Notification, NotificationKind, NotificationPreferences, NotificationSeverity } from '@reloop/shared';
import {
  getNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  setNotificationPreferences,
} from '@/lib/api-client';

const POLL_MS = 25_000;

const SEVERITY_DOT: Record<NotificationSeverity, string> = {
  info: 'bg-sky-400',
  warning: 'bg-amber-400',
  success: 'bg-emerald-400',
};

const KIND_LABEL: Record<NotificationKind, string> = {
  cascade_update: 'Buyer matching updates',
  sales_agent: 'Sales Agent runs',
  listing_agent: 'Listing Agent escalations',
};
const ALL_KINDS: NotificationKind[] = ['cascade_update', 'sales_agent', 'listing_agent'];

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** The seller dashboard's real notification inbox (spec 024) — fed by the
 *  matching cascade job, the Sales Agent, and the Listing Agent. In-app only. */
export function NotificationBell({ sellerId }: { sellerId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    if (!sellerId) return;
    listNotifications(sellerId, { limit: 20 })
      .then((res) => setNotifications(res.notifications))
      .catch(() => {
        // API down / Mongo unconfigured — inbox just stays empty, never crashes the page.
      });
  }, [sellerId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  function handleOpen() {
    setOpen((v) => !v);
  }

  function handleMarkRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    void markNotificationRead(id).catch(() => {});
  }

  function handleClearAll() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    void markAllNotificationsRead(sellerId).catch(() => {});
  }

  function handleTogglePrefs() {
    const next = !showPrefs;
    setShowPrefs(next);
    if (next && !prefs && sellerId) {
      getNotificationPreferences(sellerId)
        .then(setPrefs)
        .catch(() => setPrefs({ sellerId, mutedKinds: [] }));
    }
  }

  function toggleMuted(kind: NotificationKind) {
    if (!prefs) return;
    const mutedKinds = prefs.mutedKinds.includes(kind)
      ? prefs.mutedKinds.filter((k) => k !== kind)
      : [...prefs.mutedKinds, kind];
    const next = { ...prefs, mutedKinds };
    setPrefs(next);
    void setNotificationPreferences(sellerId, next).catch(() => {});
  }

  function setQuietHours(field: 'quietHoursStart' | 'quietHoursEnd', value: string) {
    if (!prefs) return;
    const n = value === '' ? undefined : Math.max(0, Math.min(23, Number(value)));
    const next = { ...prefs, [field]: n };
    setPrefs(next);
    void setNotificationPreferences(sellerId, next).catch(() => {});
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Notifications"
        className="relative grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="size-5">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-brand font-mono text-[9px] font-semibold text-brand-foreground">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-2xl bg-card shadow-lg ring-1 ring-border">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-brand">Notifications</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleTogglePrefs}
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-brand"
              >
                {showPrefs ? 'Back' : 'Preferences'}
              </button>
              {!showPrefs && unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-brand"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {showPrefs ? (
            <div className="space-y-4 px-4 py-4">
              <div>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Muted
                </p>
                <ul className="space-y-1.5">
                  {ALL_KINDS.map((kind) => (
                    <li key={kind} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{KIND_LABEL[kind]}</span>
                      <input
                        type="checkbox"
                        checked={!!prefs?.mutedKinds.includes(kind)}
                        onChange={() => toggleMuted(kind)}
                        className="size-4 accent-brand"
                      />
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Quiet hours (routine updates only)
                </p>
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={prefs?.quietHoursStart ?? ''}
                    onChange={(e) => setQuietHours('quietHoursStart', e.target.value)}
                    placeholder="from"
                    className="w-16 rounded-full bg-secondary px-3 py-1 text-center ring-1 ring-border focus:outline-none focus:ring-brand/50"
                  />
                  <span className="text-muted-foreground">to</span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={prefs?.quietHoursEnd ?? ''}
                    onChange={(e) => setQuietHours('quietHoursEnd', e.target.value)}
                    placeholder="to"
                    className="w-16 rounded-full bg-secondary px-3 py-1 text-center ring-1 ring-border focus:outline-none focus:ring-brand/50"
                  />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    hour (0-23)
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Warnings and successes always come through — this only quiets routine updates.
                </p>
              </div>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing yet.</p>
              ) : (
                <ul>
                  {notifications.map((n) => (
                    <li
                      key={n.id}
                      onClick={() => !n.read && handleMarkRead(n.id)}
                      className={`cursor-pointer border-b border-border/40 px-4 py-3 last:border-0 hover:bg-secondary/40 ${
                        n.read ? 'opacity-60' : ''
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${SEVERITY_DOT[n.severity]}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground">{n.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
                            {timeAgo(n.createdAt)}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
