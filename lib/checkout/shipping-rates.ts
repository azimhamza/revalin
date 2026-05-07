import {
  COMPLIMENTARY_SHIPPING_ENABLED,
  getFreeShippingThresholdForCurrency,
} from '@/lib/checkout/constants';
import { getShippoFulfillmentSettings } from '@/lib/checkout/shippo-fulfillment-settings';
import { quoteShipEngineRates, type ShipEngineCheckoutRate } from '@/lib/checkout/shipengine';
import {
  getShippoMissingConfig,
  isShippoConfigured,
  quoteShippoRates,
  type ShippoCheckoutRate,
  type ShippoInsuranceRequest,
} from '@/lib/checkout/shippo';
import type {
  CheckoutAppliedDiscount,
  CheckoutLandedCost,
  CheckoutShipmentProtection,
  CheckoutShippingAddress,
} from '@/lib/checkout/types';
import type { StorefrontCartSnapshot, SwellShipmentService } from '@/lib/checkout/swell-order-management';

export type CheckoutRatedService = {
  id: string;
  name: string;
  quoteCategory?: 'cheapest' | 'best_value' | 'fastest';
  carrier?: string;
  carrierCode?: string;
  serviceCode?: string;
  shipengineRateId?: string;
  shippoRateId?: string;
  shippoShipmentId?: string;
  shippoCarrierAccountId?: string;
  carrierPreferenceRank?: number;
  pickup?: boolean;
  estimatedDays?: number | null;
  estimatedDeliveryDate?: string | null;
  source: 'shipengine' | 'shippo' | 'swell' | 'manual';
  price: {
    amount: string;
    currencyCode: string;
  };
  originalPrice?: {
    amount: string;
    currencyCode: string;
  };
  taxAmount?: {
    amount: string;
    currencyCode: string;
  };
  landedCostAmount?: {
    amount: string;
    currencyCode: string;
  };
  landedCost?: CheckoutLandedCost;
  shippoIncludedInsurancePrice?: {
    amount: string;
    currencyCode: string;
  };
  availableShipmentProtection?: CheckoutShipmentProtection;
  shipmentProtection?: CheckoutShipmentProtection;
};

function toFixedAmount(amount: number) {
  return Number(amount || 0).toFixed(2);
}

const US_SHIPENGINE_PREFERRED_CARRIER_PATTERNS = (
  process.env.SHIPENGINE_US_PREFERRED_CARRIERS || 'fedex,dhl'
)
  .split(',')
  .map(value => value.trim().toLowerCase())
  .filter(Boolean);

const SHIPENGINE_US_REQUIRE_PREFERRED_CARRIERS =
  process.env.SHIPENGINE_US_REQUIRE_PREFERRED_CARRIERS === 'true';

const SHIPPO_CHECKOUT_SHIPPING_MARKUP_AMOUNT = Number(
  process.env.SHIPPO_CHECKOUT_SHIPPING_MARKUP_AMOUNT || 3
);
const SHIPPO_FALLBACK_TO_SHIPENGINE_ON_NO_RATES =
  process.env.SHIPPO_FALLBACK_TO_SHIPENGINE_ON_NO_RATES === 'true';
const SHIPMENT_PROTECTION_FEE_AMOUNT = Number(
  process.env.CHECKOUT_SHIPMENT_PROTECTION_FEE_AMOUNT || 5
);
const SHIPPO_INSURANCE_CONTENT = (
  process.env.SHIPPO_INSURANCE_CONTENT || 'laboratory supplies'
).trim() || 'laboratory supplies';
const SHIPPO_INSURANCE_MAX_VALUE_AMOUNT = Number(
  process.env.SHIPPO_INSURANCE_MAX_VALUE_AMOUNT || 10000
);

function getCheckoutShippingMarkupAmount() {
  return Number.isFinite(SHIPPO_CHECKOUT_SHIPPING_MARKUP_AMOUNT) &&
    SHIPPO_CHECKOUT_SHIPPING_MARKUP_AMOUNT > 0
    ? SHIPPO_CHECKOUT_SHIPPING_MARKUP_AMOUNT
    : 0;
}

function getShipmentProtectionFeeAmount() {
  return Number.isFinite(SHIPMENT_PROTECTION_FEE_AMOUNT) &&
    SHIPMENT_PROTECTION_FEE_AMOUNT > 0
    ? SHIPMENT_PROTECTION_FEE_AMOUNT
    : 5;
}

