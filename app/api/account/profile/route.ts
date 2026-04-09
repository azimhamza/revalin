import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createApiRoute } from '@/lib/api/route';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import { QUICK_PAYMENT_CURRENCIES, SHIPPING_COUNTRIES } from '@/lib/checkout/constants';

export const dynamic = 'force-dynamic';

const countryAliases = new Map<string, string>([
  ['usa', 'US'],
  ['u.s.a.', 'US'],
  ['united states of america', 'US'],
  ['uk', 'GB'],
  ['u.k.', 'GB'],
]);

function normalizeCountryInput(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const upper = trimmed.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) {
    return upper;
  }

  const aliasMatch = countryAliases.get(trimmed.toLowerCase());
  if (aliasMatch) {
    return aliasMatch;
  }

  const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
  const matchedCountry = SHIPPING_COUNTRIES.find((country) => {
    const label = displayNames.of(country.code);
    return label?.toLowerCase() === trimmed.toLowerCase();
  });

  return matchedCountry?.code ?? trimmed;
}

const countryCodeSchema = z.preprocess(
  normalizeCountryInput,
  z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Country must be a 2-letter country code.'),
);

const profileSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().min(7),
  address1: z.string().trim().min(1),
  address2: z.string().trim().optional().default(''),
  city: z.string().trim().min(1),
  province: z.string().trim().optional().default(''),
  postalCode: z.string().trim().min(1),
  country: countryCodeSchema,
  preferredPaymentCurrency: z
    .string()
    .trim()
    .toLowerCase()
    .refine(
      (value) => QUICK_PAYMENT_CURRENCIES.includes(value),
      'Choose a supported crypto preference.',
    )
    .default(QUICK_PAYMENT_CURRENCIES[0]),
  cryptoWalletAddress: z.string().trim().max(255).optional().default(''),
});

export const GET = createApiRoute({
  route: '/api/account/profile',
  access: 'session',
  cacheControl: 'no-store',
  handler: async ({ session }) => {
    let parsedShippingAddress = null;
    const rawShippingAddress = (session.user as { shippingAddress?: unknown }).shippingAddress;

    if (typeof rawShippingAddress === 'string' && rawShippingAddress.trim()) {
      try {
        parsedShippingAddress = JSON.parse(rawShippingAddress);
      } catch {
        parsedShippingAddress = rawShippingAddress;
      }
    } else if (rawShippingAddress && typeof rawShippingAddress === 'object') {
      parsedShippingAddress = rawShippingAddress;
    }

    return {
      data: {
        shippingAddress: parsedShippingAddress,
        preferredPaymentCurrency:
          typeof (session.user as { preferredPaymentCurrency?: unknown }).preferredPaymentCurrency === 'string'
            ? (session.user as { preferredPaymentCurrency: string }).preferredPaymentCurrency
            : QUICK_PAYMENT_CURRENCIES[0],
        cryptoWalletAddress:
          typeof (session.user as { cryptoWalletAddress?: unknown }).cryptoWalletAddress === 'string'
            ? (session.user as { cryptoWalletAddress: string }).cryptoWalletAddress
            : '',
      },
    };
  },
});

export const PATCH = createApiRoute({
  route: '/api/account/profile',
  access: 'session',
  bodySchema: profileSchema,
  cacheControl: 'no-store',
  handler: async ({ session, body }) => {
    await db
      .update(user)
      .set({
        shippingAddress: JSON.stringify({
          firstName: body.firstName,
          lastName: body.lastName,
          email: body.email,
          phone: body.phone,
          address1: body.address1,
          address2: body.address2,
          city: body.city,
          province: body.province,
          postalCode: body.postalCode,
          country: body.country,
        }),
        preferredPaymentCurrency: body.preferredPaymentCurrency,
        cryptoWalletAddress: body.cryptoWalletAddress || null,
        updatedAt: new Date(),
      })
      .where(eq(user.id, session.user.id));

    return {
      data: {
        saved: true,
      },
    };
  },
});
