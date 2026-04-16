import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { apiError } from '@/lib/api/errors';
import { getCheckoutOrder } from '@/lib/checkout/order-store';
import { runSuccessfulOrderProcessing } from '@/lib/checkout/payment-lifecycle';

const isDev = process.env.NODE_ENV === 'development';

const paramsSchema = z.object({
  orderId: z.string().min(1),
});

export const POST = createApiRoute({
  route: 'admin/fulfillment/dev-rerun-processing',
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
