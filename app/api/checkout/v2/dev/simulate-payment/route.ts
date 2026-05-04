import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { apiError } from '@/lib/api/errors';
import { getCheckoutOrder } from '@/lib/checkout/order-store';
import { buildPublicCheckoutOrder } from '@/lib/checkout/public-order';
import { applyVerifiedPaymentStatus } from '@/lib/checkout/payment-lifecycle';
import {
  isBankfulPayment,
  isInteracPayment,
  isNowPaymentsPayment,
  isShieldClimbPayment,
} from '@/lib/checkout/types';
import { sendPaymentFailedEvent } from '@/lib/email/marketing-events';

const bodySchema = z.object({
  orderId: z.string().min(1),
  action: z.enum(['complete', 'fail']),
});

const handler = createApiRoute({
  route: 'POST /api/checkout/v2/dev/simulate-payment',
  access: 'public',
  bodySchema,
  handler: async ({ body }) => {
    const order = await getCheckoutOrder(body.orderId);
    if (!order) {
      throw apiError.notFound('Order not found.');
    }

    const isNowPayments = isNowPaymentsPayment(order.payment);
    const isShieldClimb = isShieldClimbPayment(order.payment);
    const isBankful = isBankfulPayment(order.payment);
    const isInterac = isInteracPayment(order.payment);

    if (!isNowPayments && !isShieldClimb && !isBankful && !isInterac) {
      throw apiError.badRequest('Order has an unknown payment provider.');
    }

    const provider = isNowPayments
      ? 'nowpayments'
      : isInterac
        ? 'interac'
        : isBankful
          ? 'bankful'
          : 'shieldclimb';

    if (body.action === 'complete') {
      const targetStatus = isNowPayments ? 'finished' : 'paid';
      const source = isNowPayments
        ? 'nowpayments_poll'
        : isInterac
          ? 'interac_admin'
          : isBankful
            ? 'bankful_poll'
            : 'shieldclimb_poll';

      const result = await applyVerifiedPaymentStatus({
        orderId: body.orderId,
        provider,
        targetStatus,
        source,
        paymentUpdater: (current) => {
          if (isInteracPayment(current.payment)) {
            return {
              ...current.payment,
              status: 'paid',
            };
          }

          return {
            ...current.payment,
            status: targetStatus,
          };
        },
      });

      if (!result.order) {
        throw apiError.internal('Failed to process payment simulation.');
      }

      return { data: { order: await buildPublicCheckoutOrder(result.order) } };
    }

    // action === 'fail'
    const targetStatus = 'failed';
    const source = isNowPayments
      ? 'nowpayments_poll'
      : isInterac
        ? 'interac_admin'
        : isBankful
          ? 'bankful_poll'
          : 'shieldclimb_poll';

    const result = await applyVerifiedPaymentStatus({
      orderId: body.orderId,
      provider,
      targetStatus,
      source,
      paymentUpdater: (current) => {
        if (isInteracPayment(current.payment)) {
          return {
            ...current.payment,
            status: 'review_required',
          };
        }

        return {
          ...current.payment,
          status: targetStatus,
        };
      },
    });

    if (result.order) {
      await sendPaymentFailedEvent(result.order);
    }

    return {
      data: {
        order: result.order ? await buildPublicCheckoutOrder(result.order) : null,
      },
    };
  },
});

export function POST(request: Request, context: { params: Promise<Record<string, string>> }) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: { code: 'not_found', message: 'Not found.' } },
      { status: 404 }
    );
  }

  return handler(request, context);
}
