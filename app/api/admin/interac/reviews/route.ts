import { z } from 'zod';
import { createApiListRoute } from '@/lib/api/route';
import { listInteracReviews } from '@/lib/checkout/interac';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  status: z.string().trim().default('open'),
});

export const dynamic = 'force-dynamic';

export const GET = createApiListRoute({
  route: '/api/admin/interac/reviews',
  access: 'admin',
  querySchema,
  cacheControl: 'no-store',
  handler: async ({ query }) => {
    const result = await listInteracReviews(query);
    return result;
  },
});