function getShippoInsuranceMaxValueAmount() {
  return Number.isFinite(SHIPPO_INSURANCE_MAX_VALUE_AMOUNT) &&
    SHIPPO_INSURANCE_MAX_VALUE_AMOUNT > 0
    ? SHIPPO_INSURANCE_MAX_VALUE_AMOUNT
    : 10000;
}

function toMoney(amount: number, currencyCode: string) {
  return {
    amount: toFixedAmount(amount),
    currencyCode,
  };
}

export function buildShippoInsuranceRequest(args: {
  subtotalAmount: number;
  currencyCode: string;
}): ShippoInsuranceRequest | null {
  const insuredValue = Math.min(
    Math.max(Number(args.subtotalAmount || 0), 0.01),
    getShippoInsuranceMaxValueAmount(),
  );

  if (!Number.isFinite(insuredValue) || insuredValue <= 0) {
    return null;
  }

  return {
    amount: toFixedAmount(insuredValue),
    currency: args.currencyCode,
    content: SHIPPO_INSURANCE_CONTENT,
  };
}

export function buildShipmentProtectionQuote(args: {
  subtotalAmount: number;
  currencyCode: string;
  shippoInsuranceAmount?: number;
}): CheckoutShipmentProtection {
  const shippoInsuranceValue = Math.max(0, Number(args.shippoInsuranceAmount || 0));
  const normalizedShippoInsuranceValue =
    Number.isFinite(shippoInsuranceValue) ? shippoInsuranceValue : 0;
  const feeValue = getShipmentProtectionFeeAmount();
  const totalValue = normalizedShippoInsuranceValue + feeValue;

  return {
    selected: true,
    provider: normalizedShippoInsuranceValue > 0 ? 'shippo_xcover' : 'revalin',
    content: SHIPPO_INSURANCE_CONTENT,
    insuredValueAmount: toMoney(
      Math.min(Math.max(Number(args.subtotalAmount || 0), 0.01), getShippoInsuranceMaxValueAmount()),
      args.currencyCode,
    ),
    feeAmount: toMoney(feeValue, args.currencyCode),
    shippoInsuranceAmount:
      normalizedShippoInsuranceValue > 0
        ? toMoney(normalizedShippoInsuranceValue, args.currencyCode)
        : undefined,
    totalAmount: toMoney(totalValue, args.currencyCode),
    shippoInsuranceIncluded: normalizedShippoInsuranceValue > 0,
  };
}

export function applyShipmentProtectionToServices(args: {
  services: CheckoutRatedService[];
  shipmentProtection?: boolean;
  subtotalAmount: number;
  currencyCode: string;
}) {
  if (!args.shipmentProtection) {
    return args.services;
  }

  return args.services.map(service => ({
    ...service,
    shipmentProtection:
      service.availableShipmentProtection ||
      buildShipmentProtectionQuote({
        subtotalAmount: args.subtotalAmount,
        currencyCode: service.price.currencyCode || args.currencyCode,
        shippoInsuranceAmount: Number(service.shippoIncludedInsurancePrice?.amount || 0),
      }),
  }));
}

export function applyAvailableShipmentProtectionToServices(args: {
  services: CheckoutRatedService[];
  subtotalAmount: number;
  currencyCode: string;
}) {
  return args.services.map(service => ({
    ...service,
    availableShipmentProtection:
      service.availableShipmentProtection ||
      buildShipmentProtectionQuote({
        subtotalAmount: args.subtotalAmount,
        currencyCode: service.price.currencyCode || args.currencyCode,
        shippoInsuranceAmount: Number(service.shippoIncludedInsurancePrice?.amount || 0),
      }),
  }));
}

