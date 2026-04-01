import { z } from 'zod';
import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth-server';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { QUICK_PAYMENT_CURRENCIES, SHIPPING_COUNTRIES } from '@/lib/checkout/constants';

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
  const matchedCountry = SHIPPING_COUNTRIES.find(country => {
    const label = displayNames.of(country.code);
    return label?.toLowerCase() === trimmed.toLowerCase();
  });

  return matchedCountry?.code ?? trimmed;
}

const countryCodeSchema = z.preprocess(
  normalizeCountryInput,
  z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Country must be a 2-letter country code.')
);

const addressSchema = z.object({
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
    .refine(value => QUICK_PAYMENT_CURRENCIES.includes(value), 'Choose a supported crypto preference.')
    .default(QUICK_PAYMENT_CURRENCIES[0]),
  cryptoWalletAddress: z.string().trim().max(255).optional().default(''),
});

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const address = addressSchema.parse(body);

    await db
      .update(user)
      .set({
        shippingAddress: JSON.stringify({
          firstName: address.firstName,
          lastName: address.lastName,
          email: address.email,
          phone: address.phone,
          address1: address.address1,
          address2: address.address2,
          city: address.city,
          province: address.province,
          postalCode: address.postalCode,
          country: address.country,
        }),
        preferredPaymentCurrency: address.preferredPaymentCurrency,
        cryptoWalletAddress: address.cryptoWalletAddress || null,
        updatedAt: new Date(),
      })
      .where(eq(user.id, session.user.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues.map((i) => i.message).join(' ') },
        { status: 400 }
      );
    }
    console.error('[UPDATE-ADDRESS]', error);
    return NextResponse.json({ error: 'Failed to save address.' }, { status: 500 });
  }
}
