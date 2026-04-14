import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { resendShippedEmail } from '@/lib/checkout/fulfillment-service';

const paramsSchema = z.object({
  orderId: z.string().min(1),
});

export const POST = createApiRoute({
  route: 'admin/fulfillment/resend-shipped-email',
  access: 'admin',
  paramsSchema,
  handler: async ({ params }) => {
    await resendShippedEmail(params.orderId);
    return { data: { orderId: params.orderId, sent: true } };
  },
});
