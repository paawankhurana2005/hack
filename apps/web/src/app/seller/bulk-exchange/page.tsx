'use client';

import { useState, useEffect, useRef } from 'react';
import {
  getBatches,
  updateBatch,
  addBatch,
  generateBatchId,
  generateGrades,
  generateMatch,
  generateRematching,
  type BulkBatch,
  type BulkMatch,
} from '@/lib/mocks/bulk-exchange-store';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

function timeAgo(iso: string) {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase();
}

// ─── Grade bar ────────────────────────────────────────────────────────────────
function GradeBar({
  grades,
  total,
  animate = false,
}: {
  grades: { A: number; B: number; C: number; D: number };
  total: number;
  animate?: boolean;
}) {
  const [visible, setVisible] = useState(!animate);
  useEffect(() => {
    if (!animate) return;
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, [animate]);

  const pct = (n: number) => (visible ? ((n / total) * 100).toFixed(0) : 0);

  const segments = [
    { key: 'A', n: grades.A, bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
    { key: 'B', n: grades.B, bar: 'bg-brand', dot: 'bg-brand' },
    { key: 'C', n: grades.C, bar: 'bg-orange-500', dot: 'bg-orange-500' },
    { key: 'D', n: grades.D, bar: 'bg-red-500', dot: 'bg-red-500' },
  ].filter((s) => s.n > 0);

  return (
    <div className="space-y-2">
      <div className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-secondary">
        {segments.map((s) => (
          <div
            key={s.key}
            className={`h-full ${s.bar} transition-all duration-700`}
            style={{ width: `${visible ? (s.n / total) * 100 : 0}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={`inline-block size-1.5 rounded-full ${s.dot}`} />
            <span className="font-medium text-foreground">Grade {s.key}</span>
            <span className="tabular-nums">{s.n}</span>
            <span className="text-border">·</span>
            <span className="tabular-nums">{pct(s.n)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
function Spinner({ cls = 'size-4' }: { cls?: string }) {
  return (
    <svg className={`${cls} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ─── Buyer avatar ─────────────────────────────────────────────────────────────
function BuyerAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center rounded-xl bg-brand/15 font-bold text-brand ${
        size === 'sm' ? 'size-8 text-sm' : 'size-10 text-base'
      }`}
    >
      {initial(name)}
    </div>
  );
}

// ─── Inline label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  );
}

// ─── Processing step ──────────────────────────────────────────────────────────
function ProcessStep({
  label,
  state,
  children,
}: {
  label: string;
  state: 'done' | 'active' | 'pending';
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="relative flex flex-col items-center">
        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
          {state === 'done' && (
            <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-500">
              ✓
            </span>
          )}
          {state === 'active' && <Spinner cls="size-4 text-brand" />}
          {state === 'pending' && (
            <span className="size-2 rounded-full bg-border" />
          )}
        </div>
        {/* connector */}
        <div className="mt-1 w-px flex-1 bg-border" />
      </div>
      <div className="flex-1 pb-5">
        <p
          className={`text-sm font-medium leading-5 ${
            state === 'done' ? 'text-foreground' : state === 'active' ? 'text-brand' : 'text-muted-foreground'
          }`}
        >
          {label}
        </p>
        {state !== 'pending' && children}
      </div>
    </div>
  );
}

// ─── New Batch Modal ──────────────────────────────────────────────────────────
interface NewBatchModalProps {
  onClose: () => void;
  onCreated: (batch: BulkBatch) => void;
}

function NewBatchModal({ onClose, onCreated }: NewBatchModalProps) {
  const [stage, setStage] = useState<'form' | 'processing' | 'done'>('form');
  const [processStep, setProcessStep] = useState(0);
  const [category, setCategory] = useState('');
  const [unitsStr, setUnitsStr] = useState('');
  const [description, setDescription] = useState('');
  const [preferred, setPreferred] = useState('Let AI decide');
  const [grades, setGrades] = useState<{ A: number; B: number; C: number; D: number } | null>(null);
  const [match, setMatch] = useState<BulkMatch | null>(null);
  const batchRef = useRef<BulkBatch | null>(null);

  function handleSubmit() {
    const units = Math.max(1, parseInt(unitsStr) || 100);
    const cat = category.trim() || 'Mixed Products';
    const g = generateGrades(units, cat);
    const m = generateMatch(units, cat, preferred);
    const batch: BulkBatch = {
      id: generateBatchId(),
      category: cat,
      description: description.trim() || `${units} units`,
      units,
      preferredOutcome: preferred,
      submittedAt: new Date().toISOString(),
      grades: g,
      status: 'pending_approval',
      primaryMatch: m,
      remainingUnits: 0,
      remainingNote: null,
    };
    batchRef.current = batch;
    setGrades(g);
    setMatch(m);
    setStage('processing');
    setTimeout(() => setProcessStep(1), 1100);
    setTimeout(() => setProcessStep(2), 2400);
    setTimeout(() => setProcessStep(3), 3600);
    setTimeout(() => setStage('done'), 4500);
  }

  function handleView() {
    if (batchRef.current) {
      addBatch(batchRef.current);
      onCreated(batchRef.current);
    }
    onClose();
  }

  const units = Math.max(1, parseInt(unitsStr) || 100);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={stage === 'form' ? onClose : undefined} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-card ring-1 ring-border shadow-2xl shadow-black/40">
        {/* Progress bar on processing */}
        {stage === 'processing' && (
          <div className="h-0.5 bg-secondary">
            <div
              className="h-full bg-brand transition-all duration-700"
              style={{ width: `${(processStep / 3) * 100}%` }}
            />
          </div>
        )}
        {stage === 'done' && <div className="h-0.5 bg-emerald-500" />}
        {stage === 'form' && <div className="h-0.5 bg-brand/30" />}

        <div className="p-6">
          {/* Modal header */}
          <div className="mb-5 flex items-start justify-between">
            <div>
              <SectionLabel>Bulk Exchange</SectionLabel>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
                {stage === 'form' ? 'Submit a New Batch' : stage === 'processing' ? 'AI Processing…' : 'Match Found'}
              </h2>
            </div>
            {stage === 'form' && (
              <button
                onClick={onClose}
                className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <svg className="size-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* ── Form ── */}
          {stage === 'form' && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Product Category
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Consumer Electronics"
                  className="w-full rounded-xl bg-secondary px-4 py-2.5 text-sm text-foreground ring-1 ring-border placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-brand/50"
                />
              </div>
              <div>
                <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Number of Units
                </label>
                <input
                  type="number"
                  value={unitsStr}
                  onChange={(e) => setUnitsStr(e.target.value)}
                  placeholder="e.g. 150"
                  min={1}
                  className="w-full rounded-xl bg-secondary px-4 py-2.5 text-sm text-foreground ring-1 ring-border placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-brand/50"
                />
              </div>
              <div>
                <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of products and condition…"
                  className="w-full resize-none rounded-xl bg-secondary px-4 py-2.5 text-sm text-foreground ring-1 ring-border placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-brand/50"
                />
              </div>
              <div>
                <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Preferred Outcome
                </label>
                <select
                  value={preferred}
                  onChange={(e) => setPreferred(e.target.value)}
                  className="w-full rounded-xl bg-secondary px-4 py-2.5 text-sm text-foreground ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-brand/50"
                >
                  <option>Let AI decide</option>
                  <option>Resale preferred</option>
                  <option>Donation accepted</option>
                  <option>Refurbisher only</option>
                </select>
              </div>
              <div className="flex gap-2.5 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex-1 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground transition hover:bg-brand-strong active:scale-95"
                >
                  Submit Batch
                </button>
              </div>
            </div>
          )}

          {/* ── Processing ── */}
          {stage === 'processing' && grades && (
            <div className="space-y-0">
              <ProcessStep label="Uploading batch manifest" state={processStep >= 1 ? 'done' : 'active'} />
              <ProcessStep
                label={`AI grading ${units} units`}
                state={processStep >= 2 ? 'done' : processStep === 1 ? 'active' : 'pending'}
              >
                {processStep >= 1 && (
                  <div className="mt-2">
                    <GradeBar grades={grades} total={units} animate />
                  </div>
                )}
              </ProcessStep>
              <ProcessStep
                label="Scanning verified buyer network"
                state={processStep >= 3 ? 'done' : processStep === 2 ? 'active' : 'pending'}
              >
                {processStep === 2 && (
                  <div className="mt-2 flex gap-1.5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className="inline-block size-1.5 rounded-full bg-brand animate-bounce"
                        style={{ animationDelay: `${i * 100}ms` }}
                      />
                    ))}
                  </div>
                )}
              </ProcessStep>
              <ProcessStep
                label="Computing deal terms"
                state={processStep >= 3 ? 'done' : 'pending'}
              />
            </div>
          )}

          {/* ── Done ── */}
          {stage === 'done' && match && grades && (
            <div className="space-y-4">
              {/* Buyer card */}
              <div className="flex items-center gap-3 rounded-xl bg-secondary p-3.5 ring-1 ring-border">
                <BuyerAvatar name={match.buyerName} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{match.buyerName}</p>
                  <p className="text-xs text-muted-foreground">{match.buyerType} · {match.buyerLocation}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  <span className="text-xs font-medium text-emerald-500">Verified</span>
                </div>
              </div>

              {/* Grade breakdown */}
              <div>
                <SectionLabel>AI Grade Breakdown · {units} units</SectionLabel>
                <div className="mt-2">
                  <GradeBar grades={grades} total={units} animate />
                </div>
              </div>

              {/* Deal numbers */}
              <div className="grid grid-cols-3 overflow-hidden rounded-xl bg-secondary ring-1 ring-border">
                <div className="py-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Deal value</p>
                  <p className="mt-0.5 text-sm font-bold text-foreground">
                    {match.dealValue > 0 ? formatINR(match.dealValue) : 'Donation'}
                  </p>
                </div>
                <div className="border-x border-border py-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Amazon (10%)</p>
                  <p className="mt-0.5 text-sm font-bold text-muted-foreground">
                    {match.amazonCut > 0 ? `−${formatINR(match.amazonCut)}` : '—'}
                  </p>
                </div>
                <div className="py-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Your earnings</p>
                  <p className="mt-0.5 text-sm font-bold text-brand">
                    {match.sellerEarnings > 0 ? formatINR(match.sellerEarnings) : '—'}
                  </p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Pickup scheduled for{' '}
                <span className="font-medium text-foreground">{match.pickupDate}</span>
                {' '}· {match.co2SavedKg}kg CO₂ saved vs. warehouse
              </p>

              <button
                onClick={handleView}
                className="w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-brand-foreground transition hover:bg-brand-strong active:scale-95"
              >
                Review & Approve Deal →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Re-searching state ────────────────────────────────────────────────────────
function SearchingCard({ batchId }: { batchId: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-card ring-1 ring-border p-5">
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-brand/40 animate-pulse" />
      <div className="flex items-center gap-4">
        <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand/10">
          <Spinner cls="size-5 text-brand" />
        </div>
        <div className="flex-1">
          <p className="font-mono text-[10px] uppercase tracking-widest text-brand">
            Re-matching · {batchId}
          </p>
          <p className="mt-0.5 text-sm font-medium text-foreground">
            Finding an alternative buyer…
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Expanding network scan. Results in about 30 seconds.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {['Wholesalers', 'Refurbishers', 'NGOs', 'Exporters'].map((label, i) => (
          <span
            key={label}
            className="rounded-full bg-secondary px-2.5 py-0.5 font-mono text-[10px] text-muted-foreground ring-1 ring-border animate-pulse"
            style={{ animationDelay: `${i * 200}ms` }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Approval panel ────────────────────────────────────────────────────────────
interface ApprovalPanelProps {
  match: BulkMatch;
  onApprove: () => void;
  onDecline: () => void;
  approving: boolean;
}

function ApprovalPanel({ match, onApprove, onDecline, approving }: ApprovalPanelProps) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-card ring-1 ring-border">
      <div className="h-0.5 bg-brand" />
      <div className="p-5 space-y-4">
        {/* Header row */}
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-brand animate-pulse" />
          <SectionLabel>Action required</SectionLabel>
          <span className="ml-auto text-[11px] text-muted-foreground">Expires in 47h</span>
        </div>

        {/* Buyer partner */}
        <div className="flex items-center gap-3 rounded-xl bg-secondary p-3 ring-1 ring-border">
          <BuyerAvatar name={match.buyerName} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{match.buyerName}</p>
            <p className="text-xs text-muted-foreground">{match.buyerType} · {match.buyerLocation}</p>
          </div>
          <div className="flex flex-shrink-0 flex-col items-end gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] font-medium text-emerald-500">Verified</span>
            </div>
            <span className="text-[11px] text-muted-foreground">{match.matchedUnits} units</span>
          </div>
        </div>

        {/* Deal figures */}
        <div className="grid grid-cols-3 overflow-hidden rounded-xl bg-secondary ring-1 ring-border">
          <div className="py-3 text-center">
            <p className="text-[10px] text-muted-foreground">Deal value</p>
            <p className="mt-1 text-sm font-bold text-foreground">
              {match.dealValue > 0 ? formatINR(match.dealValue) : 'Donation'}
            </p>
          </div>
          <div className="border-x border-border py-3 text-center">
            <p className="text-[10px] text-muted-foreground">Amazon (10%)</p>
            <p className="mt-1 text-sm font-bold text-muted-foreground">
              {match.amazonCut > 0 ? `−${formatINR(match.amazonCut)}` : '—'}
            </p>
          </div>
          <div className="py-3 text-center">
            <p className="text-[10px] text-muted-foreground">Your earnings</p>
            <p className="mt-1 text-sm font-bold text-brand">
              {match.sellerEarnings > 0 ? formatINR(match.sellerEarnings) : '—'}
            </p>
          </div>
        </div>

        {/* Pickup + eco row */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            Pickup <span className="font-medium text-foreground">{match.pickupDate}</span> · Amazon logistics
          </span>
          <span className="text-emerald-600">
            🌿 {match.co2SavedKg}kg CO₂ saved
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-2.5">
          <button
            disabled={approving}
            onClick={onApprove}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60 active:scale-95"
          >
            {approving ? <><Spinner cls="size-4" /> Confirming…</> : 'Approve & Schedule Pickup'}
          </button>
          <button
            disabled={approving}
            onClick={onDecline}
            className="rounded-xl border border-border bg-transparent px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:border-foreground/20 hover:text-foreground disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Partial match panel ───────────────────────────────────────────────────────
function PartialMatchPanel({
  batch,
  match,
  onConfirmDonation,
  confirming,
}: {
  batch: BulkBatch;
  match: BulkMatch;
  onConfirmDonation: () => void;
  confirming: boolean;
}) {
  const isDonation = match.sellerEarnings === 0;
  return (
    <div className="space-y-2.5">
      {/* Matched portion */}
      <div className="relative overflow-hidden rounded-xl bg-card ring-1 ring-border">
        <div className="h-0.5 bg-emerald-500" />
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Matched · {match.matchedUnits} units</SectionLabel>
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-500">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Ready
            </span>
          </div>
          <div className="flex items-center gap-3">
            <BuyerAvatar name={match.buyerName} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{match.buyerName}</p>
              <p className="text-xs text-muted-foreground">{match.buyerType} · {match.buyerLocation} · Pickup {match.pickupDate}</p>
            </div>
          </div>
          {isDonation ? (
            <p className="text-xs text-muted-foreground">
              Donation route — no monetary return, but generates CSR credit and avoids warehouse freight.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-secondary px-3 py-2 ring-1 ring-border">
                <p className="text-[10px] text-muted-foreground">Deal value</p>
                <p className="mt-0.5 text-sm font-bold text-foreground">{formatINR(match.dealValue)}</p>
              </div>
              <div className="rounded-lg bg-brand/10 px-3 py-2 ring-1 ring-brand/20">
                <p className="text-[10px] text-muted-foreground">Your earnings</p>
                <p className="mt-0.5 text-sm font-bold text-brand">{formatINR(match.sellerEarnings)}</p>
              </div>
            </div>
          )}
          <button
            disabled={confirming}
            onClick={onConfirmDonation}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60 active:scale-95"
          >
            {confirming ? <><Spinner cls="size-4" /> Confirming…</> : `Confirm ${isDonation ? 'Donation' : 'Deal'} →`}
          </button>
        </div>
      </div>

      {/* Searching portion */}
      {batch.remainingUnits > 0 && (
        <div className="rounded-xl bg-secondary p-4 ring-1 ring-border">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-card ring-1 ring-border">
              <Spinner cls="size-4 text-brand" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                {batch.remainingUnits} units searching
              </p>
              <p className="text-xs text-muted-foreground">{batch.remainingNote}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {['Local buyers', 'Refurbishers', 'Export networks'].map((l, i) => (
              <span
                key={l}
                className="rounded-full bg-card px-2.5 py-0.5 text-[10px] text-muted-foreground ring-1 ring-border animate-pulse"
                style={{ animationDelay: `${i * 200}ms` }}
              >
                {l}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Approved panel ────────────────────────────────────────────────────────────
function ApprovedPanel({
  batch,
  match,
  onComplete,
  completing,
}: {
  batch: BulkBatch;
  match: BulkMatch;
  onComplete: () => void;
  completing: boolean;
}) {
  const steps = [
    { label: 'Deal approved', sub: batch.approvedAt ? timeAgo(batch.approvedAt) : '', done: true },
    { label: 'Amazon pickup scheduled', sub: match.pickupDate, done: true },
    { label: 'Items in transit to buyer', sub: 'Expected within 2–3 days', done: false, active: true },
    { label: 'Payment released', sub: 'On delivery confirmation', done: false },
  ];

  return (
    <div className="relative overflow-hidden rounded-xl bg-card ring-1 ring-border">
      <div className="h-0.5 bg-emerald-500" />
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500 text-sm font-bold">
            ✓
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Approved — deal with {match.buyerName}
            </p>
            {batch.approvedAt && (
              <p className="text-xs text-muted-foreground">Confirmed {timeAgo(batch.approvedAt)}</p>
            )}
          </div>
        </div>

        {/* Compact logistics steps */}
        <div className="space-y-2.5 border-t border-border pt-4">
          {steps.map((step) => (
            <div key={step.label} className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex size-4 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                  step.done
                    ? 'bg-emerald-500/15 text-emerald-500'
                    : step.active
                    ? 'bg-brand/15 text-brand'
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                {step.done ? '✓' : step.active ? '→' : '·'}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${step.done ? 'text-foreground' : step.active ? 'font-medium text-brand' : 'text-muted-foreground'}`}>
                  {step.label}
                </p>
                {step.sub && (
                  <p className="text-[11px] text-muted-foreground">{step.sub}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Earnings + CTA */}
        <div className="flex items-center justify-between border-t border-border pt-4">
          <div>
            <p className="text-[11px] text-muted-foreground">Expected earnings</p>
            <p className="text-xl font-black tabular-nums text-brand">
              {match.sellerEarnings > 0 ? formatINR(match.sellerEarnings) : 'Donation credit'}
            </p>
          </div>
          <button
            disabled={completing}
            onClick={onComplete}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground transition hover:bg-brand-strong disabled:opacity-60 active:scale-95"
          >
            {completing ? <><Spinner cls="size-4" /> Closing…</> : 'Mark as Complete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Completed panel ───────────────────────────────────────────────────────────
function CompletedPanel({ batch, match }: { batch: BulkBatch; match: BulkMatch }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-card ring-1 ring-border">
      <div className="h-0.5 bg-emerald-500" />
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <BuyerAvatar name={match.buyerName} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {match.matchedUnits} units · {match.buyerName}
            </p>
            <p className="text-xs text-muted-foreground">
              {batch.completedAt ? `Completed ${timeAgo(batch.completedAt)}` : 'Completed'}
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-500 flex-shrink-0">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Closed
          </span>
        </div>

        <div className="grid grid-cols-3 overflow-hidden rounded-xl bg-secondary ring-1 ring-border">
          <div className="py-3 text-center">
            <p className="text-[10px] text-muted-foreground">Earnings received</p>
            <p className="mt-1 text-sm font-bold text-brand">
              {match.sellerEarnings > 0 ? formatINR(match.sellerEarnings) : '—'}
            </p>
          </div>
          <div className="border-x border-border py-3 text-center">
            <p className="text-[10px] text-muted-foreground">CO₂ avoided</p>
            <p className="mt-1 text-sm font-bold text-emerald-500">{match.co2SavedKg}kg</p>
          </div>
          <div className="py-3 text-center">
            <p className="text-[10px] text-muted-foreground">EcoCredits</p>
            <p className="mt-1 text-sm font-bold text-foreground">+{batch.ecoCreditsAwarded ?? 0}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Batch card ────────────────────────────────────────────────────────────────
const STATUS_META: Record<
  BulkBatch['status'] | 'searching',
  { label: string; dot: string; text: string }
> = {
  pending_approval: { label: 'Awaiting approval', dot: 'bg-brand', text: 'text-brand' },
  partially_matched: { label: 'Partially matched', dot: 'bg-warning', text: 'text-warning' },
  approved: { label: 'Approved · In transit', dot: 'bg-emerald-500', text: 'text-emerald-500' },
  completed: { label: 'Completed', dot: 'bg-emerald-500', text: 'text-emerald-500' },
  searching: { label: 'Re-searching…', dot: 'bg-muted-foreground', text: 'text-muted-foreground' },
};

interface BatchCardProps {
  batch: BulkBatch;
  onUpdate: (updated: BulkBatch) => void;
  isNew?: boolean;
}

function BatchCard({ batch, onUpdate, isNew }: BatchCardProps) {
  const [approving, setApproving] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const statusKey = declining ? 'searching' : batch.status;
  const meta = STATUS_META[statusKey];

  function handleApprove() {
    setApproving(true);
    setTimeout(() => {
      const updated = updateBatch(batch.id, { status: 'approved', approvedAt: new Date().toISOString() });
      if (updated) onUpdate(updated);
      setApproving(false);
    }, 700);
  }

  function handleDecline() {
    setDeclining(true);
    setTimeout(() => {
      const newMatch = generateRematching(batch);
      const updated = updateBatch(batch.id, { primaryMatch: newMatch });
      if (updated) onUpdate(updated);
      setDeclining(false);
    }, 4500);
  }

  function handleComplete() {
    setCompleting(true);
    const eco = Math.round((batch.primaryMatch?.co2SavedKg ?? 5) * 10 + batch.units * 0.3);
    setTimeout(() => {
      const updated = updateBatch(batch.id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        ecoCreditsAwarded: eco,
      });
      if (updated) onUpdate(updated);
      setCompleting(false);
    }, 700);
  }

  function handleConfirmDonation() {
    setConfirming(true);
    setTimeout(() => {
      const updated = updateBatch(batch.id, {
        status: 'approved',
        approvedAt: new Date().toISOString(),
        remainingUnits: 0,
        remainingNote: null,
      });
      if (updated) onUpdate(updated);
      setConfirming(false);
    }, 700);
  }

  const isPending = batch.status === 'pending_approval' && !declining;

  return (
    <div
      className={`overflow-hidden rounded-2xl bg-card ring-1 transition-shadow ${
        isPending ? 'ring-border shadow-[0_0_0_1px_theme(colors.brand/0.3)]' : 'ring-border'
      } ${isNew ? 'shadow-[0_0_0_2px_theme(colors.emerald.500/0.4)]' : ''}`}
      style={{ animation: 'fade-up 0.4s ease both' }}
    >
      {/* Top accent bar */}
      <div
        className={`h-0.5 ${
          batch.status === 'completed'
            ? 'bg-emerald-500'
            : batch.status === 'approved'
            ? 'bg-emerald-500/60'
            : batch.status === 'pending_approval' && !declining
            ? 'bg-brand'
            : 'bg-border'
        }`}
      />

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border/60">
        <p className="font-mono text-sm font-semibold text-brand">{batch.id}</p>
        {isNew && (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-500">
            New
          </span>
        )}
        <span className="rounded-full bg-secondary px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {batch.category}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">{timeAgo(batch.submittedAt)}</span>
          <span className={`flex items-center gap-1.5 text-[11px] font-medium ${meta.text}`}>
            <span className={`size-1.5 rounded-full ${meta.dot} ${isPending ? 'animate-pulse' : ''}`} />
            {meta.label}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 space-y-4">
        {/* Description + grade */}
        <div>
          <div className="mb-2.5 flex items-center justify-between">
            <SectionLabel>AI Grade Breakdown</SectionLabel>
            <span className="text-[11px] text-muted-foreground">
              {batch.units.toLocaleString('en-IN')} units · {batch.description}
            </span>
          </div>
          <GradeBar grades={batch.grades} total={batch.units} animate={isNew} />
        </div>

        {/* Action panels */}
        {declining && <SearchingCard batchId={batch.id} />}

        {!declining && batch.status === 'pending_approval' && batch.primaryMatch && (
          <ApprovalPanel
            match={batch.primaryMatch}
            onApprove={handleApprove}
            onDecline={handleDecline}
            approving={approving}
          />
        )}

        {!declining && batch.status === 'partially_matched' && batch.primaryMatch && (
          <PartialMatchPanel
            batch={batch}
            match={batch.primaryMatch}
            onConfirmDonation={handleConfirmDonation}
            confirming={confirming}
          />
        )}

        {!declining && batch.status === 'approved' && batch.primaryMatch && (
          <ApprovedPanel
            batch={batch}
            match={batch.primaryMatch}
            onComplete={handleComplete}
            completing={completing}
          />
        )}

        {!declining && batch.status === 'completed' && batch.primaryMatch && (
          <CompletedPanel batch={batch} match={batch.primaryMatch} />
        )}
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
const SELLER = {
  name: 'ElectroMart Wholesale Pvt Ltd',
  gst: '27AABCE1234F1Z5',
  id: 'AMZ-SEL-00492',
  location: 'Pune, Maharashtra',
};

export default function BulkExchangePage() {
  const [batches, setBatches] = useState<BulkBatch[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [newBatchId, setNewBatchId] = useState<string | null>(null);

  useEffect(() => {
    setBatches(getBatches());
  }, []);

  function handleBatchUpdate(updated: BulkBatch) {
    setBatches((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  }

  function handleNewBatch(batch: BulkBatch) {
    setBatches((prev) => [batch, ...prev]);
    setNewBatchId(batch.id);
    setTimeout(() => setNewBatchId(null), 8000);
  }

  const totalUnits = batches.reduce((s, b) => s + b.units, 0);
  const totalEarnings = batches
    .filter((b) => b.status === 'completed')
    .reduce((s, b) => s + (b.primaryMatch?.sellerEarnings ?? 0), 0);
  const pending = batches.filter(
    (b) => b.status === 'pending_approval' || b.status === 'partially_matched',
  ).length;
  const completed = batches.filter((b) => b.status === 'completed').length;

  return (
    <div>
      {modalOpen && (
        <NewBatchModal onClose={() => setModalOpen(false)} onCreated={handleNewBatch} />
      )}

      {/* Page header */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <SectionLabel>Seller / Bulk Exchange</SectionLabel>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
            B2B Bulk Exchange
          </h1>
          <p className="mt-1.5 text-muted-foreground">
            Offload excess or returned inventory — AI-matched to refurbishers, NGOs, and wholesalers.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="mt-1 inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground transition hover:bg-brand-strong hover:shadow-[0_0_24px_rgba(255,153,0,0.2)] active:scale-95"
        >
          <svg className="size-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Batch
        </button>
      </div>

      {/* Seller identity */}
      <div className="mt-6 overflow-hidden rounded-2xl bg-card ring-1 ring-border">
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand/15 font-bold text-brand text-base">
              {initial(SELLER.name)}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{SELLER.name}</p>
              <p className="text-xs text-muted-foreground">{SELLER.id} · {SELLER.location}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-muted-foreground">GST {SELLER.gst}</span>
            <span className="flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-brand">
              <span className="size-1.5 rounded-full bg-brand" />
              Verified Seller
            </span>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="mt-4 grid grid-cols-4 overflow-hidden rounded-2xl bg-secondary ring-1 ring-border">
        {[
          { label: 'Total Batches', value: batches.length.toString() },
          { label: 'Total Units', value: totalUnits.toLocaleString('en-IN') },
          { label: 'Earnings Released', value: formatINR(totalEarnings) },
          {
            label: 'Pending Action',
            value: pending.toString(),
            sub: `${completed} completed`,
            highlight: pending > 0,
          },
        ].map((s, i) => (
          <div key={s.label} className={`py-4 text-center ${i > 0 ? 'border-l border-border' : ''}`}>
            <p
              className={`text-2xl font-black tracking-tight tabular-nums ${
                s.highlight ? 'text-brand' : 'text-brand'
              }`}
            >
              {s.value}
            </p>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {s.label}
            </p>
            {'sub' in s && s.sub && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">{s.sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* Batch list */}
      <div className="mt-5 flex flex-col gap-4">
        {batches.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
            <p className="text-sm text-muted-foreground">
              No batches yet — submit your first batch to get started.
            </p>
          </div>
        )}
        {batches.map((batch) => (
          <BatchCard
            key={batch.id}
            batch={batch}
            onUpdate={handleBatchUpdate}
            isNew={batch.id === newBatchId}
          />
        ))}
      </div>
    </div>
  );
}
