import { apiError } from '@/lib/api/errors';
import { calculateCheckoutPricing } from '@/lib/checkout/pricing';
import {
  buildQuoteResponse,
  findCheckoutShippingService,
  getCartSnapshotItemCount,
  getCartSnapshotSubtotal,
  getShipEngineCheckoutServices,
  applyShipmentProtectionToServices,
  applyAvailableShipmentProtectionToServices,
  mapSwellRatedServices,
  type CheckoutRatedService,
} from '@/lib/checkout/shipping-rates';
import {
  createSwellCheckoutCart,
  deleteSwellCheckoutCart,
  findSwellCouponCodeByCode,
  getSwellCoupon,
  getSwellManualPaymentMethod,
  toSwellAddress,
  updateSwellCheckoutCart,
  upsertSwellGuestAccount,
} from '@/lib/checkout/swell-order-management';
import type { CheckoutShippingAddress } from '@/lib/checkout/types';
import { getShipEngineMissingConfig, isShipEngineConfigured } from '@/lib/checkout/shipengine';
import { getShippoMissingConfig, isShippoConfigured } from '@/lib/checkout/shippo';
import { applyZonosLandedCostToServices } from '@/lib/checkout/zonos';

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
  paymentMethod?: 'card' | 'crypto' | 'interac' | null;
  selectedShippingServiceId?: string | null;
  shipmentProtection?: boolean;
};

function normalizeCheckoutPaymentMethod(
  paymentMethod?: CheckoutQuoteInput['paymentMethod'],
): 'card' | 'crypto' | 'interac' {
  if (paymentMethod === 'crypto') return 'crypto';
  if (paymentMethod === 'interac') return 'interac';
  return 'card';
}

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

