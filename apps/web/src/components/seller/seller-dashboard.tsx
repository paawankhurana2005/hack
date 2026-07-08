'use client';

// Seller Overview — the operations dashboard (ported from the design in
// newFrontend/src/routes/dashboard.tsx): KPIs, routing distribution, hourly
// throughput, a live decision feed, and the inventory pipeline. Adapted to the
// app's design tokens and to ₹ (no $ figures). Data is illustrative demo data.

import { useState } from 'react';
import Link from 'next/link';
import { useRole } from '@/lib/role-context';

// ── Money ─────────────────────────────────────────────────────────────────────
const inr = (n: number): string => `₹${n.toLocaleString('en-IN')}`;

type RouteType = 'resale' | 'refurb' | 'donate' | 'recycle';
type Grade = 'A' | 'B+' | 'B' | 'C' | 'D';

interface Row {
  id: string;
  item: string;
  grade: Grade;
  source: string;
  route: string;
  type: RouteType;
  recovery: number; // ₹
  time: string;
}

const ROWS: Row[] = [
  { id: 'AMZ-9021-KLX', item: 'Kindle Paperwhite', grade: 'A', source: 'Doorstep · Koramangala', route: 'Direct Resale · Buyer 9.2km', type: 'resale', recovery: 10450, time: '2m ago' },
  { id: 'AMZ-8842-TRV', item: 'Anker PowerCore 26K', grade: 'B+', source: 'Marketplace · Sell', route: 'Buyer Matched · 4.1km', type: 'resale', recovery: 4820, time: '6m ago' },
  { id: 'AMZ-7712-QPC', item: 'Bose QuietComfort 45', grade: 'B', source: 'Doorstep · Indiranagar', route: 'Refurbish Hub · BLR-4', type: 'refurb', recovery: 18900, time: '11m ago' },
  { id: 'AMZ-6610-DKR', item: 'Levoit Core 300 Air Purifier', grade: 'C', source: 'Excess Inventory', route: 'Local Donation · Goonj', type: 'donate', recovery: 0, time: '14m ago' },
  { id: 'AMZ-5519-ZBN', item: 'Ninja Foodi 8-qt', grade: 'A', source: 'Doorstep · Whitefield', route: 'Direct Resale · Buyer 2.7km', type: 'resale', recovery: 14200, time: '18m ago' },
  { id: 'AMZ-4408-MGT', item: 'Logitech MX Master 3S', grade: 'B+', source: 'Marketplace · Sell', route: 'Buyer Matched · 11.4km', type: 'resale', recovery: 7240, time: '22m ago' },
  { id: 'AMZ-3392-LWQ', item: 'Dyson V11 Battery Pack', grade: 'D', source: 'Doorstep · HSR Layout', route: 'Materials Recovery · KA-R2', type: 'recycle', recovery: 480, time: '27m ago' },
  { id: 'AMZ-2287-CRX', item: 'Sony WH-1000XM5', grade: 'A', source: 'Doorstep · Jayanagar', route: 'Direct Resale · Buyer 6.0km', type: 'resale', recovery: 26800, time: '34m ago' },
];

const FEED = [
  { t: 'Direct resale matched', s: 'Sony WH-1000XM5 · 6.0km', g: 'A', tone: 'bg-brand' },
  { t: 'Routed to refurb', s: 'Bose QC45 · BLR-4', g: 'B', tone: 'bg-warning' },
  { t: 'Marked for donation', s: 'Levoit Core 300 · Goonj', g: 'C', tone: 'bg-success' },
  { t: 'Direct resale matched', s: 'Kindle Paperwhite · 9.2km', g: 'A', tone: 'bg-brand' },
  { t: 'Materials recovery', s: 'Dyson V11 battery · KA-R2', g: 'D', tone: 'bg-muted-foreground' },
];

const THROUGHPUT = [28, 42, 36, 51, 60, 48, 72, 65, 88, 74, 92, 80, 96, 84, 70, 58, 64, 78, 86, 72, 60, 50, 38, 44];

const TABS: Array<'all' | RouteType> = ['all', 'resale', 'refurb', 'donate', 'recycle'];

// ── Small pieces ────────────────────────────────────────────────────────────
function Kpi({ label, value, delta, trend, accent }: { label: string; value: string; delta: string; trend: 'up' | 'down'; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-5 ring-1 ${accent ? 'bg-brand/10 ring-brand/40' : 'bg-card ring-border'}`}>
      <div className={`font-mono text-[10px] font-bold uppercase tracking-widest ${accent ? 'text-brand' : 'text-muted-foreground'}`}>
        {label}
      </div>
      <div className="mt-3 font-mono text-3xl font-bold tracking-tighter tabular-nums text-foreground">{value}</div>
      <div className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${trend === 'up' ? 'text-success' : 'text-danger'}`}>
        <span>{trend === 'up' ? '↑' : '↓'}</span>
        <span>{delta}</span>
        <span className="ml-1 font-normal text-muted-foreground">vs yesterday</span>
      </div>
    </div>
  );
}

