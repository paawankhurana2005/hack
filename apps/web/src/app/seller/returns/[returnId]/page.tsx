import { SellerReturnDetail } from './SellerReturnDetail';

interface Props {
  params: { returnId: string };
}

export default function SellerReturnDetailPage({ params }: Props) {
  return <SellerReturnDetail returnId={params.returnId} />;
}
