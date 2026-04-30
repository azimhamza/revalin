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
    });

    return {
      data: {
        orderId: params.orderId,
        fulfillmentStatus: order.fulfillmentStatus,
        hasLabel: Boolean(order.shipengine?.labelUrl),
        trackingCode: order.shipengine?.trackingCode || null,
        labelUrl: order.shipengine?.labelUrl || null,
        labelError: order.shipengine?.labelError || null,
      },
    };
  },
});
