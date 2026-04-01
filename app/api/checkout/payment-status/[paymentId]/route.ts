import { NextResponse } from 'next/server';
import { getNowPaymentsPayment } from '@/lib/checkout/nowpayments';
import { checkShieldClimbPaymentStatus } from '@/lib/checkout/shieldclimb';
import { getCheckoutOrder, updateCheckoutOrder } from '@/lib/checkout/order-store';
import { isShieldClimbPayment, isNowPaymentsPayment, toPublicCheckoutOrder } from '@/lib/checkout/types';
import { syncCheckoutOrderToSwell, syncShieldClimbOrderToSwell } from '@/lib/checkout/swell-payment-sync';
import { sendOrderConfirmationEmail } from '@/lib/email/order-emails';
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
      if (order.payment.ipnToken !== params.paymentId) {
        return NextResponse.json({ error: 'Checkout session not found.' }, { status: 404 });
      }

      const scStatus = await checkShieldClimbPaymentStatus(order.payment.ipnToken);

      if (scStatus.status === 'paid' && order.payment.status !== 'paid') {
        // Sync to Swell + send confirmation email (non-blocking)
        const updatedOrder = await updateCheckoutOrder(orderId, current => ({
          ...current,
          payment: {
            ...current.payment,
            status: 'paid',
            valueCoinReceived: scStatus.value_coin ?? null,
            txidOut: scStatus.txid_out ?? null,
            updatedAt: new Date().toISOString(),
          },
        }));

        if (updatedOrder) {
          syncShieldClimbOrderToSwell(updatedOrder).catch(err =>
            console.error('ShieldClimb Swell sync failed:', err)
          );
          sendOrderConfirmationEmail(updatedOrder).catch(err =>
            console.error('Order confirmation email failed:', err)
          );
        }

        return NextResponse.json({ order: updatedOrder ? toPublicCheckoutOrder(updatedOrder) : toPublicCheckoutOrder(order) });
      }

      return NextResponse.json({ order: toPublicCheckoutOrder(order) });
    }

    // ── NOWPayments path ──
    if (isNowPaymentsPayment(order.payment)) {
      if (order.payment.paymentId !== params.paymentId) {
        return NextResponse.json({ error: 'Checkout session not found.' }, { status: 404 });
      }

      const payment = await getNowPaymentsPayment(params.paymentId);
      const syncedPayment = await syncCheckoutOrderToSwell(order, payment);
      const updated = await updateCheckoutOrder(orderId, current => {
        if (!isNowPaymentsPayment(current.payment)) return current;
        return {
          ...current,
          payment: {
            ...current.payment,
            swellPaymentId: syncedPayment?.id || current.payment.swellPaymentId,
            status: payment.payment_status,
            payAddress: payment.pay_address,
            payAmount: String(payment.pay_amount),
            amountReceived:
              payment.amount_received === undefined || payment.amount_received === null
                ? null
                : String(payment.amount_received),
            payinExtraId: payment.payin_extra_id ?? null,
            network: payment.network ?? null,
            networkPrecision: payment.network_precision ?? null,
            timeLimit: payment.time_limit ?? null,
            expirationEstimateDate: payment.expiration_estimate_date ?? null,
            validUntil: payment.valid_until ?? null,
            createdAt: payment.created_at,
            updatedAt: payment.updated_at,
          },
          latestError: null,
        };
      });

      // Fire payment failed event if status transitioned to expired/failed
      const failedStatuses = ['expired', 'failed', 'refunded'];
      if (
        failedStatuses.includes(payment.payment_status) &&
        !failedStatuses.includes(order.payment.status)
      ) {
        const orderForEvent = updated || order;
        sendPaymentFailedEvent(orderForEvent).catch(err =>
          console.error('Payment failed event error:', err)
        );
      }

      return NextResponse.json({ order: updated ? toPublicCheckoutOrder(updated) : toPublicCheckoutOrder(order) });
    }

    return NextResponse.json({ error: 'Unknown payment provider.' }, { status: 400 });
  } catch (error) {
    console.error('Unable to refresh payment status:', error);
    return NextResponse.json({ error: 'Unable to refresh payment status right now.' }, { status: 500 });
  }
}
