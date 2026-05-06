import { z } from 'zod';
import { createApiListRoute } from '@/lib/api/route';
import { listFulfillmentOrders } from '@/lib/checkout/fulfillment-service';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  status: z
    .enum(['pending', 'label_ready', 'packed', 'handed_to_carrier', 'error', 'not_required', 'all'])
    .default('all'),
});

export const GET = createApiListRoute({
  route: 'admin/fulfillment/orders',
  access: 'admin',
  querySchema,
  handler: async ({ query }) => {
    return listFulfillmentOrders({
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
    });
  },
});