export function isUpsShippoCarrier(args: {
  carrier?: string;
  carrierCode?: string;
  name?: string;
  serviceCode?: string;
}) {
  const carrierIdentity = [
    args.carrier,
    args.carrierCode,
    args.name,
    args.serviceCode,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return /\bups\b|united\s*parcel/.test(carrierIdentity);
}

export function filterShippoRatesForDestination<T extends {
  carrier?: string;
  carrierCode?: string;
  name?: string;
  serviceCode?: string;
}>(args: {
  services: T[];
  shippingAddress: CheckoutShippingAddress;
}) {
  if (isUsShippingAddress(args.shippingAddress)) {
    return args.services.filter(service => isUpsShippoCarrier(service));
  }

  return args.services;
}

function sortServicesByPrice<T extends CheckoutRatedService>(services: T[]) {
  return [...services].sort((left, right) => Number(left.price.amount) - Number(right.price.amount));
}

function sortServicesByPreference<T extends CheckoutRatedService>(services: T[]) {
  return [...services].sort((left, right) => {
    const leftRank = left.carrierPreferenceRank ?? Number.POSITIVE_INFINITY;
    const rightRank = right.carrierPreferenceRank ?? Number.POSITIVE_INFINITY;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return Number(left.price.amount) - Number(right.price.amount);
  });
}

function getComparableEstimatedDays(service: CheckoutRatedService) {
  if (typeof service.estimatedDays === 'number' && Number.isFinite(service.estimatedDays) && service.estimatedDays > 0) {
    return service.estimatedDays;
  }

  const normalizedName = `${service.carrier || ''} ${service.name}`.toLowerCase();

  if (/(same day|same-day|sameday|overnight|next day|next-day|nextday)/.test(normalizedName)) {
    return 1;
  }

  if (/(2 day|2-day|two day|express|priority|expedited|xpresspost)/.test(normalizedName)) {
    return 2;
  }

  if (/(standard|ground|economy|regular|tracked packet|parcel)/.test(normalizedName)) {
    return 5;
  }

  return Number.POSITIVE_INFINITY;
}

function curateCheckoutServices(services: CheckoutRatedService[]) {
  const sortedByPrice = sortServicesByPrice(services);
  if (sortedByPrice.length === 0) {
    return sortedByPrice;
  }

  const sortedBySpeed = [...sortedByPrice].sort((left, right) => {
    const speedDifference = getComparableEstimatedDays(left) - getComparableEstimatedDays(right);
    if (speedDifference !== 0) return speedDifference;
    return Number(left.price.amount) - Number(right.price.amount);
  });

  const priceRanks = new Map(sortedByPrice.map((service, index) => [service.id, index]));
  const speedRanks = new Map(sortedBySpeed.map((service, index) => [service.id, index]));
  const selectedIds = new Set<string>();
  const curated: CheckoutRatedService[] = [];

  const pushService = (
    service: CheckoutRatedService | undefined,
    quoteCategory: CheckoutRatedService['quoteCategory']
  ) => {
    if (!service || selectedIds.has(service.id)) return;

    selectedIds.add(service.id);
    curated.push({
      ...service,
      quoteCategory,
    });
  };

  const cheapest = sortedByPrice[0];
  const fastest = sortedBySpeed.find(service => service.id !== cheapest?.id) || sortedBySpeed[0];
  const bestValue = sortedByPrice
    .filter(service => service.id !== cheapest?.id && service.id !== fastest?.id)
    .sort((left, right) => {
      const leftScore = (priceRanks.get(left.id) ?? sortedByPrice.length) + (speedRanks.get(left.id) ?? sortedByPrice.length);
      const rightScore = (priceRanks.get(right.id) ?? sortedByPrice.length) + (speedRanks.get(right.id) ?? sortedByPrice.length);

      if (leftScore !== rightScore) return leftScore - rightScore;
      return Number(left.price.amount) - Number(right.price.amount);
    })[0];
  const fallbackBestValue = sortedByPrice.find(service =>
    service.id !== cheapest?.id && service.id !== fastest?.id
  );

  pushService(cheapest, 'cheapest');
  pushService(bestValue || fallbackBestValue, 'best_value');
  pushService(fastest, fastest?.id === cheapest?.id ? 'cheapest' : 'fastest');

  for (const service of sortedByPrice) {
    if (curated.length >= 3) break;
    pushService(service, undefined);
  }

  return curated;
}

function getCustomerFacingShippingName(category: CheckoutRatedService['quoteCategory'], index: number) {
  if (category === 'cheapest') return 'Standard Shipping';
  if (category === 'best_value') return 'Priority Shipping';
  if (category === 'fastest') return 'Express Shipping';
  return `Shipping Option ${index + 1}`;
}

export function toCustomerFacingCheckoutServices(
  services: CheckoutRatedService[],
): CheckoutRatedService[] {
  return services.map((service, index) => ({
    ...service,
    name: getCustomerFacingShippingName(service.quoteCategory, index),
    carrier: undefined,
  }));
}

function isEligibleForComplimentaryShipping(subtotalAmount: number, currencyCode: string) {
  return (
    COMPLIMENTARY_SHIPPING_ENABLED &&
    subtotalAmount >= getFreeShippingThresholdForCurrency(currencyCode)
  );
}

export function applyFreeShipping(services: CheckoutRatedService[], subtotalAmount: number, currencyCode: string) {
  if (services.length === 0) {
    return services;
  }

  if (!isEligibleForComplimentaryShipping(subtotalAmount, currencyCode)) {
    return services;
  }

  return services.map(service => ({
    ...service,
    originalPrice: service.originalPrice || service.price,
    price: {
      amount: '0.00',
      currencyCode: service.price.currencyCode || currencyCode,
    },
  }));
}

export function applyCustomerShippingMarkup(services: CheckoutRatedService[]) {
  const markupAmount = getCheckoutShippingMarkupAmount();
  if (markupAmount <= 0 || services.length === 0) {
    return services;
  }

  return services.map(service => ({
    ...service,
    price: {
      amount: toFixedAmount(Number(service.price.amount || 0) + markupAmount),
      currencyCode: service.price.currencyCode,
    },
  }));
}

export function selectCheckoutShippingService(services: CheckoutRatedService[]) {
  return sortServicesByPreference(services)[0] || null;
}

export function findCheckoutShippingService(services: CheckoutRatedService[], selectedShippingServiceId: string) {
  return (
    services.find(service => service.id === selectedShippingServiceId) ||
    services.find(service => service.name === selectedShippingServiceId) ||
    null
  );
}

function isUsShippingAddress(shippingAddress: CheckoutShippingAddress) {
  return shippingAddress.country.trim().toUpperCase() === 'US';
}

function isCanadaShippingAddress(shippingAddress: CheckoutShippingAddress) {
  return shippingAddress.country.trim().toUpperCase() === 'CA';
}

function getShippoCarrierPreferenceRank(args: {
  shippingAddress: CheckoutShippingAddress;
  carrier?: string;
  carrierCode?: string;
}) {
  const carrierIdentity = `${args.carrier || ''} ${args.carrierCode || ''}`.toLowerCase();

  if (isUsShippingAddress(args.shippingAddress) && /\bups\b|united parcel/.test(carrierIdentity)) {
    return 0;
  }

  if (
    isCanadaShippingAddress(args.shippingAddress) &&
    (/canada\s*post/.test(carrierIdentity) || /\bcapost\b/.test(carrierIdentity))
  ) {
    return 0;
  }

  return undefined;
}

function isPreferredUsShipEngineCarrier(service: ShipEngineCheckoutRate) {
  const carrierIdentity = [
    service.carrier,
    service.carrierCode,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return US_SHIPENGINE_PREFERRED_CARRIER_PATTERNS.some(pattern =>
    carrierIdentity.includes(pattern)
  );
}

function applyUsShipEngineCarrierPreference(args: {
  shippingAddress: CheckoutShippingAddress;
  services: ShipEngineCheckoutRate[];
}) {
  if (!isUsShippingAddress(args.shippingAddress) || args.services.length === 0) {
    return args.services;
  }

  const preferredServices = args.services.filter(isPreferredUsShipEngineCarrier);
  if (preferredServices.length > 0) {
    return preferredServices;
  }

  if (SHIPENGINE_US_REQUIRE_PREFERRED_CARRIERS) {
    console.warn(
      'ShipEngine returned no preferred US carrier rates and the preferred carrier requirement is enabled.',
      {
        preferredCarriers: US_SHIPENGINE_PREFERRED_CARRIER_PATTERNS,
        returnedCarriers: Array.from(
          new Set(args.services.map(service => service.carrier || service.carrierCode || 'unknown'))
        ),
      },
    );

    return [];
  }

  console.warn(
    'ShipEngine returned no preferred US carrier rates. Falling back to all ShipEngine US rates.',
    {
      preferredCarriers: US_SHIPENGINE_PREFERRED_CARRIER_PATTERNS,
      returnedCarriers: Array.from(
        new Set(args.services.map(service => service.carrier || service.carrierCode || 'unknown'))
      ),
    },
  );

  return args.services;
}

export function buildQuoteResponse(args: {
  currencyCode: string;
  subtotalAmount: number;
  discountAmount?: number;
  discountCode?: string;
  discounts?: CheckoutAppliedDiscount[];
  paymentMethod?: 'card' | 'crypto' | 'interac' | 'square';
  services: CheckoutRatedService[];
}) {
  const services = toCustomerFacingCheckoutServices(applyFreeShipping(
    applyCustomerShippingMarkup(curateCheckoutServices(args.services)),
    args.subtotalAmount,
    args.currencyCode
  ));

  return {
    currencyCode: args.currencyCode,
    subtotalAmount: {
      amount: toFixedAmount(args.subtotalAmount),
      currencyCode: args.currencyCode,
    },
    discountAmount: {
      amount: toFixedAmount(args.discountAmount || 0),
      currencyCode: args.currencyCode,
    },
    discountCode: args.discountCode,
    discounts: args.discounts,
    paymentMethod: args.paymentMethod,
    services,
    selectedServiceId: selectCheckoutShippingService(services)?.id || '',
  };
}

export function mapSwellRatedServices(services: SwellShipmentService[], currencyCode: string): CheckoutRatedService[] {
  return services.map(service => ({
    id: service.id,
    name: service.name,
    carrier: service.carrier,
    pickup: service.pickup,
    source: 'swell',
    price: {
      amount: toFixedAmount(Number(service.price || 0)),
      currencyCode,
    },
  }));
}

function mapShipEngineRatedServices(services: ShipEngineCheckoutRate[]): CheckoutRatedService[] {
  return services.map(service => ({
    id: service.id,
    name: service.name,
    carrier: service.carrier,
    carrierCode: service.carrierCode,
    serviceCode: service.serviceCode,
    shipengineRateId: service.shipengineRateId,
    estimatedDays: service.estimatedDays,
    estimatedDeliveryDate: service.estimatedDeliveryDate,
    source: 'shipengine',
    price: {
      amount: toFixedAmount(service.price),
      currencyCode: service.currencyCode,
    },
  }));
}

function mapShippoRatedServices(args: {
  services: ShippoCheckoutRate[];
  shippingAddress: CheckoutShippingAddress;
  subtotalAmount: number;
  currencyCode: string;
  shipmentProtection?: boolean;
}): CheckoutRatedService[] {
  const services = filterShippoRatesForDestination({
    services: args.services,
    shippingAddress: args.shippingAddress,
  }).map(service => {
    const includedInsurancePrice = Math.max(0, Number(service.includedInsurancePrice || 0));
    const baseShippingPrice = Math.max(0, service.price - includedInsurancePrice);

    return {
      id: service.id,
      name: service.name,
      carrier: service.carrier,
      carrierCode: service.carrierCode,
      serviceCode: service.serviceCode,
      shippoRateId: service.shippoRateId,
      shippoShipmentId: service.shippoShipmentId,
      shippoCarrierAccountId: service.shippoCarrierAccountId,
      carrierPreferenceRank: getShippoCarrierPreferenceRank({
        shippingAddress: args.shippingAddress,
        carrier: service.carrier,
        carrierCode: service.carrierCode,
      }),
      estimatedDays: service.estimatedDays,
      estimatedDeliveryDate: null,
      source: 'shippo' as const,
      price: {
        amount: toFixedAmount(baseShippingPrice),
        currencyCode: service.currencyCode,
      },
      shippoIncludedInsurancePrice:
        includedInsurancePrice > 0
          ? toMoney(includedInsurancePrice, service.currencyCode)
          : undefined,
      availableShipmentProtection: buildShipmentProtectionQuote({
        subtotalAmount: args.subtotalAmount,
        currencyCode: service.currencyCode,
        shippoInsuranceAmount: includedInsurancePrice,
      }),
    };
  });

  const protectedServices = applyShipmentProtectionToServices({
    services,
    shipmentProtection: args.shipmentProtection,
    subtotalAmount: args.subtotalAmount,
    currencyCode: args.currencyCode,
  });

  return curateCheckoutServices(protectedServices);
}

export function getCartSnapshotItemCount(cartSnapshot?: StorefrontCartSnapshot) {
  if (!cartSnapshot) return 0;
  return cartSnapshot.lines.reduce((total, line) => total + line.quantity, 0);
}

export function getStorefrontCartItemCount(cart?: { totalQuantity?: number; lines?: { edges?: Array<unknown> } } | null) {
  return cart?.totalQuantity || cart?.lines?.edges?.length || 0;
}

export function getCartSnapshotSubtotal(cartSnapshot?: {
  lines: Array<{
    quantity: number;
    lineTotal?: {
      amount: string;
    };
    unitPrice?: {
      amount: string;
    };
  }>;
} | null) {
  if (!cartSnapshot) return 0;

  return cartSnapshot.lines.reduce((total, line) => {
    const lineAmount =
      Number(line.lineTotal?.amount || 0) || Number(line.unitPrice?.amount || 0) * Math.max(1, Number(line.quantity || 0));
    return total + lineAmount;
  }, 0);
}

export function getStorefrontCartSubtotal(cart?: { cost?: { subtotalAmount?: { amount?: string } } } | null) {
  return Number(cart?.cost?.subtotalAmount?.amount || 0);
}

async function getLegacyShipEngineCheckoutServices(args: {
  shippingAddress: CheckoutShippingAddress;
  currencyCode: string;
  subtotalAmount: number;
  itemCount: number;
  shipmentProtection?: boolean;
}) {
  const result = await quoteShipEngineRates({
    shippingAddress: args.shippingAddress,
    itemCount: args.itemCount,
    currencyCode: args.currencyCode,
    customsValueAmount: args.subtotalAmount,
  });

  if (!result || result.rates.length === 0) {
    return [];
  }

  const preferredRates = applyUsShipEngineCarrierPreference({
    shippingAddress: args.shippingAddress,
    services: result.rates,
  });

  const servicesWithProtectionQuote = applyAvailableShipmentProtectionToServices({
    services: mapShipEngineRatedServices(preferredRates),
    subtotalAmount: args.subtotalAmount,
    currencyCode: args.currencyCode,
  });

  return applyShipmentProtectionToServices({
    services: servicesWithProtectionQuote,
    shipmentProtection: args.shipmentProtection,
    subtotalAmount: args.subtotalAmount,
    currencyCode: args.currencyCode,
  });
}

export async function getShippoCheckoutServices(args: {
  shippingAddress: CheckoutShippingAddress;
  currencyCode: string;
  subtotalAmount: number;
  itemCount: number;
  orderId?: string;
  shipmentProtection?: boolean;
}) {
  const customsSettings = await getShippoFulfillmentSettings();
  const insurance = args.shipmentProtection
    ? buildShippoInsuranceRequest({
        subtotalAmount: args.subtotalAmount,
        currencyCode: args.currencyCode,
      })
    : null;
  let result: Awaited<ReturnType<typeof quoteShippoRates>>;

  try {
    result = await quoteShippoRates({
      shippingAddress: args.shippingAddress,
      itemCount: args.itemCount,
      currencyCode: args.currencyCode,
      orderId: args.orderId,
      customsSettings,
      insurance,
    });
  } catch (error) {
    if (!insurance) {
      throw error;
    }

    console.warn(
      'Shippo insurance quote failed; retrying checkout rates without Shippo insurance.',
      error,
    );
    result = await quoteShippoRates({
      shippingAddress: args.shippingAddress,
      itemCount: args.itemCount,
      currencyCode: args.currencyCode,
      orderId: args.orderId,
      customsSettings,
    });
  }

  if (!result || result.rates.length === 0) {
    return [];
  }

  return mapShippoRatedServices({
    services: result.rates,
    shippingAddress: args.shippingAddress,
    subtotalAmount: args.subtotalAmount,
    currencyCode: args.currencyCode,
    shipmentProtection: args.shipmentProtection,
  });
}

export async function getLiveCheckoutShippingServices(args: {
  shippingAddress: CheckoutShippingAddress;
  currencyCode: string;
  subtotalAmount: number;
  itemCount: number;
  orderId?: string;
  shipmentProtection?: boolean;
}) {
  if (isShippoConfigured()) {
    try {
      const shippoServices = await getShippoCheckoutServices(args);
      if (shippoServices.length > 0 || !SHIPPO_FALLBACK_TO_SHIPENGINE_ON_NO_RATES) {
        return shippoServices;
      }

      console.warn(
        'Shippo returned no checkout rates; temporarily trying ShipEngine fallback.',
        {
          country: args.shippingAddress.country,
          province: args.shippingAddress.province,
        },
      );
    } catch (error) {
      if (!SHIPPO_FALLBACK_TO_SHIPENGINE_ON_NO_RATES) {
        throw error;
      }

      console.warn(
        'Shippo checkout rates failed; temporarily trying ShipEngine fallback.',
        {
          country: args.shippingAddress.country,
          province: args.shippingAddress.province,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }

    return getLegacyShipEngineCheckoutServices(args);
  }

  console.warn('Shippo checkout rates are not configured; trying ShipEngine fallback.', {
    missing: getShippoMissingConfig(),
  });

  return getLegacyShipEngineCheckoutServices(args);
}

export const getShipEngineCheckoutServices = getLiveCheckoutShippingServices;
