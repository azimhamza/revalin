import { z } from 'zod';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { resolveRequestCurrencyCode } from '@/lib/swell/currency';
import {
  createSwellCheckoutCart,
  deleteSwellCheckoutCart,
  getSwellManualPaymentMethod,
  toSwellAddress,
  upsertSwellGuestAccount,
  type StorefrontCartSnapshot,
} from '@/lib/checkout/swell-order-management';
import {
  getCartSnapshotSubtotal,
} from '@/lib/checkout/shipping-rates';

const countryCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Invalid country code');

const moneySchema = z.object({
  amount: z.string(),
  currencyCode: z.string(),
});

const validateDiscountSchema = z.object({
  discountCode: z.string().trim().min(1),
  shippingAddress: z.object({
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
  }),
  cartSnapshot: z.object({
    currencyCode: z.string().trim().min(1),
    lines: z
      .array(
        z.object({
          id: z.string(),
          merchandiseId: z.string().trim().min(1),
          productHandle: z.string().trim().min(1),
          productTitle: z.string(),
          variantTitle: z.string(),
          imageUrl: z.string(),
          selectedOptions: z.array(z.object({ name: z.string(), value: z.string() })),
          quantity: z.number().int().positive(),
          unitPrice: moneySchema,
          lineTotal: moneySchema,
        })
      )
      .min(1),
  }).optional(),
});

function toStorefrontCartSnapshot(
  cartSnapshot: z.infer<typeof validateDiscountSchema>['cartSnapshot']
): StorefrontCartSnapshot | undefined {
  if (!cartSnapshot) return undefined;
  return {
    currencyCode: cartSnapshot.currencyCode,
    lines: cartSnapshot.lines.map(line => ({
      merchandiseId: line.merchandiseId,
      productHandle: line.productHandle,
      quantity: line.quantity,
    })),
  };
}

export async function POST(request: Request) {
  try {
    const body = validateDiscountSchema.parse(await request.json());
    const cookieStore = await cookies();
    const storefrontCartId = cookieStore.get('cartId')?.value;
    const currencyCode = await resolveRequestCurrencyCode();

    if (!body.cartSnapshot && !storefrontCartId) {
      return NextResponse.json({ error: 'Your stack is empty.' }, { status: 400 });
    }

    const resolvedCurrencyCode = body.cartSnapshot?.currencyCode || currencyCode;
    const subtotalAmount = body.cartSnapshot ? getCartSnapshotSubtotal(body.cartSnapshot) : 0;

    const manualMethod = getSwellManualPaymentMethod();
    const swellShipping = toSwellAddress({
      ...body.shippingAddress,
      email: body.shippingAddress.email,
      phone: body.shippingAddress.phone,
    });
    const swellBilling = { ...swellShipping, method: manualMethod };

    const account = await upsertSwellGuestAccount({
      email: body.shippingAddress.email,
      firstName: body.shippingAddress.firstName,
      lastName: body.shippingAddress.lastName,
      phone: body.shippingAddress.phone,
      shipping: swellShipping,
      billing: swellBilling,
    });

    const swellCart = await createSwellCheckoutCart({
      accountId: account.id,
      storefrontCartId,
      storefrontCartSnapshot: toStorefrontCartSnapshot(body.cartSnapshot),
      currencyCode: resolvedCurrencyCode,
      shipping: swellShipping,
      billing: swellBilling,
      couponCode: body.discountCode,
    });

    const discountAmount = Number(swellCart.discount_total ?? swellCart.item_discount ?? 0);

    await deleteSwellCheckoutCart(swellCart.id);

    if (discountAmount <= 0) {
      return NextResponse.json(
        { error: 'That code did not apply any discount to this order.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      valid: true,
      discountCode: body.discountCode,
      discountAmount: {
        amount: discountAmount.toFixed(2),
        currencyCode: resolvedCurrencyCode,
      },
      subtotalAmount: {
        amount: subtotalAmount.toFixed(2),
        currencyCode: resolvedCurrencyCode,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Please enter a discount code and complete the shipping form.' },
        { status: 400 }
      );
    }

    if (error instanceof Error && /coupon|discount|promotion|coupon_code/i.test(error.message)) {
      return NextResponse.json(
        { error: 'That discount code is invalid or has expired.' },
        { status: 400 }
      );
    }

    if (error instanceof Error && /AUTHENTICATION|\b401\b/i.test(error.message)) {
      console.error('Swell authentication failure during discount validation:', error);
      return NextResponse.json(
        { error: 'Unable to validate the discount code right now. Please try again later.' },
        { status: 503 }
      );
    }

    console.error('Unable to validate discount code:', error);
    return NextResponse.json(
      { error: 'That discount code is invalid or could not be verified.' },
      { status: 400 }
    );
  }
}
