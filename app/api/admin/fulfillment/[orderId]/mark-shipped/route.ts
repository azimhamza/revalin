import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { markOrderShipped } from '@/lib/checkout/fulfillment-service';

const paramsSchema = z.object({
  orderId: z.string().min(1),
});

export const POST = createApiRoute({
  route: 'admin/fulfillment/mark-shipped',
  access: 'admin',
  paramsSchema,
  handler: async ({ params, session }) => {
    const order = await markOrderShipped({
      orderId: params.orderId,
      adminUserId: session.user.id,
    });
    return { data: { orderId: params.orderId, fulfillmentStatus: order?.fulfillmentStatus } };
  },
});
