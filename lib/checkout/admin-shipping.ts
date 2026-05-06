import type { CheckoutRatedService } from '@/lib/checkout/shipping-rates';
import type { CheckoutShippingService } from '@/lib/checkout/types';

export const ADMIN_DISABLED_SHIPPING_SERVICE_ID = 'admin-shipping-disabled';
export const ADMIN_DISABLED_SHIPPING_SERVICE_NAME = 'Shipping disabled';

export function isAdminDisabledShippingServiceId(value?: string | null) {
  return value?.trim() === ADMIN_DISABLED_SHIPPING_SERVICE_ID;
}

export function buildAdminDisabledRatedService(
  currencyCode: string,
): CheckoutRatedService {
  return {
    id: ADMIN_DISABLED_SHIPPING_SERVICE_ID,
    name: ADMIN_DISABLED_SHIPPING_SERVICE_NAME,
    carrier: 'Admin test',
    source: 'manual',
    estimatedDays: null,
    price: {
      amount: '0.00',
      currencyCode,
    },
  };
}

export function buildAdminDisabledCheckoutShippingService(
  currencyCode: string,
): CheckoutShippingService {
  return {
    id: ADMIN_DISABLED_SHIPPING_SERVICE_ID,
    name: ADMIN_DISABLED_SHIPPING_SERVICE_NAME,
    carrier: 'Admin test',
    source: 'manual',
    estimatedDays: null,
    price: {
      amount: '0.00',
      currencyCode,
    },
  };
}
