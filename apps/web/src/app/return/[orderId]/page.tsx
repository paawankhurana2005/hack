import { ReturnFlowClient } from '@/components/return/ReturnFlowClient';

interface Props {
  params: { orderId: string };
  searchParams: Record<string, string | string[] | undefined>;
}

export default function ReturnFlowPage({ params, searchParams }: Props) {
  const { orderId } = params;
  const grading = typeof searchParams.grading === 'string' ? searchParams.grading : undefined;
  const routing = typeof searchParams.routing === 'string' ? searchParams.routing : undefined;
  const handoff = typeof searchParams.handoff === 'string' ? searchParams.handoff : undefined;

  return (
    <ReturnFlowClient
      orderId={orderId}
      gradingScenario={grading}
      routingScenario={routing}
      handoffScenario={handoff}
    />
  );
}
