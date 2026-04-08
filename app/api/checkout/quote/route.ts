import { z } from 'zod';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getCart } from '@/lib/swell/swell';
import { resolveRequestCurrencyCode } from '@/lib/swell/currency';
import {
  createSwellCheckoutCart,
  deleteSwellCheckoutCart,
  toSwellAddress,
  updateSwellCheckoutCart,
  upsertSwellGuestAccount,
} from '@/lib/checkout/swell-order-management';
import { getSwellManualPaymentMethod } from '@/lib/checkout/swell-order-management';
import { getShipEngineMissingConfig, isShipEngineConfigured } from '@/lib/checkout/shipengine';
import {
  buildQuoteResponse,
  getCartSnapshotItemCount,
  getCartSnapshotSubtotal,
  getShipEngineCheckoutServices,
  getStorefrontCartItemCount,
  getStorefrontCartSubtotal,
  mapSwellRatedServices,
  type CheckoutRatedService,
} from '@/lib/checkout/shipping-rates';
import { calculateCheckoutPricing } from '@/lib/checkout/pricing';

const countryCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Invalid country code');

const shippingSchema = z.object({
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

const moneySchema = z.object({
  amount: z.string(),
  currencyCode: z.string(),
});

const cartSnapshotSchema = z.object({
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
        selectedOptions: z.array(
          z.object({
            name: z.string(),
            value: z.string(),
          })
        ),
        quantity: z.number().int().positive(),
        unitPrice: moneySchema,
        lineTotal: moneySchema,
      })
    )
    .min(1),
});

const quoteRequestSchema = shippingSchema.extend({
  cartSnapshot: cartSnapshotSchema.optional(),
  discountCode: z.string().trim().min(1).optional(),
  paymentMethod: z.enum(['card', 'crypto']).optional(),
});

async function estimateTaxForSelectedService(args: {
  cartId: string;
  services: CheckoutRatedService[];
  selectedServiceId: string;
  shipping: ReturnType<typeof toSwellAddress>;
  billing: ReturnType<typeof toSwellAddress> & { method?: string };
  couponCode?: string;
}) {
  const selectedService = args.services.find(service => service.id === args.selectedServiceId);
  if (!selectedService) {
    return args.services;
  }

  try {
    const ratedCart = await updateSwellCheckoutCart(args.cartId, {
      shipping: {
        ...args.shipping,
        service: selectedService.source === 'swell' ? selectedService.id : undefined,
        service_name: selectedService.name,
        price: Number(selectedService.price.amount || 0),
      },
      billing: args.billing,
      coupon_code: args.couponCode,
    });

    return args.services.map(service => {
      if (service.id !== selectedService.id) {
        return service;
      }

      return {
        ...service,
        taxAmount: {
          amount: Number(ratedCart.tax_total || 0).toFixed(2),
          currencyCode: ratedCart.currency || service.price.currencyCode,
        },
      } satisfies CheckoutRatedService;
    });
  } catch {
    return args.services;
  }
}

