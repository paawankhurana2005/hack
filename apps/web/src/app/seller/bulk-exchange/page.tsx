'use client';

import { useState } from 'react';

// ─── Demo data ────────────────────────────────────────────────────────────────
const SELLER = {
  name: 'ElectroMart Wholesale Pvt Ltd',
  gst: '27AABCE1234F1Z5',
  id: 'AMZ-SEL-00492',
  location: 'Pune, Maharashtra',
};

type BatchStatus = 'matched' | 'partial' | 'completed';

const BATCHES: {
  id: string;
  category: string;
  description: string;
  units: number;
  initiated: string;
  grades: { A: number; B: number; C: number; D: number };
  status: BatchStatus;
  matchedWith: string;
  matchNote: string;
  remaining: string | null;
  dealValue: number;
  amazonCut: number;
  sellerEarnings: number;
  logistics: string;
  logisticsNote: string;
}[] = [
  {
    id: 'BLK-2024-0091',
    category: 'Consumer Electronics',
    description: '200 units (mixed — laptops, tablets, chargers)',
    units: 200,
    initiated: '12 Jun 2025',
    grades: { A: 110, B: 60, C: 30, D: 0 },
    status: 'matched',
    matchedWith: 'Renew Tech Solutions',
    matchNote: 'Verified Refurbisher · Mumbai',
    remaining: null,
    dealValue: 420000,
    amazonCut: 42000,
    sellerEarnings: 378000,
    logistics: 'Amazon Handled',
    logisticsNote: 'Pickup scheduled 15 Jun 2025',
  },
  {
    id: 'BLK-2024-0087',
    category: 'Home Appliances',
    description: '85 units (ACs, geysers, fans)',
    units: 85,
    initiated: '5 Jun 2025',
    grades: { A: 20, B: 40, C: 25, D: 0 },
    status: 'partial',
    matchedWith: 'GreenHome NGO',
    matchNote: 'Donation · 25 units Grade C',
    remaining: '60 units still searching for buyer',
    dealValue: 110000,
    amazonCut: 11000,
    sellerEarnings: 99000,
    logistics: 'Pending',
    logisticsNote: 'Pending for remaining units',
  },
  {
    id: 'BLK-2024-0081',
    category: 'Kitchen Appliances',
    description: '120 units (mixers, OTGs, induction cooktops)',
    units: 120,
    initiated: '28 May 2025',
    grades: { A: 80, B: 30, C: 0, D: 10 },
    status: 'completed',
    matchedWith: 'QuickResale Pvt Ltd',
    matchNote: 'Wholesaler · Nashik',
    remaining: null,
    dealValue: 285000,
    amazonCut: 28500,
    sellerEarnings: 256500,
    logistics: 'Delivered',
    logisticsNote: 'Completed 8 Jun 2025',
  },
];

