import type { CheckoutOrderRecord } from '@/lib/checkout/types';
import { hasLoopsConfig, sendTransactionalEmail, sendLoopsEvent } from '@/lib/email/loops';

function getSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, '')}`;
  return 'http://localhost:3000';
}

function formatCurrency(amount: string | number, currencyCode: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(Number(amount));
}

export function buildRetryUrl(order: CheckoutOrderRecord) {
  return `${getSiteUrl()}/checkout?retry=${order.orderId}&key=${order.accessKey}`;
}

export async function sendPaymentFailedEvent(order: CheckoutOrderRecord) {
  if (!hasLoopsConfig()) {
    console.warn('Skipping payment failed email: Loops not configured.');
    return null;
  }

  const transactionalId = process.env.LOOPS_TRANSACTIONAL_PAYMENT_FAILED?.trim();
  if (!transactionalId) {
    console.warn('Skipping payment failed email: LOOPS_TRANSACTIONAL_PAYMENT_FAILED not set.');
    return null;
  }

  const customerEmail = order.shippingAddress.email?.trim();
  if (!customerEmail) {
    console.warn('Skipping payment failed email: No customer email.');
    return null;
  }

  const retryUrl = buildRetryUrl(order);
  const firstItem = order.lines[0];

  return sendTransactionalEmail({
    email: customerEmail,
    transactionalId,
    dataVariables: {
      orderNumber: order.swell.orderNumber || order.orderId,
      orderId: order.orderId,
      retryUrl,
      total: formatCurrency(order.totals.totalAmount.amount, order.currencyCode),
      currencyCode: order.currencyCode,
      customerFirstName: order.shippingAddress.firstName,
      firstItemTitle: firstItem?.productTitle || '',
      firstItemImage: firstItem?.imageUrl || '',
      itemCount: order.lines.length,
    },
  });
}

export async function sendPaymentCompletedEvent(order: CheckoutOrderRecord) {
  if (!hasLoopsConfig()) return null;

  const customerEmail = order.shippingAddress.email?.trim();
  if (!customerEmail) return null;

  return sendLoopsEvent({
    email: customerEmail,
    eventName: 'payment_completed',
    eventProperties: {
      orderId: order.orderId,
      orderNumber: order.swell.orderNumber || order.orderId,
      total: order.totals.totalAmount.amount,
      currencyCode: order.currencyCode,
    },
  });
}
