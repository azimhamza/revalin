import { apiError } from '@/lib/api/errors';
import { isTerminalPaymentStatus } from '@/lib/checkout/constants';
import { buildPublicCheckoutOrder } from '@/lib/checkout/public-order';
import { getCheckoutOrder, updateCheckoutOrder } from '@/lib/checkout/order-store';
import { cancelSwellOrder } from '@/lib/checkout/swell-order-management';
import { deleteSquarePaymentLink } from '@/lib/checkout/square';
import { isSquarePayment } from '@/lib/checkout/types';

export async function getPublicCheckoutOrder(args: {
  orderId: string;
  accessKey: string;
}) {
  const order = await getCheckoutOrder(args.orderId);

  if (!order || order.accessKey !== args.accessKey) {
    throw apiError.notFound('Checkout session not found.');
  }

  return buildPublicCheckoutOrder(order);
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
    return buildPublicCheckoutOrder(order);
  }

  if (
    args.reason === 'switch_payment' &&
    order.payment.status.trim().toLowerCase() === 'partially_paid'
  ) {
    // Preserve partial-payment attempts until the replacement checkout is created
    // so finalize can recover the paid amount and calculate the true remainder.
    return buildPublicCheckoutOrder(order);
  }

  const cancelReason =
    args.reason === 'switch_payment'
      ? 'Customer chose a different payment method before completing payment.'
      : args.reason === 'edit_order'
        ? 'Customer returned to checkout to edit the order before completing payment.'
      : 'Customer released the checkout session before completing payment.';

  await cancelSwellOrder(order.swell.orderId, cancelReason);

  let squareDeletionError: string | null = null;

  if (isSquarePayment(order.payment)) {
    await deleteSquarePaymentLink(order.payment.paymentLinkId).catch(async (error) => {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to deactivate Square payment link.';
      squareDeletionError = message;

      await updateCheckoutOrder(order.orderId, (current) => {
        if (!isSquarePayment(current.payment)) return current;
        return {
          ...current,
          payment: {
            ...current.payment,
            deletionError: message,
            updatedAt: new Date().toISOString(),
          },
        };
      }).catch(() => {});

      console.error('Unable to deactivate Square payment link:', error);
    });
  }

  const updatedOrder = await updateCheckoutOrder(order.orderId, (current) => ({
    ...current,
      payment: {
        ...current.payment,
        status: args.reason === 'switch_payment' ? 'replaced' : 'cancelled',
        ...(isSquarePayment(current.payment)
        ? {
            deletedAt: squareDeletionError ? current.payment.deletedAt ?? null : new Date().toISOString(),
            deletionError: squareDeletionError,
          }
        : {}),
        updatedAt: new Date().toISOString(),
      },
    latestError: cancelReason,
  }));

  return buildPublicCheckoutOrder(updatedOrder || order);
}
