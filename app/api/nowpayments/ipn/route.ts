import { NextResponse } from 'next/server';
import { findCheckoutOrderByPaymentId, getCheckoutOrder } from '@/lib/checkout/order-store';
import { applyVerifiedPaymentStatus } from '@/lib/checkout/payment-lifecycle';
import { verifyNowPaymentsSignature } from '@/lib/checkout/nowpayments';
import { isNowPaymentsPayment } from '@/lib/checkout/types';
import { sendPaymentFailedEvent } from '@/lib/email/marketing-events';

export async function POST(request: Request) {
  const signature = request.headers.get('x-nowpayments-sig');
  const rawBody = await request.text();

  try {
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const isValid = verifyNowPaymentsSignature(payload, signature);

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
    }

    const orderId = typeof payload.order_id === 'string' ? payload.order_id : undefined;
    const paymentId = payload.payment_id ? String(payload.payment_id) : undefined;
    const matchedOrder =
      (orderId ? await getCheckoutOrder(orderId) : null) ||
      (paymentId ? await findCheckoutOrderByPaymentId(paymentId) : null);

    if (matchedOrder && isNowPaymentsPayment(matchedOrder.payment)) {
      const nextStatus =
        typeof payload.payment_status === 'string'
          ? payload.payment_status
          : matchedOrder.payment.status;

      const result = await applyVerifiedPaymentStatus({
        orderId: matchedOrder.orderId,
        provider: 'nowpayments',
        targetStatus: nextStatus,
        source: 'nowpayments_ipn',
        ipnEvent: {
          receivedAt: new Date().toISOString(),
          signature: signature || undefined,
          valid: isValid,
          payload,
        },
        paymentUpdater: current => {
          if (!isNowPaymentsPayment(current.payment)) {
            return current.payment;
          }

          return {
            ...current.payment,
            paymentId,
            status: nextStatus,
            payAddress:
              typeof payload.pay_address === 'string'
                ? payload.pay_address
                : current.payment.payAddress,
            payAmount:
              payload.pay_amount === undefined || payload.pay_amount === null
                ? current.payment.payAmount
                : String(payload.pay_amount),
            amountReceived:
              payload.actually_paid === undefined || payload.actually_paid === null
                ? payload.amount_received === undefined ||
                  payload.amount_received === null
                  ? current.payment.amountReceived
                  : String(payload.amount_received)
                : String(payload.actually_paid),
            payinExtraId:
              typeof payload.payin_extra_id === 'string'
                ? payload.payin_extra_id
                : current.payment.payinExtraId ?? null,
            network:
              typeof payload.network === 'string'
                ? payload.network
                : current.payment.network ?? null,
            validUntil:
              typeof payload.valid_until === 'string'
                ? payload.valid_until
                : current.payment.validUntil ?? null,
            expirationEstimateDate:
              typeof payload.expiration_estimate_date === 'string'
                ? payload.expiration_estimate_date
                : current.payment.expirationEstimateDate ?? null,
            purchaseId:
              typeof payload.purchase_id === 'string'
                ? payload.purchase_id
                : current.payment.purchaseId,
            paymentCurrency:
              typeof payload.pay_currency === 'string'
                ? payload.pay_currency
                : current.payment.paymentCurrency,
            createdAt:
              typeof payload.created_at === 'string'
                ? payload.created_at
                : current.payment.createdAt,
            updatedAt:
              typeof payload.updated_at === 'string'
                ? payload.updated_at
                : current.payment.updatedAt,
          };
        },
      });

      if (
        result.order &&
        result.transitionedToFailure &&
        ['expired', 'failed', 'refunded'].includes(result.order.payment.status)
      ) {
        sendPaymentFailedEvent(result.order).catch(err =>
          console.error('Payment failed event error:', err)
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Unable to process NOWPayments IPN callback:', error);
    return NextResponse.json({ error: 'Invalid callback payload.' }, { status: 400 });
  }
}
