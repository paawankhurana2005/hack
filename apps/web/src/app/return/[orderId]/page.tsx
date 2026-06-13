import { ReturnFlowClient } from '@/components/return/ReturnFlowClient';

interface Props {
  params: { orderId: string };
}

export default function ReturnFlowPage({ params }: Props) {
  return <ReturnFlowClient orderId={params.orderId} />;
}
