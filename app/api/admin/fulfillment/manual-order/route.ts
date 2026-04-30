import { z } from 'zod';
import { apiError } from '@/lib/api/errors';
import { createApiRoute } from '@/lib/api/route';
import { createManualFulfillmentOrder } from '@/lib/checkout/fulfillment-service';

const bodySchema = z.object({
  orderNumber: z.string().trim().optional(),
  customerName: z.string().trim().min(1, 'Customer name is required.'),
  email: z.string().trim().email().optional().or(z.literal('')),
  totalAmount: z.string().trim().min(1, 'Total amount is required.'),
  currencyCode: z.string().trim().min(3).max(3).default('USD'),
  itemCount: z.coerce.number().int().positive().default(1),
  carrier: z.string().trim().optional(),
  service: z.string().trim().optional(),
  trackingCode: z.string().trim().optional(),
  labelUrl: z.string().trim().url().optional().or(z.literal('')),
  publicTrackingUrl: z.string().trim().url().optional().or(z.literal('')),
  fulfillmentStatus: z
    .enum(['pending', 'label_ready', 'packed', 'handed_to_carrier', 'error'])
    .default('pending'),
  notes: z.string().trim().optional(),
});

function normalizeManualFulfillmentError(error: unknown) {
  if (!(error instanceof Error)) {
    return apiError.internal('Failed to create manual fulfillment order.');
  }

  if (/already exists/i.test(error.message)) {
    return apiError.conflict(error.message);
  }

  if (/required|valid|must be|non-negative/i.test(error.message)) {
    return apiError.badRequest(error.message);
  }

  return apiError.internal(error.message);
}

export const dynamic = 'force-dynamic';

export const POST = createApiRoute({
  route: '/api/admin/fulfillment/manual-order',
  access: 'admin',
  bodySchema,
  cacheControl: 'no-store',
  handler: async ({ body }) => {
    try {
      const order = await createManualFulfillmentOrder({
        ...body,
        email: body.email || undefined,
        labelUrl: body.labelUrl || undefined,
        publicTrackingUrl: body.publicTrackingUrl || undefined,
      });

      return {
        data: {
          order,
        },
      };
    } catch (error) {
      throw normalizeManualFulfillmentError(error);
    }
  },
});
