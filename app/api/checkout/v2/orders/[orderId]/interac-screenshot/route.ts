import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { apiError } from '@/lib/api/errors';
import { uploadInteracScreenshot } from '@/lib/checkout/interac';

const paramsSchema = z.object({
  orderId: z.string().trim().min(1),
});

export const dynamic = 'force-dynamic';

export const POST = createApiRoute({
  route: '/api/checkout/v2/orders/:orderId/interac-screenshot',
  rateLimit: 'checkout',
  paramsSchema,
  cacheControl: 'no-store',
  handler: async ({ request, params }) => {
    const formData = await request.formData();
    const accessKey = String(formData.get('accessKey') || '').trim();
    const file = formData.get('file');

    if (!accessKey) {
      throw apiError.badRequest('Missing access key.');
    }
    if (!file || !(file instanceof Blob)) {
      throw apiError.badRequest('Missing screenshot file.');
    }

    return {
      data: await uploadInteracScreenshot({
        orderId: params.orderId,
        accessKey,
        file,
      }),
    };
  },
});
