import { z } from 'zod';

import { createApiRoute } from '@/lib/api/route';
import { getCatalogAvailability } from '@/lib/internal-availability';

const availabilityRequestSchema = z.object({
  products: z
    .array(
      z.object({
        handle: z.string().trim().min(1).max(256),
        productId: z.string().trim().min(1).max(256).optional().nullable(),
        variants: z
          .array(
            z.object({
              id: z.string().trim().min(1).max(256),
              sku: z.string().trim().max(256).optional().nullable(),
            }),
          )
          .max(50)
          .optional(),
      }),
    )
    .min(1)
    .max(12),
});

export const dynamic = 'force-dynamic';

export const POST = createApiRoute({
  route: '/api/catalog/availability',
  rateLimit: 'catalog',
  bodySchema: availabilityRequestSchema,
  cacheControl: 'no-store',
  handler: async ({ body }) => {
    const products = await getCatalogAvailability(body.products);

    return {
      data: {
        products,
      },
    };
  },
});
