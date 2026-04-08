import assert from 'node:assert/strict';
import test from 'node:test';

import type { CheckoutOrderRecord } from '../lib/checkout/types.ts';
import {
  buildOrderConfirmationDataVariables,
  buildOrderShippedDataVariables,
} from '../lib/email/order-email-payloads.ts';

const shippedOrder: CheckoutOrderRecord = {
  orderId: 'order_123',
  accessKey: 'access_123',
  cartId: 'cart_123',
  createdAt: '2026-04-08T10:00:00.000Z',
  updatedAt: '2026-04-08T10:00:00.000Z',
  currencyCode: 'USD',
  shippingAddress: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phone: '5551234567',
    address1: '123 Example St',
    address2: 'Suite 4',
    city: 'Toronto',
    province: 'ON',
    postalCode: 'M5V 2T6',
    country: 'CA',
  },
  shippingService: {
    id: 'ship_1',
    name: 'Tracked Parcel',
    carrier: 'Canada Post',
    estimatedDays: 3,
    price: {
      amount: '14.99',
      currencyCode: 'USD',
    },
  },
  lines: [
    {
      id: 'line_1',
      merchandiseId: 'merch_1',
      productHandle: 'test-peptide',
      productTitle: 'Test Peptide',
      variantTitle: '10mg',
      skuNumber: 'TP-10',
      imageUrl: 'https://example.com/item.png',
      selectedOptions: [],
      quantity: 2,
      unitPrice: {
        amount: '15.00',
        currencyCode: 'USD',
      },
      lineTotal: {
        amount: '30.00',
        currencyCode: 'USD',
      },
    },
  ],
  totals: {
    subtotalAmount: {
      amount: '30.00',
      currencyCode: 'USD',
    },
    discountAmount: {
      amount: '5.00',
      currencyCode: 'USD',
    },
    discountCode: 'SAVE5',
    taxAmount: {
      amount: '3.25',
      currencyCode: 'USD',
    },
    totalAmount: {
      amount: '43.24',
      currencyCode: 'USD',
    },
    shippingAmount: {
      amount: '14.99',
      currencyCode: 'USD',
    },
    shippingThresholdAmount: {
      amount: '250.00',
      currencyCode: 'USD',
    },
    shippingStatus: 'quoted',
  },
  payment: {
    provider: 'nowpayments',
    status: 'finished',
    paymentCurrency: 'btc',
    ipnCallbackEnabled: true,
  },
  swell: {
    accountId: 'acct_1',
    orderId: 'swell_1',
    orderNumber: 'R-1001',
  },
  shipengine: {
    trackingCode: 'CP123456789CA',
    carrier: 'Canada Post',
    service: 'Tracked Parcel',
    publicTrackingUrl: 'https://tracking.example.com/CP123456789CA',
    labelPurchasedAt: '2026-04-08T16:30:00.000Z',
  },
};

test('buildOrderShippedDataVariables matches the published Loops shipped template', () => {
  assert.deepEqual(buildOrderShippedDataVariables(shippedOrder), {
    order_number: 'R-1001',
    shipping: [
      {
        carrier: 'Canada Post',
        tracking_number: 'CP123456789CA',
        shipped_at: '2026-04-08',
        delivery_date: '2026-04-11',
      },
    ],
    tracking_link: 'https://tracking.example.com/CP123456789CA',
    items: [
      {
        product_name: 'Test Peptide - 10mg',
        sku_number: 'TP-10',
        quantity: 2,
        unit_price: '$15.00',
        subtotal: '$30.00',
      },
    ],
    subtotal: '$30.00',
    shipping_total: '$14.99',
    tax: '$3.25',
    discount: '-$5.00',
    total_paid: '$43.24',
    customer_name: 'Ada Lovelace',
    street_address: '123 Example St, Suite 4',
    city: 'Toronto',
    state: 'ON',
    postal_code: 'M5V 2T6',
    country: 'Canada',
  });
});

test('buildOrderConfirmationDataVariables includes shipping_total for the current Loops template', () => {
  const payload = buildOrderConfirmationDataVariables(shippedOrder);

  assert.equal(payload.shipping, '$14.99');
  assert.equal(payload.shipping_total, '$14.99');
  assert.equal(payload.discount, '-$5.00');
});

test('buildOrderShippedDataVariables defaults discount to zero when no discount is applied', () => {
  const withoutDiscount: CheckoutOrderRecord = {
    ...shippedOrder,
    totals: {
      ...shippedOrder.totals,
      discountAmount: undefined,
      discountCode: undefined,
    },
  };

  const payload = buildOrderShippedDataVariables(withoutDiscount);

  assert.equal(payload.discount, '$0.00');
  assert.equal(payload.shipping_total, '$14.99');
});
