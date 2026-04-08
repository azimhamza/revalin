import type { CheckoutOrderRecord } from '@/lib/checkout/types';
import { hasLoopsConfig, sendLoopsEvent } from '@/lib/email/loops';

export async function sendPaymentFailedEvent(order: CheckoutOrderRecord) {
  if (!hasLoopsConfig()) {
    console.warn('Skipping payment failed event: Loops not configured.');
    return null;
  }

  const customerEmail = order.shippingAddress.email?.trim();
  if (!customerEmail) {
    console.warn('Skipping payment failed event: No customer email on order.');
    return null;
  }

  return sendLoopsEvent({
    email: customerEmail,
    eventName: 'payment_failed',
    eventProperties: {
      orderId: order.orderId,
      orderNumber: order.swell.orderNumber || order.orderId,
      paymentProvider: order.payment.provider,
      paymentStatus: order.payment.status,
      totalAmount: order.totals.totalAmount.amount,
      currencyCode: order.currencyCode,
    },
  });
}
