import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { refreshCheckoutPaymentStatus } from '@/lib/checkout/payment-status-service';

const paramsSchema = z.object({
  paymentId: z.string().trim().min(1),
});

const querySchema = z.object({
  orderId: z.string().trim().min(1),
  key: z.string().trim().min(1),
});

export const dynamic = 'force-dynamic';

export const GET = createApiRoute({
  route: '/api/checkout/v2/payments/:paymentId/status',
  rateLimit: 'checkout',
  paramsSchema,
  querySchema,
  cacheControl: 'no-store',
  handler: async ({ params, query }) => {
    const order = await refreshCheckoutPaymentStatus({
      orderId: query.orderId,
      accessKey: query.key,
      paymentId: params.paymentId,
    });

    return {
      data: {
        order,
      },
    };
  },
});
