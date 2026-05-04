import { z } from 'zod';
import { createApiListRoute } from '@/lib/api/route';
import { listAdminBankfulInvoices } from '@/lib/checkout/bankful-invoice-service';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
  status: z
    .enum(['all', 'paid', 'pending', 'failed', 'review'])
    .default('all'),
});

export const dynamic = 'force-dynamic';

export const GET = createApiListRoute({
  route: 'admin/invoices',
  access: 'admin',
  querySchema,
  cacheControl: 'no-store',
  handler: async ({ query }) => {
    return listAdminBankfulInvoices({
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
    });
  },
});
