import { z } from 'zod';

const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Invalid country code');

export const checkoutMoneySchema = z.object({
  amount: z.string(),
  currencyCode: z.string(),
});

const checkoutFulfillmentEstimateSchema = z.object({
  label: z.string().trim().min(1),
  availableToShipNow: z.number().int().min(0),
  isHighDemand: z.boolean(),
});

export const checkoutShippingAddressSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().min(7),
  address1: z.string().trim().min(1),
  address2: z.string().trim().optional(),
  city: z.string().trim().min(1),
  province: z.string().trim().optional().default(''),
  postalCode: z.string().trim().min(1),
  country: countryCodeSchema,
  notes: z.string().trim().max(500).optional(),
});

export const checkoutCartSnapshotSchema = z.object({
  currencyCode: z.string().trim().min(1),
  lines: z
    .array(
      z.object({
        id: z.string(),
        merchandiseId: z.string().trim().min(1),
        productHandle: z.string().trim().min(1),
        productTitle: z.string(),
        variantTitle: z.string(),
        skuNumber: z.string().optional(),
        imageUrl: z.string(),
        selectedOptions: z.array(
          z.object({
            name: z.string(),
            value: z.string(),
          }),
        ),
        quantity: z.number().int().positive(),
        unitPrice: checkoutMoneySchema,
        lineTotal: checkoutMoneySchema,
        fulfillmentEstimate: checkoutFulfillmentEstimateSchema.optional(),
      }),
    )
    .min(1),
});

export const checkoutSessionCreateSchema = z.object({
  cartId: z.string().trim().min(1).optional(),
  cartSnapshot: checkoutCartSnapshotSchema.optional(),
  shippingAddress: checkoutShippingAddressSchema.optional(),
  paymentMethod: z.enum(['card', 'crypto', 'interac', 'square']).optional(),
  paymentCurrency: z.string().trim().min(2).optional(),
  sourceWalletAddress: z.string().trim().max(255).optional(),
  interacSenderEmail: z.string().trim().email().optional(),
  interacSenderName: z.string().trim().min(1).max(256).optional(),
  interacSecurityQuestion: z.string().trim().max(256).optional(),
  interacSecurityAnswer: z.string().trim().max(256).optional(),
  discountCode: z.string().trim().optional(),
  shipmentProtection: z.boolean().optional(),
  adminShippingDisabled: z.boolean().optional(),
});

export const checkoutSessionMutationSchema = checkoutSessionCreateSchema.extend({
  sessionKey: z.string().trim().min(1),
  version: z.number().int().positive().optional(),
  selectedShippingServiceId: z.string().trim().min(1).optional(),
  card: z
    .object({
      number: z.string().trim().min(12).max(24),
      cvv: z.string().trim().min(3).max(4),
      expiryMonth: z.string().trim().min(1).max(2),
      expiryYear: z.string().trim().min(2).max(4),
      cardholderName: z.string().trim().min(1).max(128).optional(),
    })
    .optional(),
});

export const checkoutSessionAccessSchema = z.object({
  sessionKey: z.string().trim().min(1),
});
