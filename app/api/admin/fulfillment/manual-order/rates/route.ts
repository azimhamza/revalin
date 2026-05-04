import { z } from 'zod';
import { apiError } from '@/lib/api/errors';
import { createApiRoute } from '@/lib/api/route';
import { quoteManualSwellFulfillmentRates } from '@/lib/checkout/fulfillment-service';

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
});

function normalizeRateQuoteError(error: unknown) {
  if (!(error instanceof Error)) {
    return apiError.internal('Failed to quote live shipping rates.');
  }

  if (/already in fulfillment/i.test(error.message)) {
    return apiError.conflict(error.message);
  }

  if (/required|not found|no rates|address|shipengine|shippo|shipping/i.test(error.message)) {
    return apiError.badRequest(error.message);
  }

  return apiError.internal(error.message);
}

export const dynamic = 'force-dynamic';

export const POST = createApiRoute({
  route: '/api/admin/fulfillment/manual-order/rates',
  access: 'admin',
  bodySchema,
  cacheControl: 'no-store',
  handler: async ({ body }) => {
    try {
      const quote = await quoteManualSwellFulfillmentRates({
        swellOrderId: body.swellOrderId,
        shippingAddress: {
          ...body.shippingAddress,
          country: body.shippingAddress.country.toUpperCase(),
          address2: body.shippingAddress.address2 || undefined,
          notes: body.shippingAddress.notes || undefined,
        },
      });

      return {
        data: {
          quote,
        },
      };
    } catch (error) {
      throw normalizeRateQuoteError(error);
    }
  },
});
