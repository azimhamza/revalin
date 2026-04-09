import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { getPublicCheckoutOrder, releaseCheckoutOrder } from '@/lib/checkout/order-service';

const paramsSchema = z.object({
  orderId: z.string().trim().min(1),
});

const querySchema = z.object({
  key: z.string().trim().min(1),
  reason: z.string().trim().optional(),
});

export const dynamic = 'force-dynamic';

export const GET = createApiRoute({
  route: '/api/checkout/v2/orders/:orderId',
  rateLimit: 'checkout',
  paramsSchema,
  querySchema,
  cacheControl: 'no-store',
  handler: async ({ params, query }) => {
    return {
      data: {
        order: await getPublicCheckoutOrder({
          orderId: params.orderId,
          accessKey: query.key,
        }),
      },
    };
  },
});

export const DELETE = createApiRoute({
  route: '/api/checkout/v2/orders/:orderId',
  rateLimit: 'checkout',
  paramsSchema,
  querySchema,
  cacheControl: 'no-store',
  handler: async ({ params, query }) => {
    return {
      data: {
        order: await releaseCheckoutOrder({
          orderId: params.orderId,
          accessKey: query.key,
          reason: query.reason,
        }),
      },
    };
  },
});
