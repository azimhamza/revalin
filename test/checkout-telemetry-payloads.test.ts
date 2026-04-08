import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCheckoutPaymentInitiatedEventProperties,
  buildCheckoutPaymentInitiatedTrackingProperties,
  buildOpenPanelAuthProperties,
  buildPaymentCompletedEventProperties,
  buildPurchaseTrackingProperties,
} from "../lib/checkout/telemetry-payloads.ts";
import { toPublicCheckoutOrder, type CheckoutOrderRecord } from "../lib/checkout/types.ts";

function buildOrder(overrides: Partial<CheckoutOrderRecord> = {}): CheckoutOrderRecord {
  return {
    orderId: "RVL-TELEMETRY",
    accessKey: "access-key",
    cartId: "cart_123",
    userId: "user_123",
    createdAt: "2026-04-08T16:00:00.000Z",
    updatedAt: "2026-04-08T16:00:00.000Z",
    currencyCode: "USD",
    shippingAddress: {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "5551234567",
      address1: "123 Test St",
      city: "Toronto",
      province: "ON",
      postalCode: "M5V 1E3",
      country: "CA",
    },
    shippingService: {
      id: "shipengine:ups:ground",
      name: "Ground",
      source: "shipengine",
      carrier: "UPS",
      carrierCode: "ups",
      serviceCode: "ups_ground",
      price: {
        amount: "15.00",
        currencyCode: "USD",
      },
    },
    lines: [
      {
        id: "line_1",
        merchandiseId: "variant_1",
        productHandle: "test-product",
        productTitle: "Test Product",
        variantTitle: "Default",
        imageUrl: "/placeholder.jpg",
        selectedOptions: [],
        quantity: 2,
        unitPrice: {
          amount: "50.00",
          currencyCode: "USD",
        },
        lineTotal: {
          amount: "100.00",
          currencyCode: "USD",
        },
      },
    ],
    totals: {
      subtotalAmount: {
        amount: "100.00",
        currencyCode: "USD",
      },
      totalAmount: {
        amount: "115.00",
        currencyCode: "USD",
      },
      shippingAmount: {
        amount: "15.00",
        currencyCode: "USD",
      },
      shippingThresholdAmount: {
        amount: "250.00",
        currencyCode: "USD",
      },
      shippingStatus: "quoted",
    },
    payment: {
      provider: "nowpayments",
      paymentId: "payment_123",
      purchaseId: "purchase_123",
      status: "finished",
      paymentCurrency: "btc",
      payAddress: "bc1test",
      ipnCallbackEnabled: true,
    },
    swell: {
      accountId: "account_123",
      orderId: "swell_order_123",
      orderNumber: "1001",
    },
    affiliate: {
      id: "aff_123",
      code: "CREATOR",
      commissionRate: "0.10",
      source: "url",
    },
    processing: {
      swellPayment: { status: "completed", attempts: 1, lastError: null, claimId: null },
      paymentCompletedEvent: { status: "pending", attempts: 0, lastError: null, claimId: null },
      purchaseTelemetry: { status: "pending", attempts: 0, lastError: null, claimId: null },
      welcomeDiscount: { status: "pending", attempts: 0, lastError: null, claimId: null },
      affiliatePayout: { status: "pending", attempts: 0, lastError: null, claimId: null },
      confirmationEmail: { status: "pending", attempts: 0, lastError: null, claimId: null },
      labelPurchase: { status: "pending", attempts: 0, lastError: null, claimId: null },
      shippingLabelEmail: { status: "pending", attempts: 0, lastError: null, claimId: null },
      shippedEmail: { status: "pending", attempts: 0, lastError: null, claimId: null },
    },
    latestError: null,
    ...overrides,
  };
}

test("buildCheckoutPaymentInitiatedEventProperties includes funnel context without null affiliate keys", () => {
  const props = buildCheckoutPaymentInitiatedEventProperties({
    orderId: "RVL-INIT",
    userId: null,
    currencyCode: "USD",
    orderTotal: "115.00",
    itemCount: 2,
    paymentProvider: "shieldclimb",
    paymentMethod: "card",
    affiliateCode: null,
    affiliateSource: null,
  });

  assert.deepEqual(props, {
    orderId: "RVL-INIT",
    paymentProvider: "shieldclimb",
    paymentMethod: "card",
    orderTotal: "115.00",
    currencyCode: "USD",
    itemCount: 2,
  });
});

test("buildOpenPanelAuthProperties maps authenticated and anonymous users", () => {
  assert.deepEqual(buildOpenPanelAuthProperties("user_123"), {
    profileId: "user_123",
    user_id: "user_123",
    auth_state: "authenticated",
  });

  assert.deepEqual(buildOpenPanelAuthProperties(null), {
    auth_state: "anonymous",
  });
});

test("buildCheckoutPaymentInitiatedTrackingProperties preserves funnel analytics fields", () => {
  const props = buildCheckoutPaymentInitiatedTrackingProperties({
    orderId: "RVL-INIT",
    userId: "user_123",
    currencyCode: "USD",
    orderTotal: "115.00",
    itemCount: 3,
    paymentProvider: "nowpayments",
    paymentMethod: "crypto",
    affiliateCode: "CREATOR",
    affiliateSource: "discount_code",
  });

  assert.deepEqual(props, {
    profileId: "user_123",
    user_id: "user_123",
    auth_state: "authenticated",
    orderId: "RVL-INIT",
    orderTotal: "115.00",
    currencyCode: "USD",
    paymentProvider: "nowpayments",
    paymentMethod: "crypto",
    itemCount: 3,
    affiliate_code: "CREATOR",
    affiliate_source: "discount_code",
  });
});

test("buildPaymentCompletedEventProperties stays aligned with verified-success Loops payload", () => {
  const order = buildOrder();

  assert.deepEqual(buildPaymentCompletedEventProperties(order), {
    orderId: "RVL-TELEMETRY",
    orderTotal: "115.00",
    currencyCode: "USD",
  });
});

test("buildPurchaseTrackingProperties derives authenticated purchase analytics from stored order state", () => {
  const order = buildOrder();

  assert.deepEqual(buildPurchaseTrackingProperties(order), {
    profileId: "user_123",
    user_id: "user_123",
    auth_state: "authenticated",
    orderId: "RVL-TELEMETRY",
    orderTotal: "115.00",
    currencyCode: "USD",
    paymentMethod: "crypto",
    itemCount: 2,
    affiliate_code: "CREATOR",
    affiliate_source: "url",
  });
});

test("toPublicCheckoutOrder strips internal user and processing state", () => {
  const order = buildOrder();
  const publicOrder = toPublicCheckoutOrder(order) as Record<string, unknown>;

  assert.equal("userId" in publicOrder, false);
  assert.equal("processing" in publicOrder, false);
  assert.equal(publicOrder.orderId, "RVL-TELEMETRY");
});