function RouteLegend({ dot, label, value, sub }: { dot: string; label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className={`size-2 rounded-full ${dot}`} />
        <span className="text-xs font-semibold text-foreground">{label}</span>
      </div>
      <div className="mt-1 font-mono text-xl font-bold text-foreground">{value}</div>
      <div className="font-mono text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}

const GRADE_TONE: Record<Grade, string> = {
  A: 'bg-success/15 text-success ring-success/30',
  'B+': 'bg-warning/15 text-warning ring-warning/30',
  B: 'bg-warning/15 text-warning ring-warning/30',
  C: 'bg-secondary text-muted-foreground ring-border',
  D: 'bg-danger/15 text-danger ring-danger/30',
};

function GradeBadge({ grade }: { grade: Grade }) {
  return (
    <span className={`inline-flex rounded px-2 py-0.5 font-mono text-[11px] font-bold ring-1 ${GRADE_TONE[grade]}`}>
      {grade}
    </span>
  );
}

const ROUTE_DOT: Record<RouteType, string> = {
  resale: 'bg-brand',
  refurb: 'bg-warning',
  donate: 'bg-success',
  recycle: 'bg-muted-foreground',
};

// ── Dashboard ──────────────────────────────────────────────────────────────
export function SellerDashboard() {
  const { account } = useRole();
  const [tab, setTab] = useState<'all' | RouteType>('all');

  const firstName = account?.name?.split(' ')[0] ?? 'there';
  const rows = tab === 'all' ? ROWS : ROWS.filter((r) => r.type === tab);

  return (
    <div className="flex flex-col gap-6" style={{ animation: 'fade-up 0.4s ease both' }}>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-brand">
            Operations · Bengaluru Cluster
          </span>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Hi, {firstName}.</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s what your routing engine has handled in the last 24 hours.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            Export report
          </button>
          <Link
            href="/seller/returns"
            className="rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-brand-foreground transition-colors hover:bg-brand-strong"
          >
            + New intake
          </Link>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Recovery · 24h" value={inr(1842100)} delta="+12.4%" trend="up" accent />
        <Kpi label="Items Routed" value="8,491" delta="+6.1%" trend="up" />
        <Kpi label="Avg. Grade Time" value="4.2s" delta="-0.3s" trend="up" />
        <Kpi label="Warehouse Space Saved" value="2,140 ft³" delta="+18%" trend="up" />
      </div>

      {/* Routing distribution + Live feed */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Routing Distribution
              </div>
              <h3 className="mt-1 text-lg font-bold text-foreground">Where items went today</h3>
            </div>
            <select className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground">
              <option>Last 24h</option>
              <option>Last 7d</option>
              <option>Last 30d</option>
            </select>
          </div>

          <div className="mt-6">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
              <div className="bg-brand" style={{ width: '44%' }} />
              <div className="bg-warning" style={{ width: '26%' }} />
              <div className="bg-success" style={{ width: '18%' }} />
              <div className="bg-muted-foreground/40" style={{ width: '12%' }} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <RouteLegend dot="bg-brand" label="Resale" value="44%" sub="3,736 items" />
              <RouteLegend dot="bg-warning" label="Refurbish" value="26%" sub="2,208 items" />
              <RouteLegend dot="bg-success" label="Donate" value="18%" sub="1,528 items" />
              <RouteLegend dot="bg-muted-foreground/40" label="Recycle" value="12%" sub="1,019 items" />
            </div>
          </div>

          {/* Hourly throughput */}
          <div className="mt-8 border-t border-border pt-6">
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Hourly Throughput
            </div>
            <div className="mt-4 flex h-32 items-end gap-1.5">
              {THROUGHPUT.map((h, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={`w-full rounded-t ${i === 12 ? 'bg-brand' : 'bg-brand/30'}`}
                    style={{ height: `${h}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
              <span>00:00</span>
              <span>06:00</span>
              <span>12:00</span>
              <span>18:00</span>
              <span>now</span>
            </div>
          </div>
        </div>

        {/* Live feed */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Live Feed
              </div>
              <h3 className="mt-1 text-lg font-bold text-foreground">Recent decisions</h3>
            </div>
            <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-brand">
              <span className="size-1.5 animate-pulse rounded-full bg-brand" />
              Live
            </span>
          </div>
          <ul className="mt-5 space-y-4">
            {FEED.map((e, i) => (
              <li key={i} className="flex items-start gap-3 border-b border-border pb-4 last:border-0 last:pb-0">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${e.tone}`} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">{e.t}</div>
                  <div className="text-xs text-muted-foreground">{e.s}</div>
                </div>
                <span className="font-mono text-[11px] font-bold text-muted-foreground">{e.g}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Inventory pipeline */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Inventory Pipeline
            </div>
            <h3 className="mt-1 text-lg font-bold text-foreground">Items in motion</h3>
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-secondary p-1 font-mono text-[10px] font-bold uppercase tracking-widest">
            {TABS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`rounded-lg px-3 py-1.5 transition-colors ${
                  tab === k ? 'bg-card text-brand shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-secondary/60 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <th className="px-6 py-3">Item</th>
                <th className="px-6 py-3">Grade</th>
                <th className="px-6 py-3">Source</th>
                <th className="px-6 py-3">Routing Outcome</th>
                <th className="px-6 py-3">Logged</th>
                <th className="px-6 py-3 text-right">Recovery</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-secondary/40">
                  <td className="px-6 py-4">
                    <div className="font-medium text-foreground">{r.item}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{r.id}</div>
                  </td>
                  <td className="px-6 py-4">
                    <GradeBadge grade={r.grade} />
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{r.source}</td>
                  <td className="px-6 py-4 text-foreground">
                    <span className="flex items-center gap-2">
                      <span className={`size-2 rounded-full ${ROUTE_DOT[r.type]}`} />
                      {r.route}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-muted-foreground">{r.time}</td>
                  <td className="px-6 py-4 text-right font-mono font-semibold text-foreground">
                    {r.recovery > 0 ? inr(r.recovery) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border px-6 py-3 text-xs text-muted-foreground">
          <span>Showing {rows.length} of 8,491 items</span>
          <div className="flex gap-2">
            <button type="button" className="rounded-md border border-border px-3 py-1 hover:bg-secondary">Prev</button>
            <button type="button" className="rounded-md border border-border px-3 py-1 hover:bg-secondary">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
