'use client';

import { useState } from 'react';
import type { ReturnFlowState } from '@reloop/shared';
import { StepIndicator } from '@/components/ui/step-indicator';
import { mockOrders } from '@/lib/mocks/return-flow';
import { Step1Reason } from './Step1Reason';
import { Step2Grading } from './Step2Grading';
import { Step3Bridge } from './Step3Bridge';
import { Step4Handoff } from './Step4Handoff';
import { Step5Done } from './Step5Done';

const STEP_LABELS = ['Reason', 'Doorstep grading', 'Intelligent Bridge', 'Handoff', 'Done'];

interface Props {
  orderId: string;
  gradingScenario: string | undefined;
  routingScenario: string | undefined;
  handoffScenario: string | undefined;
}

export function ReturnFlowClient({ orderId, gradingScenario, routingScenario, handoffScenario }: Props) {
  // mockOrders is a non-empty constant; the fallback is always defined
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const order = mockOrders.find((o) => o.orderId === orderId) ?? mockOrders[0]!;

  const [flowState, setFlowState] = useState<ReturnFlowState>({
    orderId,
    reason: 'changed_mind',
    photos: [],
    currentStep: 1,
  });

  function handleNext(partial: Partial<ReturnFlowState>) {
    setFlowState((prev) => {
      const rawNext = partial.currentStep ?? prev.currentStep + 1;
      const nextStep = (Math.min(rawNext, 5) as 1 | 2 | 3 | 4 | 5);
      return { ...prev, ...partial, currentStep: nextStep };
    });
  }

  const stepProps = { flowState, onNext: handleNext };

  return (
    <section className="mx-auto max-w-2xl px-6 py-8">
      <StepIndicator steps={STEP_LABELS} current={flowState.currentStep - 1} />

      <div className="mt-8">
        {flowState.currentStep === 1 && (
          <Step1Reason {...stepProps} order={order} />
        )}
        {flowState.currentStep === 2 && (
          <Step2Grading {...stepProps} gradingScenario={gradingScenario} />
        )}
        {flowState.currentStep === 3 && (
          <Step3Bridge
            {...stepProps}
            routingScenario={routingScenario}
            handoffScenario={handoffScenario}
          />
        )}
        {flowState.currentStep === 4 && (
          <Step4Handoff {...stepProps} />
        )}
        {flowState.currentStep === 5 && (
          <Step5Done {...stepProps} order={order} />
        )}
      </div>
    </section>
  );
}
