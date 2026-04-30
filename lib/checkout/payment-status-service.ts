import { apiError } from '@/lib/api/errors';
import { SHIELDCLIMB_PUBLIC_POLLING_ID } from '@/lib/checkout/constants';
import { getNowPaymentsPayment } from '@/lib/checkout/nowpayments';
import { getCheckoutOrder } from '@/lib/checkout/order-store';
import { buildPublicCheckoutOrder } from '@/lib/checkout/public-order';
import { applyVerifiedPaymentStatus } from '@/lib/checkout/payment-lifecycle';
import {
  isNowPaymentsPayment,
  isInteracPayment,
  isShieldClimbPayment,
} from '@/lib/checkout/types';
import { verifyAndFinalizeShieldClimbPayment } from '@/lib/checkout/shieldclimb-payment-verification';
import { sendPaymentFailedEvent } from '@/lib/email/marketing-events';

export async function refreshCheckoutPaymentStatus(args: {
  orderId: string;
  accessKey: string;
  paymentId: string;
}) {
  const order = await getCheckoutOrder(args.orderId);

  if (!order || order.accessKey !== args.accessKey) {
    throw apiError.notFound('Checkout session not found.');
  }

  try {
    if (isShieldClimbPayment(order.payment)) {
      if (
        args.paymentId !== SHIELDCLIMB_PUBLIC_POLLING_ID &&
        args.paymentId !== order.payment.ipnToken
      ) {
        throw apiError.notFound('Checkout session not found.');
      }

      const verification = await verifyAndFinalizeShieldClimbPayment({
        orderId: args.orderId,
      });
      return buildPublicCheckoutOrder(verification.order ?? order);
    }

    if (isNowPaymentsPayment(order.payment)) {
      if (order.payment.paymentId !== args.paymentId) {
        throw apiError.notFound('Checkout session not found.');
      }

      const payment = await getNowPaymentsPayment(args.paymentId);
      const result = await applyVerifiedPaymentStatus({
        orderId: args.orderId,
        provider: 'nowpayments',
        targetStatus: payment.payment_status,
        source: 'nowpayments_poll',
        paymentUpdater: (current) => {
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
        sendPaymentFailedEvent(result.order).catch((error) =>
          console.error('Payment failed event error:', error),
        );
      }

      return buildPublicCheckoutOrder(result.order || order);
    }

    if (isInteracPayment(order.payment)) {
      if (args.paymentId !== 'interac' && args.paymentId !== order.payment.messageCode) {
        throw apiError.notFound('Checkout session not found.');
      }

      return buildPublicCheckoutOrder(order);
    }

    throw apiError.badRequest('Unknown payment provider.');
  } catch (error) {
    if (error instanceof Error && error.name === 'ApiError') {
      throw error;
    }

    console.error('Unable to refresh payment status:', error);
    throw apiError.internal('Unable to refresh payment status right now.');
  }
}
