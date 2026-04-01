import { NextResponse } from 'next/server';
import { findCheckoutOrderByPaymentId, getCheckoutOrder, saveCheckoutOrder } from '@/lib/checkout/order-store';
import { verifyNowPaymentsSignature } from '@/lib/checkout/nowpayments';
import { syncCheckoutOrderToSwell } from '@/lib/checkout/swell-payment-sync';
import { isNowPaymentsPayment } from '@/lib/checkout/types';
import { sendPaymentFailedEvent } from '@/lib/email/marketing-events';
import { createPayoutFromOrder } from '@/lib/checkout/payout-service';

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
      const syncedPayment = paymentId
        ? await syncCheckoutOrderToSwell(matchedOrder, {
            payment_id: paymentId,
            payment_status:
              typeof payload.payment_status === 'string' ? payload.payment_status : matchedOrder.payment.status,
            pay_currency:
              typeof payload.pay_currency === 'string'
                ? payload.pay_currency
                : matchedOrder.payment.paymentCurrency,
            pay_address:
              typeof payload.pay_address === 'string' ? payload.pay_address : matchedOrder.payment.payAddress || '',
            pay_amount:
              payload.pay_amount === undefined || payload.pay_amount === null
                ? Number(matchedOrder.payment.payAmount || 0)
                : Number(payload.pay_amount),
            purchase_id:
              typeof payload.purchase_id === 'string' ? payload.purchase_id : matchedOrder.payment.purchaseId,
            created_at:
              typeof payload.created_at === 'string' ? payload.created_at : matchedOrder.payment.createdAt || '',
            updated_at:
              typeof payload.updated_at === 'string' ? payload.updated_at : matchedOrder.payment.updatedAt || '',
            network: typeof payload.network === 'string' ? payload.network : matchedOrder.payment.network || null,
            valid_until:
              typeof payload.valid_until === 'string' ? payload.valid_until : matchedOrder.payment.validUntil || null,
            expiration_estimate_date:
              typeof payload.expiration_estimate_date === 'string'
                ? payload.expiration_estimate_date
                : matchedOrder.payment.expirationEstimateDate || null,
          })
        : null;

      // Fire payment failed event if transitioning to expired/failed
      const newStatus = typeof payload.payment_status === 'string' ? payload.payment_status : matchedOrder.payment.status;
      const failedStatuses = ['expired', 'failed', 'refunded'];
      if (failedStatuses.includes(newStatus) && !failedStatuses.includes(matchedOrder.payment.status)) {
        sendPaymentFailedEvent(matchedOrder).catch(err =>
          console.error('Payment failed event error:', err)
        );
      }

      await saveCheckoutOrder({
        ...matchedOrder,
        updatedAt: new Date().toISOString(),
        payment: {
          ...matchedOrder.payment,
          swellPaymentId: syncedPayment?.id || matchedOrder.payment.swellPaymentId,
          paymentId,
          status: typeof payload.payment_status === 'string' ? payload.payment_status : matchedOrder.payment.status,
          payAddress:
            typeof payload.pay_address === 'string' ? payload.pay_address : matchedOrder.payment.payAddress,
          payAmount:
            payload.pay_amount === undefined || payload.pay_amount === null
              ? matchedOrder.payment.payAmount
              : String(payload.pay_amount),
          amountReceived:
            payload.actually_paid === undefined || payload.actually_paid === null
              ? (payload.amount_received === undefined || payload.amount_received === null
                ? matchedOrder.payment.amountReceived
                : String(payload.amount_received))
              : String(payload.actually_paid),
          payinExtraId:
            typeof payload.payin_extra_id === 'string'
              ? payload.payin_extra_id
              : matchedOrder.payment.payinExtraId ?? null,
          network: typeof payload.network === 'string' ? payload.network : matchedOrder.payment.network ?? null,
          updatedAt:
            typeof payload.updated_at === 'string' ? payload.updated_at : matchedOrder.payment.updatedAt,
        },
        ipnEvents: [
          ...(matchedOrder.ipnEvents || []),
          {
            receivedAt: new Date().toISOString(),
            signature: signature || undefined,
            valid: isValid,
            payload,
          },
        ],
      });

      // Create affiliate payout when payment is finished
      if (newStatus === 'finished') {
        createPayoutFromOrder(matchedOrder.orderId, 'nowpayments').catch(err =>
          console.error('Affiliate payout creation failed:', err)
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Unable to process NOWPayments IPN callback:', error);
    return NextResponse.json({ error: 'Invalid callback payload.' }, { status: 400 });
  }
}