export async function POST(request: Request) {
  try {
    const body = quoteRequestSchema.parse(await request.json());
    const cookieStore = await cookies();
    const storefrontCartId = cookieStore.get('cartId')?.value;

    const currencyCode = await resolveRequestCurrencyCode();
    const storefrontCart =
      !body.cartSnapshot && storefrontCartId ? await getCart(storefrontCartId, currencyCode) : null;

    if (!body.cartSnapshot && (!storefrontCart || storefrontCart.lines.edges.length === 0)) {
      return NextResponse.json({ error: 'Your stack is empty.' }, { status: 400 });
    }

    const resolvedCurrencyCode = body.cartSnapshot?.currencyCode || storefrontCart?.cost.totalAmount.currencyCode || currencyCode;
    const subtotalAmount = body.cartSnapshot
      ? getCartSnapshotSubtotal(body.cartSnapshot)
      : getStorefrontCartSubtotal(storefrontCart);
    const itemCount = body.cartSnapshot
      ? getCartSnapshotItemCount(body.cartSnapshot)
      : getStorefrontCartItemCount(storefrontCart);
    let shipEngineErrorMessage: string | null = null;

    let preferredServices: CheckoutRatedService[] = [];

    if (!body.discountCode) {
      try {
        const shipEngineServices = await getShipEngineCheckoutServices({
          shippingAddress: body,
          currencyCode: resolvedCurrencyCode,
          subtotalAmount,
          itemCount,
        });

        if (shipEngineServices.length > 0) {
          preferredServices = shipEngineServices;
        }
      } catch (shipEngineError) {
        shipEngineErrorMessage = shipEngineError instanceof Error ? shipEngineError.message : 'Unable to validate the shipping address.';
        console.error('Unable to fetch ShipEngine rates, falling back to Swell:', shipEngineError);
      }
    }

    const manualMethod = getSwellManualPaymentMethod();
    const swellShipping = toSwellAddress({
      ...body,
      email: body.email,
      phone: body.phone,
    });
    const swellBilling = {
      ...swellShipping,
      method: manualMethod,
    };

    const account = await upsertSwellGuestAccount({
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      shipping: swellShipping,
      billing: swellBilling,
    });

    const swellCart = await createSwellCheckoutCart({
      accountId: account.id,
      storefrontCartId,
      storefrontCartSnapshot: body.cartSnapshot
        ? {
            currencyCode: body.cartSnapshot.currencyCode,
            lines: body.cartSnapshot.lines.map(line => ({
              merchandiseId: line.merchandiseId,
              productHandle: line.productHandle,
              quantity: line.quantity,
            })),
          }
        : undefined,
      currencyCode: body.cartSnapshot?.currencyCode || currencyCode,
      shipping: swellShipping,
      billing: swellBilling,
      comments: body.notes,
      couponCode: body.discountCode,
    });
    const couponDiscountAmount = Number(swellCart.discount_total ?? swellCart.item_discount ?? 0);
    const pricing = calculateCheckoutPricing({
      currencyCode: swellCart.currency || resolvedCurrencyCode,
      subtotalAmount,
      couponDiscountAmount,
      couponCode: body.discountCode || swellCart.coupon_code,
      paymentMethod: body.paymentMethod === 'crypto' ? 'crypto' : 'card',
    });

    const fallbackServices = mapSwellRatedServices(
      swellCart.shipment_rating?.services || [],
      swellCart.currency || resolvedCurrencyCode
    );

    const quote = buildQuoteResponse({
      currencyCode: swellCart.currency || resolvedCurrencyCode,
      subtotalAmount,
      discountAmount: pricing.discountTotalValue,
      discountCode: body.discountCode || swellCart.coupon_code,
      discounts: pricing.discounts,
      paymentMethod: body.paymentMethod === 'crypto' ? 'crypto' : 'card',
      services: preferredServices.length > 0 ? preferredServices : fallbackServices,
    });

    quote.services = await estimateTaxForSelectedService({
      cartId: swellCart.id,
      services: quote.services,
      selectedServiceId: quote.selectedServiceId,
      shipping: swellShipping,
      billing: swellBilling,
      couponCode: body.discountCode || swellCart.coupon_code,
    });

    await deleteSwellCheckoutCart(swellCart.id);

    if (quote.services.length === 0) {
      const rawRatingErrors = swellCart.shipment_rating?.errors;
      const ratingErrors = Array.isArray(rawRatingErrors)
        ? rawRatingErrors
            .map(error => error.message?.trim())
            .filter((message): message is string => Boolean(message))
        : [];
      const hasShipmentRating = Boolean(swellCart.shipment_rating);
      const hasShipEngineFallback = isShipEngineConfigured();

      console.error('No shipping services available for checkout quote.', {
        cartId: swellCart.id,
        country: swellShipping.country,
        state: swellShipping.state,
        hasShipmentRating,
        ratingErrors,
        hasShipEngineFallback,
      });

      if (!hasShipmentRating && !hasShipEngineFallback) {
        const missingShipEngineConfig = getShipEngineMissingConfig();
        return NextResponse.json(
          {
            error:
              missingShipEngineConfig.length > 0
                ? `Shipping quotes are unavailable because Swell returned no rates and ShipEngine is missing: ${missingShipEngineConfig.join(', ')}.`
                : 'Shipping quotes are unavailable because no shipping provider is configured. Configure Swell shipping services or complete the ShipEngine fallback settings.',
          },
          { status: 503 }
        );
      }

      if (shipEngineErrorMessage) {
        return NextResponse.json(
          {
            error: shipEngineErrorMessage,
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          error:
            ratingErrors[0] ||
            'No shipping services were returned by Swell for this address. Check Swell shipping settings for the selected region.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ quote });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Complete the shipping form before requesting rates.' }, { status: 400 });
    }

    if (error instanceof Error && /coupon|discount|promotion/i.test(error.message)) {
      return NextResponse.json({ error: 'That discount code is invalid or has expired.' }, { status: 400 });
    }

    console.error('Unable to fetch Swell shipping rates:', error);
    return NextResponse.json(
      {
        error: 'Unable to fetch shipping options right now. Check Swell backend access and shipping configuration.',
      },
      { status: 500 }
    );
  }
}
