import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { diagnosePayment } from '@/lib/checkout/payment-diagnostics';

const querySchema = z.object({
  order: z.string().trim().min(1),
});

export const GET = createApiRoute({
  route: 'admin/payments/diagnostics',
  access: 'admin',
  querySchema,
  handler: async ({ query }) => {
    return {
      data: await diagnosePayment(query.order),
      cacheControl: 'no-store',
    };
  },
});
