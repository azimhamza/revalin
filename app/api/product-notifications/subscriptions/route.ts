import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { getLiveProduct } from '@/lib/swell';
import { subscribeToBackInStock } from '@/lib/back-in-stock/service';
import { ProductNotificationError } from '@/lib/back-in-stock/utils';
import { apiError } from '@/lib/api/errors';

const subscribeSchema = z.object({
  email: z.string().trim().email(),
  productHandle: z.string().trim().min(1),
  variantId: z.string().trim().optional(),
});

export const dynamic = 'force-dynamic';

export const POST = createApiRoute({
  route: '/api/product-notifications/subscriptions',
  rateLimit: 'marketing',
  bodySchema: subscribeSchema,
  cacheControl: 'no-store',
  handler: async ({ body }) => {
    const product = await getLiveProduct(body.productHandle);
    if (!product) {
      throw apiError.notFound('Product not found.');
    }

    try {
      const result = await subscribeToBackInStock({
        email: body.email,
        product,
        variantId: body.variantId,
      });

      return {
        data: {
          created: result.created,
          message: result.created
            ? 'You are on the list. We will email you when this selection is back in stock.'
            : 'You are already on the list for this selection.',
        },
        status: 201,
      };
    } catch (error) {
      if (error instanceof ProductNotificationError) {
        if (error.status === 404) {
          throw apiError.notFound(error.message);
        }
        throw apiError.badRequest(error.message);
      }
      throw error;
    }
  },
});
