import {
  COMPLIMENTARY_SHIPPING_ENABLED,
  getFreeShippingThresholdForCurrency,
} from '@/lib/checkout/constants';
import { getShippoFulfillmentSettings } from '@/lib/checkout/shippo-fulfillment-settings';
import { quoteShipEngineRates, type ShipEngineCheckoutRate } from '@/lib/checkout/shipengine';
import { quoteShippoRates, type ShippoCheckoutRate } from '@/lib/checkout/shippo';
import type { CheckoutAppliedDiscount, CheckoutLandedCost, CheckoutShippingAddress } from '@/lib/checkout/types';
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
  source: 'shipengine' | 'shippo' | 'swell';
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
  const fastest = sortedBySpeed[0];
  const preferred = sortServicesByPreference(sortedByPrice)[0];
  const bestValue = sortedByPrice
    .filter(service => service.id !== cheapest?.id && service.id !== fastest?.id)
    .sort((left, right) => {
      const leftScore = (priceRanks.get(left.id) ?? sortedByPrice.length) + (speedRanks.get(left.id) ?? sortedByPrice.length);
      const rightScore = (priceRanks.get(right.id) ?? sortedByPrice.length) + (speedRanks.get(right.id) ?? sortedByPrice.length);

      if (leftScore !== rightScore) return leftScore - rightScore;
      return Number(left.price.amount) - Number(right.price.amount);
    })[0];

  pushService(preferred, preferred?.id === cheapest?.id ? 'cheapest' : 'best_value');
  pushService(cheapest, 'cheapest');
  pushService(bestValue, 'best_value');
  pushService(fastest, 'fastest');

  for (const service of sortedByPrice) {
    if (curated.length >= 4) break;
    pushService(service, undefined);
  }

  return curated;
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
  paymentMethod?: 'card' | 'crypto' | 'interac';
  services: CheckoutRatedService[];
}) {
  const services = applyFreeShipping(
    curateCheckoutServices(args.services),
    args.subtotalAmount,
    args.currencyCode
  );

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
}): CheckoutRatedService[] {
  return args.services.map(service => ({
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
    source: 'shippo',
    price: {
      amount: toFixedAmount(service.price),
      currencyCode: service.currencyCode,
    },
  }));
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

  return mapShipEngineRatedServices(preferredRates);
}

export async function getShippoCheckoutServices(args: {
  shippingAddress: CheckoutShippingAddress;
  currencyCode: string;
  subtotalAmount: number;
  itemCount: number;
  orderId?: string;
}) {
  const customsSettings = await getShippoFulfillmentSettings();
  const result = await quoteShippoRates({
    shippingAddress: args.shippingAddress,
    itemCount: args.itemCount,
    currencyCode: args.currencyCode,
    orderId: args.orderId,
    customsSettings,
  });

  if (!result || result.rates.length === 0) {
    return [];
  }

  return mapShippoRatedServices({
    services: result.rates,
    shippingAddress: args.shippingAddress,
  });
}

export async function getLiveCheckoutShippingServices(args: {
  shippingAddress: CheckoutShippingAddress;
  currencyCode: string;
  subtotalAmount: number;
  itemCount: number;
  orderId?: string;
}) {
  try {
    const shippoServices = await getShippoCheckoutServices(args);
    if (shippoServices.length > 0) {
      return shippoServices;
    }
  } catch (error) {
    console.warn(
      'Unable to fetch Shippo checkout rates. Falling back to legacy carrier rates.',
      error,
    );
  }

  return getLegacyShipEngineCheckoutServices(args);
}

export const getShipEngineCheckoutServices = getLiveCheckoutShippingServices;
