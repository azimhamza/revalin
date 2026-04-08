import assert from "node:assert/strict";
import test from "node:test";

import { isReusableCheckoutOrder, markCheckoutOrderSetupFailed } from "../lib/checkout/order-recovery.ts";
import type { CheckoutOrderRecord, ShieldClimbPaymentData } from "../lib/checkout/types.ts";

function buildShieldClimbOrder(paymentOverrides: Partial<ShieldClimbPaymentData> = {}): CheckoutOrderRecord {
  const payment: ShieldClimbPaymentData = {
    provider: "shieldclimb",
    walletId: "wallet_123",
    addressIn: "0xaddress",
    polygonAddressIn: "0xpolygon",
    ipnToken: "ipn_123",
    callbackToken: "callback_123",
    status: "unpaid",
    redirectUrl: "https://payment.shieldclimb.com/pay/order_123",
    createdAt: "2026-04-08T16:00:00.000Z",
    updatedAt: "2026-04-08T16:00:00.000Z",
    ...paymentOverrides,
  };

  return {
    orderId: "RVL-TEST",
    accessKey: "access-key",
    cartId: "cart_123",
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
        quantity: 1,
        unitPrice: {
          amount: "100.00",
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
    payment,
    swell: {
      accountId: "account_123",
      orderId: "swell_order_123",
    },
    latestError: null,
  };
}

test("isReusableCheckoutOrder rejects initializing ShieldClimb placeholders", () => {
  const order = buildShieldClimbOrder({
    walletId: "pending",
    addressIn: "",
    polygonAddressIn: "",
    ipnToken: "",
    redirectUrl: "",
    status: "initializing",
  });

  assert.equal(isReusableCheckoutOrder(order), false);
});

test("isReusableCheckoutOrder accepts fully initialized ShieldClimb orders", () => {
  const order = buildShieldClimbOrder();

  assert.equal(isReusableCheckoutOrder(order), true);
});

test("markCheckoutOrderSetupFailed records the terminal failure state for retry recovery", () => {
  const order = buildShieldClimbOrder({
    walletId: "pending",
    addressIn: "",
    polygonAddressIn: "",
    ipnToken: "",
    redirectUrl: "",
    status: "initializing",
  });

  const failedAt = "2026-04-08T16:05:00.000Z";
  const updated = markCheckoutOrderSetupFailed(order, "ShieldClimb wallet creation failed.", failedAt);

  assert.equal(updated.payment.status, "failed");
  assert.equal(updated.payment.updatedAt, failedAt);
  assert.equal(updated.updatedAt, failedAt);
  assert.equal(updated.latestError, "ShieldClimb wallet creation failed.");
});