const STATUS_STYLE: Record<BatchStatus, { label: string; cls: string }> = {
  matched: { label: 'Matched with Buyer', cls: 'bg-brand/15 text-brand' },
  partial: { label: 'Partially Matched', cls: 'bg-secondary text-foreground' },
  completed: { label: 'Completed', cls: 'bg-success/15 text-success' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

// ─── Grade stacked bar ────────────────────────────────────────────────────────
function GradeBar({ grades, total }: { grades: { A: number; B: number; C: number; D: number }; total: number }) {
  return (
    <div>
      <div className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-secondary">
        {grades.A > 0 && (
          <div className="h-full bg-emerald-500" style={{ width: `${(grades.A / total) * 100}%` }} />
        )}
        {grades.B > 0 && (
          <div className="h-full bg-brand" style={{ width: `${(grades.B / total) * 100}%` }} />
        )}
        {grades.C > 0 && (
          <div className="h-full bg-orange-500" style={{ width: `${(grades.C / total) * 100}%` }} />
        )}
        {grades.D > 0 && (
          <div className="h-full bg-destructive" style={{ width: `${(grades.D / total) * 100}%` }} />
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-4">
        {grades.A > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block size-2 rounded-full bg-emerald-500" />
            Grade A · {grades.A}
          </span>
        )}
        {grades.B > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block size-2 rounded-full bg-brand" />
            Grade B · {grades.B}
          </span>
        )}
        {grades.C > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block size-2 rounded-full bg-orange-500" />
            Grade C · {grades.C}
          </span>
        )}
        {grades.D > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block size-2 rounded-full bg-destructive" />
            Grade D · {grades.D}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── New Batch modal ──────────────────────────────────────────────────────────
function NewBatchModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface/80 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-card p-8 shadow-2xl shadow-black/50 ring-1 ring-border">
        <div className="flex items-start justify-between">
          <div>
            <span className="block font-mono text-xs uppercase tracking-widest text-brand">
              Bulk Exchange
            </span>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
              Submit a New Batch
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <svg className="size-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Product Category
            </label>
            <input
              type="text"
              placeholder="e.g. Consumer Electronics"
              className="w-full rounded-lg bg-secondary px-4 py-2.5 text-sm text-foreground ring-1 ring-border placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Number of Units
            </label>
            <input
              type="number"
              placeholder="e.g. 150"
              className="w-full rounded-lg bg-secondary px-4 py-2.5 text-sm text-foreground ring-1 ring-border placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Product Description
            </label>
            <textarea
              rows={3}
              placeholder="Brief description of products and condition..."
              className="w-full resize-none rounded-lg bg-secondary px-4 py-2.5 text-sm text-foreground ring-1 ring-border placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Preferred Outcome
            </label>
            <select className="w-full rounded-lg bg-secondary px-4 py-2.5 text-sm text-foreground ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-ring">
              <option>Let AI decide</option>
              <option>Resale preferred</option>
              <option>Donation accepted</option>
              <option>Refurbisher only</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="inline-flex flex-1 items-center justify-center rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-brand hover:text-brand"
          >
            Cancel
          </button>
          <button className="inline-flex flex-1 items-center justify-center rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground ring-1 ring-brand/50 transition hover:bg-brand-strong active:scale-95">
            Submit Batch
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function BulkExchangePage() {
  const [modalOpen, setModalOpen] = useState(false);

  const totalUnits = BATCHES.reduce((s, b) => s + b.units, 0);
  const totalEarnings = BATCHES.reduce((s, b) => s + b.sellerEarnings, 0);
  const logisticsHandled = BATCHES.filter(
    (b) => b.logistics === 'Amazon Handled' || b.logistics === 'Delivered',
  ).length;

  return (
    <div>
      {modalOpen && <NewBatchModal onClose={() => setModalOpen(false)} />}

      {/* Page header */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <span className="mb-3 block font-mono text-xs uppercase tracking-widest text-brand">
            Seller / Bulk Exchange
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">B2B Bulk Exchange</h1>
          <p className="mt-2 text-muted-foreground">
            Offload excess or returned inventory in batches — AI-matched to verified refurbishers, NGOs, and wholesalers.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="mt-1 inline-flex shrink-0 items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground ring-1 ring-brand/50 transition hover:bg-brand-strong hover:shadow-[0_0_30px_rgba(234,179,8,0.25)] active:scale-95"
        >
          <svg className="size-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Batch
        </button>
      </div>

      {/* Seller identity card */}
      <div className="mt-6 rounded-2xl bg-card p-6 ring-1 ring-border">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Seller Account
            </p>
            <p className="mt-1 text-lg font-semibold text-foreground">{SELLER.name}</p>
          </div>
          <span className="rounded-full bg-brand/15 px-3 py-1 font-mono text-xs font-semibold text-brand">
            ✓ Verified Seller
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-6 border-t border-border/60 pt-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">GST Number</p>
            <p className="mt-1 font-mono text-sm text-foreground">{SELLER.gst}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Seller ID</p>
            <p className="mt-1 font-mono text-sm text-foreground">{SELLER.id}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Location</p>
            <p className="mt-1 text-sm text-foreground">{SELLER.location}</p>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="mt-5 grid grid-cols-4 overflow-hidden rounded-2xl bg-secondary ring-1 ring-border">
        {[
          { label: 'Total Batches', value: BATCHES.length.toString() },
          { label: 'Total Units', value: totalUnits.toLocaleString('en-IN') },
          { label: 'Seller Earnings', value: formatINR(totalEarnings) },
          { label: 'Logistics Handled', value: `${logisticsHandled}/${BATCHES.length}` },
        ].map((s, i) => (
          <div key={s.label} className={`py-5 text-center ${i > 0 ? 'border-l border-border' : ''}`}>
            <p className="text-2xl font-black tracking-tight tabular-nums text-brand">{s.value}</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Batch cards */}
      <div className="mt-6 flex flex-col gap-5">
        {BATCHES.map((batch, i) => {
          const status = STATUS_STYLE[batch.status];
          return (
            <div
              key={batch.id}
              className="overflow-hidden rounded-2xl bg-card ring-1 ring-border"
              style={{ animation: 'fade-up 0.45s ease both', animationDelay: `${i * 80}ms` }}
            >
              {/* Batch header bar */}
              <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
                <div className="flex items-center gap-3">
                  <p className="font-mono text-sm font-semibold text-brand">{batch.id}</p>
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {batch.category}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">Initiated {batch.initiated}</span>
                  <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${status.cls}`}>
                    {status.label}
                  </span>
                </div>
              </div>

              {/* Batch body */}
              <div className="grid grid-cols-[1fr_220px] gap-6 p-6">
                {/* Left: grade bar + match + logistics */}
                <div className="flex flex-col gap-5">
                  {/* Grade breakdown */}
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        AI Grade Breakdown
                      </p>
                      <p className="text-sm font-semibold text-foreground">{batch.units} units</p>
                    </div>
                    <GradeBar grades={batch.grades} total={batch.units} />
                  </div>

                  {/* Matched buyer */}
                  <div>
                    <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Matched With
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{batch.matchedWith}</span>
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-brand">
                        ✓ Verified
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{batch.matchNote}</p>
                    {batch.remaining && (
                      <p className="mt-1.5 text-xs text-warning">{batch.remaining}</p>
                    )}
                  </div>

                  {/* Logistics */}
                  <div>
                    <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Logistics
                    </p>
                    <p className="text-sm font-medium text-foreground">{batch.logistics}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{batch.logisticsNote}</p>
                  </div>
                </div>

                {/* Right: financial summary panel */}
                <div className="flex flex-col gap-3 rounded-xl bg-secondary/60 p-5 ring-1 ring-border">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Deal Summary
                  </p>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Deal Value</p>
                    <p className="text-lg font-bold tabular-nums text-foreground">
                      {formatINR(batch.dealValue)}
                    </p>
                  </div>
                  <div className="border-t border-border/60 pt-3">
                    <p className="text-[10px] text-muted-foreground">Amazon Cut (10%)</p>
                    <p className="text-sm font-semibold tabular-nums text-destructive">
                      −{formatINR(batch.amazonCut)}
                    </p>
                  </div>
                  <div className="border-t border-border pt-3">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-brand">Your Earnings</p>
                    <p className="text-2xl font-black tabular-nums text-brand">
                      {formatINR(batch.sellerEarnings)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
