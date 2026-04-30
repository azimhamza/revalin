import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { submitInteracTransfer } from '@/lib/checkout/interac';

const paramsSchema = z.object({
  orderId: z.string().trim().min(1),
});

const bodySchema = z.object({
  accessKey: z.string().trim().min(1),
});

export const dynamic = 'force-dynamic';

export const POST = createApiRoute({
  route: '/api/checkout/v2/orders/:orderId/interac-submission',
  rateLimit: 'checkout',
  paramsSchema,
  bodySchema,
  cacheControl: 'no-store',
  handler: async ({ params, body }) => ({
    data: {
      order: await submitInteracTransfer({
        orderId: params.orderId,
        accessKey: body.accessKey,
      }),
    },
  }),
});
