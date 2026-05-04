import { z } from 'zod';
import { apiError } from '@/lib/api/errors';
import { createApiRoute } from '@/lib/api/route';
import { createManualSwellFulfillmentOrder } from '@/lib/checkout/fulfillment-service';

const shippingAddressSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.'),
  lastName: z.string().trim().min(1, 'Last name is required.'),
  email: z.string().trim().email('Valid email is required.'),
  phone: z.string().trim().min(1, 'Phone is required.'),
  address1: z.string().trim().min(1, 'Address line 1 is required.'),
  address2: z.string().trim().optional(),
  city: z.string().trim().min(1, 'City is required.'),
  province: z.string().trim().min(1, 'State/province is required.'),
  postalCode: z.string().trim().min(1, 'Postal/postal code is required.'),
  country: z.string().trim().length(2, 'Use the 2-letter country code.'),
  notes: z.string().trim().optional(),
});

const bodySchema = z.object({
  swellOrderId: z.string().trim().min(1, 'Swell order ID is required.'),
  shippingAddress: shippingAddressSchema,
  selectedShippingServiceId: z.string().trim().min(1, 'Select a live shipping rate.'),
  payoutMethod: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

function normalizeManualFulfillmentError(error: unknown) {
  if (!(error instanceof Error)) {
    return apiError.internal('Failed to create manual fulfillment order.');
  }

  if (/already exists/i.test(error.message)) {
    return apiError.conflict(error.message);
  }

  if (/already in fulfillment/i.test(error.message)) {
    return apiError.conflict(error.message);
  }

  if (/required|valid|must be|non-negative|not found|no rates|select/i.test(error.message)) {
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
      const order = await createManualSwellFulfillmentOrder({
        swellOrderId: body.swellOrderId,
        shippingAddress: {
          ...body.shippingAddress,
          country: body.shippingAddress.country.toUpperCase(),
          address2: body.shippingAddress.address2 || undefined,
          notes: body.shippingAddress.notes || undefined,
        },
        selectedShippingServiceId: body.selectedShippingServiceId,
        payoutMethod: body.payoutMethod || undefined,
        notes: body.notes || undefined,
      });

      return {
        data: {
          orderId: order.orderId,
          fulfillmentStatus: order.fulfillmentStatus,
          hasLabel: Boolean(order.fulfillment?.labelUrl || order.shipengine?.labelUrl),
          trackingCode: order.fulfillment?.trackingCode || order.shipengine?.trackingCode || null,
          labelUrl: order.fulfillment?.labelUrl || order.shipengine?.labelUrl || null,
          labelError: order.fulfillment?.labelError || order.shipengine?.labelError || null,
        },
      };
    } catch (error) {
      throw normalizeManualFulfillmentError(error);
    }
  },
});
