import { COMPLIMENTARY_SHIPPING_ENABLED, FREE_SHIPPING_THRESHOLD } from '@/lib/checkout/constants';
import { quoteShipEngineRates, type ShipEngineCheckoutRate } from '@/lib/checkout/shipengine';
import type { CheckoutShippingAddress } from '@/lib/checkout/types';
import type { StorefrontCartSnapshot, SwellShipmentService } from '@/lib/checkout/swell-order-management';

export type CheckoutRatedService = {
  id: string;
  name: string;
  quoteCategory?: 'cheapest' | 'best_value' | 'fastest';
  carrier?: string;
  pickup?: boolean;
  estimatedDays?: number | null;
  source: 'shipengine' | 'swell';
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
};

function toFixedAmount(amount: number) {
  return Number(amount || 0).toFixed(2);
}

function sortServicesByPrice<T extends CheckoutRatedService>(services: T[]) {
  return [...services].sort((left, right) => Number(left.price.amount) - Number(right.price.amount));
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
  const bestValue = sortedByPrice
    .filter(service => service.id !== cheapest?.id && service.id !== fastest?.id)
    .sort((left, right) => {
      const leftScore = (priceRanks.get(left.id) ?? sortedByPrice.length) + (speedRanks.get(left.id) ?? sortedByPrice.length);
      const rightScore = (priceRanks.get(right.id) ?? sortedByPrice.length) + (speedRanks.get(right.id) ?? sortedByPrice.length);

      if (leftScore !== rightScore) return leftScore - rightScore;
      return Number(left.price.amount) - Number(right.price.amount);
    })[0];

  pushService(cheapest, 'cheapest');
  pushService(bestValue, 'best_value');
  pushService(fastest, 'fastest');

  for (const service of sortedByPrice) {
    if (curated.length >= 3) break;
    pushService(service, undefined);
  }

  return curated;
}

function isEligibleForComplimentaryShipping(subtotalAmount: number, currencyCode: string) {
  return (
    COMPLIMENTARY_SHIPPING_ENABLED &&
    currencyCode.trim().toUpperCase() === 'USD' &&
    subtotalAmount >= FREE_SHIPPING_THRESHOLD
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
  return sortServicesByPrice(services)[0] || null;
}

export function findCheckoutShippingService(services: CheckoutRatedService[], selectedShippingServiceId: string) {
  return (
    services.find(service => service.id === selectedShippingServiceId) ||
    services.find(service => service.name === selectedShippingServiceId) ||
    null
  );
}

export function buildQuoteResponse(args: {
  currencyCode: string;
  subtotalAmount: number;
  discountAmount?: number;
  discountCode?: string;
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
    estimatedDays: service.estimatedDays,
    source: 'shipengine',
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

export async function getShipEngineCheckoutServices(args: {
  shippingAddress: CheckoutShippingAddress;
  currencyCode: string;
  subtotalAmount: number;
  itemCount: number;
}) {
  const result = await quoteShipEngineRates({
    shippingAddress: args.shippingAddress,
    itemCount: args.itemCount,
    currencyCode: args.currencyCode,
  });

  if (!result || result.rates.length === 0) {
    return [];
  }

  return mapShipEngineRatedServices(result.rates);
}
