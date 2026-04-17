import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { apiError } from '@/lib/api/errors';
import { getCheckoutOrder } from '@/lib/checkout/order-store';
import { applyVerifiedPaymentStatus } from '@/lib/checkout/payment-lifecycle';
import { isNowPaymentsPayment, isShieldClimbPayment, toPublicCheckoutOrder } from '@/lib/checkout/types';
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

    if (!isNowPayments && !isShieldClimb) {
      throw apiError.badRequest('Order has an unknown payment provider.');
    }

    const provider = isNowPayments ? 'nowpayments' : 'shieldclimb';

    if (body.action === 'complete') {
      const targetStatus = isNowPayments ? 'finished' : 'paid';
      const source = isNowPayments ? 'nowpayments_poll' : 'shieldclimb_poll';

      const result = await applyVerifiedPaymentStatus({
        orderId: body.orderId,
        provider,
        targetStatus,
        source,
        paymentUpdater: (current) => ({
          ...current.payment,
          status: targetStatus,
        }),
      });

      if (!result.order) {
        throw apiError.internal('Failed to process payment simulation.');
      }

      return { data: { order: toPublicCheckoutOrder(result.order) } };
    }

    // action === 'fail'
    const targetStatus = 'failed';
    const source = isNowPayments ? 'nowpayments_poll' : 'shieldclimb_poll';

    const result = await applyVerifiedPaymentStatus({
      orderId: body.orderId,
      provider,
      targetStatus,
      source,
      paymentUpdater: (current) => ({
        ...current.payment,
        status: targetStatus,
      }),
    });

    if (result.order) {
      await sendPaymentFailedEvent(result.order);
    }

    return {
      data: {
        order: result.order ? toPublicCheckoutOrder(result.order) : null,
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