async function getSwellCouponDiscountRate(code?: string | null) {
  if (!code) {
    return undefined;
  }

  try {
    const couponCode = await findSwellCouponCodeByCode(code);
    if (!couponCode?.parent_id) {
      return undefined;
    }

    const coupon = await getSwellCoupon(couponCode.parent_id);
    if (coupon.active === false) {
      return undefined;
    }

    const percentageDiscount = (coupon.discounts || []).find(discount =>
      discount.value_type === 'percent' &&
      Number.isFinite(Number(discount.value_percent)) &&
      Number(discount.value_percent) > 0
    );
    const percentValue = Number(percentageDiscount?.value_percent);

    return Number.isFinite(percentValue) && percentValue > 0
      ? percentValue / 100
      : undefined;
  } catch (error) {
    console.warn('Unable to resolve Swell coupon percentage for checkout pricing.', {
      code,
      error,
    });
    return undefined;
  }
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
    return {
      services: args.services,
    };
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

    const services = args.services.map((service) => {
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

    return {
      services,
      couponDiscountAmount: Number(
        ratedCart.discount_total ?? ratedCart.item_discount ?? 0,
      ),
      couponCode: ratedCart.coupon_code,
      currencyCode: ratedCart.currency,
    };
  } catch {
    return {
      services: args.services,
    };
  }
}

export async function buildCheckoutQuote(args: CheckoutQuoteInput) {
  const currencyCode = args.cartSnapshot.currencyCode;
  const subtotalAmount = getCartSnapshotSubtotal(args.cartSnapshot);
  const itemCount = getCartSnapshotItemCount(args.cartSnapshot);
  let liveShippingErrorMessage: string | null = null;
  let swellCartId: string | null = null;

  try {
    let preferredServices: CheckoutRatedService[] = [];

    try {
      const liveShippingServices = await getShipEngineCheckoutServices({
        shippingAddress: args.shippingAddress,
        currencyCode,
        subtotalAmount,
        itemCount,
        shipmentProtection: args.shipmentProtection,
      });

      if (liveShippingServices.length > 0) {
        preferredServices = liveShippingServices;
      }
    } catch (liveShippingError) {
      liveShippingErrorMessage =
        liveShippingError instanceof Error
          ? liveShippingError.message
          : 'Unable to validate the shipping address.';
      console.error(
        'Unable to fetch live shipping rates, falling back to Swell:',
        liveShippingError,
      );
    }

    const paymentMethod = normalizeCheckoutPaymentMethod(args.paymentMethod);
    const manualMethod = getSwellManualPaymentMethod(paymentMethod);
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
    const pricing = calculateCheckoutPricing({
      currencyCode: swellCart.currency || currencyCode,
      subtotalAmount,
      couponDiscountAmount,
      couponCode: args.discountCode || swellCart.coupon_code,
      paymentMethod,
    });

    const fallbackServicesWithProtectionQuote = applyAvailableShipmentProtectionToServices({
      services: mapSwellRatedServices(
        swellCart.shipment_rating?.services || [],
        swellCart.currency || currencyCode,
      ),
      subtotalAmount,
      currencyCode: swellCart.currency || currencyCode,
    });
    const fallbackServices = applyShipmentProtectionToServices({
      services: fallbackServicesWithProtectionQuote,
      shipmentProtection: args.shipmentProtection,
      subtotalAmount,
      currencyCode: swellCart.currency || currencyCode,
    });

    const quote = buildQuoteResponse({
      currencyCode: swellCart.currency || currencyCode,
      subtotalAmount,
      discountAmount: pricing.discountTotalValue,
      discountCode: args.discountCode || swellCart.coupon_code,
      discounts: pricing.discounts,
      paymentMethod,
      services:
        preferredServices.length > 0 || isShippoConfigured()
          ? preferredServices
          : fallbackServices,
    });

    const preservedSelection = args.selectedShippingServiceId
      ? findCheckoutShippingService(quote.services, args.selectedShippingServiceId)
      : null;
    if (preservedSelection) {
      quote.selectedServiceId = preservedSelection.id;
    }

    const selectedRating = await estimateTaxForSelectedService({
      cartId: swellCart.id,
      services: quote.services,
      selectedServiceId: quote.selectedServiceId,
      shipping: swellShipping,
      billing: swellBilling,
      couponCode: args.discountCode || swellCart.coupon_code,
    });
    quote.services = selectedRating.services;

    quote.services = await applyZonosLandedCostToServices({
      shippingAddress: args.shippingAddress,
      cartSnapshot: args.cartSnapshot,
      services: quote.services,
      currencyCode: selectedRating.currencyCode || swellCart.currency || currencyCode,
    });

    const resolvedCouponDiscountAmount =
      selectedRating.couponDiscountAmount ?? couponDiscountAmount;
    const resolvedCouponCode =
      args.discountCode || selectedRating.couponCode || swellCart.coupon_code;
    const resolvedCouponDiscountRate = await getSwellCouponDiscountRate(resolvedCouponCode);

    if (args.discountCode && resolvedCouponDiscountAmount <= 0) {
      throw apiError.badRequest('That discount code is invalid or has expired.');
    }

    const selectedServiceForPricing =
      findCheckoutShippingService(quote.services, quote.selectedServiceId) ||
      quote.services[0] ||
      null;

    const resolvedPricing = calculateCheckoutPricing({
      currencyCode: selectedRating.currencyCode || swellCart.currency || currencyCode,
      subtotalAmount,
      couponDiscountAmount: resolvedCouponDiscountAmount,
      couponDiscountRate: resolvedCouponDiscountRate,
      couponCode: resolvedCouponCode,
      shippingAmount: selectedServiceForPricing?.price.amount,
      shipmentProtectionAmount: selectedServiceForPricing?.shipmentProtection?.totalAmount.amount,
      taxAmount: selectedServiceForPricing?.taxAmount?.amount,
      landedCostAmount: selectedServiceForPricing?.landedCostAmount?.amount,
      paymentMethod,
    });

    quote.discountAmount = {
      amount: resolvedPricing.discountTotalValue.toFixed(2),
      currencyCode: selectedRating.currencyCode || swellCart.currency || currencyCode,
    };
    quote.discountCode = resolvedCouponCode;
    quote.discounts = resolvedPricing.discounts;

    if (quote.services.length === 0) {
      const rawRatingErrors = swellCart.shipment_rating?.errors;
      const ratingErrors = Array.isArray(rawRatingErrors)
        ? rawRatingErrors
            .map((error) => error.message?.trim())
            .filter((message): message is string => Boolean(message))
        : [];
      const hasShipmentRating = Boolean(swellCart.shipment_rating);
      const hasLiveShippingFallback =
        isShippoConfigured() || isShipEngineConfigured();

      console.error('No shipping services available for checkout quote.', {
        cartId: swellCart.id,
        country: swellShipping.country,
        state: swellShipping.state,
        hasShipmentRating,
        ratingErrors,
        hasLiveShippingFallback,
      });

      if (!hasShipmentRating && !hasLiveShippingFallback) {
        const missingLiveConfig = [
          ...getShippoMissingConfig(),
          ...getShipEngineMissingConfig(),
        ];
        throw apiError.providerUnavailable(
          missingLiveConfig.length > 0
            ? `Shipping quotes are unavailable because Swell returned no rates and live shipping is missing: ${missingLiveConfig.join(', ')}.`
            : 'Shipping quotes are unavailable because no shipping provider is configured. Configure Swell shipping services or complete the live shipping settings.',
          { provider: 'shipping' },
          false,
        );
      }

      if (liveShippingErrorMessage) {
        throw apiError.badRequest(liveShippingErrorMessage);
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
