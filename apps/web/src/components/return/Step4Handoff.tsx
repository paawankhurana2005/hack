'use client';

import type { ReturnFlowState } from '@reloop/shared';
import { Card } from '@/components/ui/card';

interface Props {
  flowState: ReturnFlowState;
  onNext: (partial: Partial<ReturnFlowState>) => void;
}

function formatScheduledAt(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Step4Handoff({ flowState, onNext }: Props) {
  const { routingDecision, handoff } = flowState;
  const isWarehouse = routingDecision?.decision === 'warehouse' || !handoff;

  function handleContinue() {
    onNext({ currentStep: 5 });
  }

  if (isWarehouse) {
    return (
      <Card>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📦</span>
            <p className="font-semibold text-white">Standard return pickup</p>
          </div>
          <p className="text-sm text-muted">
            Hand your item to the Amazon delivery agent when they arrive for your standard return
            pickup. No extra steps needed.
          </p>
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleContinue}
              className="rounded-md bg-orange-500 px-5 py-2.5 text-sm font-semibold text-navy-900 hover:bg-orange-600"
            >
              Done
            </button>
          </div>
        </div>
      </Card>
    );
  }

  const methodIcon = handoff.method === 'locker' ? '🔒' : handoff.method === 'agent_pickup' ? '🚚' : '🏪';
  const methodTitle =
    handoff.method === 'locker'
      ? 'Drop off at Amazon Locker'
      : handoff.method === 'agent_pickup'
        ? 'Agent will collect from you'
        : 'Drop off at Returns Hub';

  const primaryCopy =
    handoff.method === 'locker'
      ? `Drop off at ${handoff.locationName}, ${handoff.locationAddress}. Your item will be collected within 24 hours.`
      : handoff.method === 'agent_pickup'
        ? `An Amazon agent will collect your item${handoff.scheduledAt ? ` on ${formatScheduledAt(handoff.scheduledAt)}` : ''}. No extra steps needed.`
        : `Drop off at ${handoff.locationName}, ${handoff.locationAddress}. Open 9am–8pm.`;

  return (
    <div className="space-y-4">
      {/* Fallback note banner */}
      {handoff.note && (
        <div className="rounded-md border border-navy-600 bg-navy-700 p-3">
          <p className="text-sm text-muted">{handoff.note}</p>
        </div>
      )}

      <Card>
        <div className="space-y-5">
          {/* Method header */}
          <div className="flex items-center gap-3">
            <span className="text-2xl">{methodIcon}</span>
            <p className="font-semibold text-white">{methodTitle}</p>
          </div>

          <p className="text-sm text-muted">{primaryCopy}</p>

          {/* QR code placeholder */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Your QR code
            </p>
            <div className="flex h-32 w-32 items-center justify-center rounded-md border border-navy-600 bg-navy-700">
              <div className="text-center">
                <p className="text-xs font-mono text-muted leading-tight">{handoff.qrCode}</p>
              </div>
            </div>
          </div>

          {/* Confirmation ID */}
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Confirmation ID
            </p>
            <p className="font-mono text-lg font-bold text-orange-500">{handoff.confirmationId}</p>
          </div>

          {/* Map placeholder */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Location
            </p>
            <div className="flex h-28 items-center justify-center rounded-md bg-navy-700">
              <p className="text-sm text-muted">Map</p>
            </div>
            <p className="mt-2 text-xs text-muted">{handoff.locationAddress}</p>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleContinue}
              className="rounded-md bg-orange-500 px-5 py-2.5 text-sm font-semibold text-navy-900 hover:bg-orange-600"
            >
              I've arranged my drop-off
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
