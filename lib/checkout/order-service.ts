import { apiError } from '@/lib/api/errors';
import { isTerminalPaymentStatus } from '@/lib/checkout/constants';
import { getCheckoutOrder, updateCheckoutOrder } from '@/lib/checkout/order-store';
import { cancelSwellOrder } from '@/lib/checkout/swell-order-management';
import { toPublicCheckoutOrder } from '@/lib/checkout/types';

export async function getPublicCheckoutOrder(args: {
  orderId: string;
  accessKey: string;
}) {
  const order = await getCheckoutOrder(args.orderId);

  if (!order || order.accessKey !== args.accessKey) {
    throw apiError.notFound('Checkout session not found.');
  }

  return toPublicCheckoutOrder(order);
}

export async function releaseCheckoutOrder(args: {
  orderId: string;
  accessKey: string;
  reason?: string | null;
}) {
  const order = await getCheckoutOrder(args.orderId);

  if (!order || order.accessKey !== args.accessKey) {
    throw apiError.notFound('Checkout session not found.');
  }

  if (isTerminalPaymentStatus(order.payment.status)) {
    return toPublicCheckoutOrder(order);
  }

  const cancelReason =
    args.reason === 'switch_payment'
      ? 'Customer chose a different payment method before completing payment.'
      : 'Customer released the checkout session before completing payment.';

  await cancelSwellOrder(order.swell.orderId, cancelReason);

  const updatedOrder = await updateCheckoutOrder(order.orderId, (current) => ({
    ...current,
    payment: {
      ...current.payment,
      status: args.reason === 'switch_payment' ? 'replaced' : 'cancelled',
      updatedAt: new Date().toISOString(),
    },
    latestError: cancelReason,
  }));

  return toPublicCheckoutOrder(updatedOrder || order);
}
