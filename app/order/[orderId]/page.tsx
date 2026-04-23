import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCheckoutOrder } from '@/lib/checkout/order-store';
import { buildPublicCheckoutOrder } from '@/lib/checkout/public-order';
import { OrderStatusView } from './components/order-status-view';

export const metadata: Metadata = {
  title: 'Order Status — REVALIN',
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ key?: string }>;
};

export default async function OrderStatusPage({ params, searchParams }: Props) {
  const { orderId } = await params;
  const { key } = await searchParams;

  if (!key) notFound();

  const order = await getCheckoutOrder(orderId);

  if (!order || order.accessKey !== key) notFound();

  const publicOrder = await buildPublicCheckoutOrder(order);

  return (
    <div className="min-h-screen bg-[#F4F1EA]">
      <div className="px-sides pt-top-spacing pb-16">
        <div className="mx-auto max-w-3xl">
          <OrderStatusView initialOrder={publicOrder} accessKey={key} />
        </div>
      </div>
    </div>
  );
}
