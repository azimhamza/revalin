import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { apiError } from '@/lib/api/errors';
import { getCheckoutOrder, updateCheckoutOrder } from '@/lib/checkout/order-store';
import { runSuccessfulOrderProcessing, ensureCheckoutOrderProcessing } from '@/lib/checkout/payment-lifecycle';
import { isInteracPayment } from '@/lib/checkout/types';

const isDev = process.env.NODE_ENV === 'development';

const paramsSchema = z.object({
  orderId: z.string().min(1),
});

export const POST = createApiRoute({
  route: 'admin/fulfillment/dev-force-payment',
  access: 'admin',
  paramsSchema,
  handler: async ({ params }) => {
    if (!isDev) {
      throw apiError.forbidden('Only available in development.');
    }

    const order = await getCheckoutOrder(params.orderId);
    if (!order) {
      throw apiError.notFound('Order not found.');
    }

    const targetStatus =
      order.payment.provider === 'shieldclimb' ||
      order.payment.provider === 'bankful' ||
      order.payment.provider === 'interac'
        ? 'paid'
        : 'finished';

    // Force payment status to a successful provider-specific state and make
    // sure the order enters the fulfillment queue immediately.
    await updateCheckoutOrder(params.orderId, (current) => ({
      ...current,
      payment: isInteracPayment(current.payment)
        ? {
            ...current.payment,
            status: 'paid',
          }
        : {
            ...current.payment,
            status: targetStatus,
          },
      processing: ensureCheckoutOrderProcessing(current.processing),
      fulfillmentStatus: current.fulfillmentStatus ?? 'pending',
      latestError: null,
    }));

    // Run the full successful-order processing pipeline
    const processed = await runSuccessfulOrderProcessing(params.orderId);

    return {
      data: {
        orderId: params.orderId,
        paymentStatus: processed?.payment.status,
        fulfillmentStatus: processed?.fulfillmentStatus,
        hasLabel: Boolean(processed?.shipengine?.labelUrl),
        trackingCode: processed?.shipengine?.trackingCode || null,
      },
    };
  },
});
