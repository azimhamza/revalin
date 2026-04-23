import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { retryOrderLabelPurchase } from '@/lib/checkout/fulfillment-service';

const paramsSchema = z.object({
  orderId: z.string().min(1),
});

export const POST = createApiRoute({
  route: 'admin/fulfillment/retry-label',
  access: 'admin',
  paramsSchema,
  handler: async ({ params }) => {
    const order = await retryOrderLabelPurchase(params.orderId);

    return {
      data: {
        orderId: params.orderId,
        fulfillmentStatus: order.fulfillmentStatus,
        hasLabel: Boolean(order.shipengine?.labelUrl),
        trackingCode: order.shipengine?.trackingCode || null,
        labelError: order.shipengine?.labelError || null,
      },
    };
  },
});
