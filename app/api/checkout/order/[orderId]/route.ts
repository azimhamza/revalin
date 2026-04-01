import { NextResponse } from 'next/server';
import { isTerminalPaymentStatus } from '@/lib/checkout/constants';
import { cancelSwellOrder } from '@/lib/checkout/swell-order-management';
import { getCheckoutOrder, updateCheckoutOrder } from '@/lib/checkout/order-store';
import { toPublicCheckoutOrder } from '@/lib/checkout/types';

export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const params = await context.params;
  const key = new URL(request.url).searchParams.get('key');
  const order = await getCheckoutOrder(params.orderId);

  if (!order || !key || order.accessKey !== key) {
    return NextResponse.json({ error: 'Checkout session not found.' }, { status: 404 });
  }

  return NextResponse.json({ order: toPublicCheckoutOrder(order) });
}

export async function DELETE(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const params = await context.params;
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  const reason = url.searchParams.get('reason') || 'released';
  const order = await getCheckoutOrder(params.orderId);

  if (!order || !key || order.accessKey !== key) {
    return NextResponse.json({ error: 'Checkout session not found.' }, { status: 404 });
  }

  if (isTerminalPaymentStatus(order.payment.status)) {
    return NextResponse.json({ order: toPublicCheckoutOrder(order) });
  }

  const cancelReason =
    reason === 'switch_payment'
      ? 'Customer chose a different payment method before completing payment.'
      : 'Customer released the checkout session before completing payment.';

  await cancelSwellOrder(order.swell.orderId, cancelReason);

  const updatedOrder = await updateCheckoutOrder(order.orderId, current => ({
    ...current,
    payment: {
      ...current.payment,
      status: reason === 'switch_payment' ? 'replaced' : 'cancelled',
      updatedAt: new Date().toISOString(),
    },
    latestError: cancelReason,
  }));

  return NextResponse.json({
    order: toPublicCheckoutOrder(updatedOrder || order),
  });
}
