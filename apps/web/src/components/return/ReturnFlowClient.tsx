'use client';

import { useState } from 'react';
import type { ReturnReason } from '@reloop/shared';
import { StepIndicator } from '@/components/ui/step-indicator';
import { mockOrders } from '@/lib/mocks/return-flow';
import { BuyerStep1 } from './BuyerStep1';
import { BuyerStep2Pickup } from './BuyerStep2Pickup';
import { BuyerStep3Done } from './BuyerStep3Done';

const STEP_LABELS = ['Reason & Photos', 'Pickup', 'Done'];

interface Props {
  orderId: string;
}

interface BuyerState {
  step: 1 | 2 | 3;
  reason: ReturnReason | null;
  photos: string[];
  agentWindow: string;
}

export function ReturnFlowClient({ orderId }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const order = mockOrders.find((o) => o.orderId === orderId) ?? mockOrders[0]!;

  const [state, setState] = useState<BuyerState>({
    step: 1,
    reason: null,
    photos: [],
    agentWindow: '',
  });

  function handleStep1Submit(reason: ReturnReason, photos: string[]) {
    setState((prev) => ({ ...prev, step: 2, reason, photos }));
  }

  function handleStep2Done(agentWindow: string) {
    setState((prev) => ({ ...prev, step: 3, agentWindow }));
  }

  return (
    <section className="mx-auto max-w-2xl px-6 py-8">
      <StepIndicator steps={STEP_LABELS} current={state.step - 1} />

      <div className="mt-8">
        {state.step === 1 && (
          <BuyerStep1 order={order} onSubmit={handleStep1Submit} />
        )}
        {state.step === 2 && state.reason && (
          <BuyerStep2Pickup
            orderId={order.orderId}
            productName={order.productName}
            priceCents={order.priceCents}
            category={order.category}
            sku={order.sku}
            reason={state.reason}
            photos={state.photos}
            onDone={handleStep2Done}
          />
        )}
        {state.step === 3 && (
          <BuyerStep3Done
            productName={order.productName}
            priceCents={order.priceCents}
            agentWindow={state.agentWindow}
          />
        )}
      </div>
    </section>
  );
}
