import { apiError } from '@/lib/api/errors';
import { calculateCheckoutPricing } from '@/lib/checkout/pricing';
import {
  buildQuoteResponse,
  findCheckoutShippingService,
  getCartSnapshotItemCount,
  getCartSnapshotSubtotal,
  getShipEngineCheckoutServices,
  mapSwellRatedServices,
  type CheckoutRatedService,
} from '@/lib/checkout/shipping-rates';
import {
  createSwellCheckoutCart,
  deleteSwellCheckoutCart,
  getSwellManualPaymentMethod,
  toSwellAddress,
  updateSwellCheckoutCart,
  upsertSwellGuestAccount,
} from '@/lib/checkout/swell-order-management';
import type { CheckoutShippingAddress } from '@/lib/checkout/types';
import { getShipEngineMissingConfig, isShipEngineConfigured } from '@/lib/checkout/shipengine';

type CheckoutSessionCartSnapshot = {
  currencyCode: string;
  lines: Array<{
    merchandiseId: string;
    productHandle: string;
    quantity: number;
    unitPrice?: {
      amount: string;
    };
    lineTotal?: {
      amount: string;
    };
  }>;
};

type CheckoutQuoteInput = {
  cartId?: string | null;
  cartSnapshot: CheckoutSessionCartSnapshot;
  shippingAddress: CheckoutShippingAddress;
  discountCode?: string | null;
  paymentMethod?: 'card' | 'crypto' | null;
  selectedShippingServiceId?: string | null;
};

function sanitizeCartSnapshot(cartSnapshot: CheckoutSessionCartSnapshot) {
  return {
    currencyCode: cartSnapshot.currencyCode,
    lines: cartSnapshot.lines.map((line) => ({
      merchandiseId: line.merchandiseId,
      productHandle: line.productHandle,
      quantity: line.quantity,
    })),
  };
}

