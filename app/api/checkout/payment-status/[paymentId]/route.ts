import { NextResponse } from 'next/server';
import { getNowPaymentsPayment } from '@/lib/checkout/nowpayments';
import { SHIELDCLIMB_PUBLIC_POLLING_ID } from '@/lib/checkout/constants';
import { getCheckoutOrder } from '@/lib/checkout/order-store';
import { applyVerifiedPaymentStatus } from '@/lib/checkout/payment-lifecycle';
import { isShieldClimbPayment, isNowPaymentsPayment, toPublicCheckoutOrder } from '@/lib/checkout/types';
import { verifyAndFinalizeShieldClimbPayment } from '@/lib/checkout/shieldclimb-payment-verification';
import { sendPaymentFailedEvent } from '@/lib/email/marketing-events';

export async function GET(
  request: Request,
  context: { params: Promise<{ paymentId: string }> }
) {
  const params = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const orderId = searchParams.get('orderId');
  const key = searchParams.get('key');

  if (!orderId || !key) {
    return NextResponse.json({ error: 'Missing checkout session.' }, { status: 400 });
  }

  const order = await getCheckoutOrder(orderId);

  if (!order || order.accessKey !== key) {
    return NextResponse.json({ error: 'Checkout session not found.' }, { status: 404 });
  }

  try {
    // ── ShieldClimb path ──
    if (isShieldClimbPayment(order.payment)) {
      if (
        params.paymentId !== SHIELDCLIMB_PUBLIC_POLLING_ID &&
        params.paymentId !== order.payment.ipnToken
      ) {
        return NextResponse.json({ error: 'Checkout session not found.' }, { status: 404 });
      }

      const verification = await verifyAndFinalizeShieldClimbPayment({ orderId });
      const orderForResponse = verification.order ?? order;
      return NextResponse.json({ order: toPublicCheckoutOrder(orderForResponse) });
    }

    // ── NOWPayments path ──
    if (isNowPaymentsPayment(order.payment)) {
      if (order.payment.paymentId !== params.paymentId) {
        return NextResponse.json({ error: 'Checkout session not found.' }, { status: 404 });
      }

      const payment = await getNowPaymentsPayment(params.paymentId);
      const result = await applyVerifiedPaymentStatus({
        orderId,
        provider: 'nowpayments',
        targetStatus: payment.payment_status,
        source: 'nowpayments_poll',
        paymentUpdater: current => {
          if (!isNowPaymentsPayment(current.payment)) {
            return current.payment;
          }

          return {
            ...current.payment,
            paymentId: String(payment.payment_id),
            status: payment.payment_status,
            payAddress: payment.pay_address,
            payAmount: String(payment.pay_amount),
            amountReceived:
              payment.amount_received === undefined ||
              payment.amount_received === null
                ? null
                : String(payment.amount_received),
            payinExtraId: payment.payin_extra_id ?? null,
            network: payment.network ?? null,
            networkPrecision: payment.network_precision ?? null,
            timeLimit: payment.time_limit ?? null,
            expirationEstimateDate: payment.expiration_estimate_date ?? null,
            validUntil: payment.valid_until ?? null,
            purchaseId: payment.purchase_id,
            paymentCurrency: payment.pay_currency,
            createdAt: payment.created_at,
            updatedAt: payment.updated_at,
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

      return NextResponse.json({
        order: toPublicCheckoutOrder(result.order || order),
      });
    }

    return NextResponse.json({ error: 'Unknown payment provider.' }, { status: 400 });
  } catch (error) {
    console.error('Unable to refresh payment status:', error);
    return NextResponse.json({ error: 'Unable to refresh payment status right now.' }, { status: 500 });
  }
}
