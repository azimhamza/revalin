import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { updateShippingAddressAndPurchaseLabel } from '@/lib/checkout/fulfillment-service';

const paramsSchema = z.object({
  orderId: z.string().min(1),
});

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
  shippingAddress: shippingAddressSchema,
  selectedShippingServiceId: z.string().trim().optional(),
  customs: z.object({
    description: z.string().trim().optional(),
    quantity: z.coerce.number().int().positive().optional(),
    unitWeight: z.string().trim().optional(),
    netWeight: z.string().trim().optional(),
    massUnit: z.enum(['g', 'kg', 'lb', 'oz']).optional(),
    unitValueAmount: z.string().trim().optional(),
    valueAmount: z.string().trim().optional(),
    valueCurrency: z.string().trim().length(3).optional(),
    originCountry: z.string().trim().length(2).optional(),
    hsCode: z.string().trim().optional(),
    eccnEar99: z.string().trim().optional(),
    manufacturerNotes: z.string().trim().optional(),
    certifySigner: z.string().trim().optional(),
    contentsType: z.enum([
      'DOCUMENTS',
      'GIFT',
      'SAMPLE',
      'MERCHANDISE',
      'HUMANITARIAN_DONATION',
      'RETURN_MERCHANDISE',
      'OTHER',
    ]).optional(),
    nonDeliveryOption: z.enum(['RETURN', 'ABANDON']).optional(),
    incoterm: z.enum(['DDU', 'DDP']).optional(),
  }).optional(),
});

export const POST = createApiRoute({
  route: 'admin/fulfillment/manual-label',
  access: 'admin',
  paramsSchema,
  bodySchema,
  handler: async ({ params, body }) => {
    const order = await updateShippingAddressAndPurchaseLabel({
      orderId: params.orderId,
      shippingAddress: {
        ...body.shippingAddress,
        country: body.shippingAddress.country.toUpperCase(),
        address2: body.shippingAddress.address2 || undefined,
        notes: body.shippingAddress.notes || undefined,
      },
      selectedShippingServiceId: body.selectedShippingServiceId,
      customs: body.customs,
    });
    const fulfillment = order.fulfillment || order.shipengine || null;

    return {
      data: {
        orderId: params.orderId,
        fulfillmentStatus: order.fulfillmentStatus,
        hasLabel: Boolean(fulfillment?.labelUrl),
        trackingCode: fulfillment?.trackingCode || null,
        labelUrl: fulfillment?.labelUrl || null,
        labelError: fulfillment?.labelError || null,
      },
    };
  },
});