async function estimateTaxForSelectedService(args: {
  cartId: string;
  services: CheckoutRatedService[];
  selectedServiceId: string;
  shipping: ReturnType<typeof toSwellAddress>;
  billing: ReturnType<typeof toSwellAddress> & { method?: string };
  couponCode?: string | null;
}) {
  const selectedService = args.services.find(
    (service) => service.id === args.selectedServiceId,
  );
  if (!selectedService) {
    return args.services;
  }

  try {
    const ratedCart = await updateSwellCheckoutCart(args.cartId, {
      shipping: {
        ...args.shipping,
        service:
          selectedService.source === 'swell' ? selectedService.id : undefined,
        service_name: selectedService.name,
        price: Number(selectedService.price.amount || 0),
      },
      billing: args.billing,
      coupon_code: args.couponCode ?? undefined,
    });

    return args.services.map((service) => {
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

export async function buildCheckoutQuote(args: CheckoutQuoteInput) {
  const currencyCode = args.cartSnapshot.currencyCode;
  const subtotalAmount = getCartSnapshotSubtotal(args.cartSnapshot);
  const itemCount = getCartSnapshotItemCount(args.cartSnapshot);
  let shipEngineErrorMessage: string | null = null;
  let swellCartId: string | null = null;

  try {
    let preferredServices: CheckoutRatedService[] = [];

    try {
      const shipEngineServices = await getShipEngineCheckoutServices({
        shippingAddress: args.shippingAddress,
        currencyCode,
        subtotalAmount,
        itemCount,
      });

      if (shipEngineServices.length > 0) {
        preferredServices = shipEngineServices;
      }
    } catch (shipEngineError) {
      shipEngineErrorMessage =
        shipEngineError instanceof Error
          ? shipEngineError.message
          : 'Unable to validate the shipping address.';
      console.error(
        'Unable to fetch ShipEngine rates, falling back to Swell:',
        shipEngineError,
      );
    }

    const manualMethod = getSwellManualPaymentMethod();
    const swellShipping = toSwellAddress({
      ...args.shippingAddress,
      email: args.shippingAddress.email,
      phone: args.shippingAddress.phone,
    });
    const swellBilling = {
      ...swellShipping,
      method: manualMethod,
    };

    const account = await upsertSwellGuestAccount({
      email: args.shippingAddress.email,
      firstName: args.shippingAddress.firstName,
      lastName: args.shippingAddress.lastName,
      phone: args.shippingAddress.phone,
      shipping: swellShipping,
      billing: swellBilling,
    });

    const swellCart = await createSwellCheckoutCart({
      accountId: account.id,
      storefrontCartId: args.cartId ?? undefined,
      storefrontCartSnapshot: sanitizeCartSnapshot(args.cartSnapshot),
      currencyCode,
      shipping: swellShipping,
      billing: swellBilling,
      comments: args.shippingAddress.notes,
      couponCode: args.discountCode ?? undefined,
    });
    swellCartId = swellCart.id;

    const couponDiscountAmount = Number(
      swellCart.discount_total ?? swellCart.item_discount ?? 0,
    );
    if (args.discountCode && couponDiscountAmount <= 0) {
      throw apiError.badRequest('That discount code is invalid or has expired.');
    }
    const pricing = calculateCheckoutPricing({
      currencyCode: swellCart.currency || currencyCode,
      subtotalAmount,
      couponDiscountAmount,
      couponCode: args.discountCode || swellCart.coupon_code,
      paymentMethod: args.paymentMethod === 'crypto' ? 'crypto' : 'card',
    });

    const fallbackServices = mapSwellRatedServices(
      swellCart.shipment_rating?.services || [],
      swellCart.currency || currencyCode,
    );

    const quote = buildQuoteResponse({
      currencyCode: swellCart.currency || currencyCode,
      subtotalAmount,
      discountAmount: pricing.discountTotalValue,
      discountCode: args.discountCode || swellCart.coupon_code,
      discounts: pricing.discounts,
      paymentMethod: args.paymentMethod === 'crypto' ? 'crypto' : 'card',
      services:
        preferredServices.length > 0 ? preferredServices : fallbackServices,
    });

    const preservedSelection = args.selectedShippingServiceId
      ? findCheckoutShippingService(quote.services, args.selectedShippingServiceId)
      : null;
    if (preservedSelection) {
      quote.selectedServiceId = preservedSelection.id;
    }

    quote.services = await estimateTaxForSelectedService({
      cartId: swellCart.id,
      services: quote.services,
      selectedServiceId: quote.selectedServiceId,
      shipping: swellShipping,
      billing: swellBilling,
      couponCode: args.discountCode || swellCart.coupon_code,
    });

    if (quote.services.length === 0) {
      const rawRatingErrors = swellCart.shipment_rating?.errors;
      const ratingErrors = Array.isArray(rawRatingErrors)
        ? rawRatingErrors
            .map((error) => error.message?.trim())
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
        throw apiError.providerUnavailable(
          missingShipEngineConfig.length > 0
            ? `Shipping quotes are unavailable because Swell returned no rates and ShipEngine is missing: ${missingShipEngineConfig.join(', ')}.`
            : 'Shipping quotes are unavailable because no shipping provider is configured. Configure Swell shipping services or complete the ShipEngine fallback settings.',
          { provider: 'shipping' },
          false,
        );
      }

      if (shipEngineErrorMessage) {
        throw apiError.badRequest(shipEngineErrorMessage);
      }

      throw apiError.badRequest(
        ratingErrors[0] ||
          'No shipping services were returned for this address. Check the configured shipping regions and retry.',
      );
    }

    return quote;
  } catch (error) {
    if (
      error instanceof Error &&
      /coupon|discount|promotion/i.test(error.message)
    ) {
      throw apiError.badRequest('That discount code is invalid or has expired.');
    }

    throw error;
  } finally {
    if (swellCartId) {
      await deleteSwellCheckoutCart(swellCartId).catch((cleanupError) => {
        console.error('Unable to delete temporary Swell checkout cart:', cleanupError);
      });
    }
  }
}
