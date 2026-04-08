import assert from "node:assert/strict";
import test from "node:test";

import { createCheckoutTelemetry } from "../lib/checkout/telemetry-core.ts";
import type { CheckoutOrderRecord } from "../lib/checkout/types.ts";

function buildOrder(overrides: Partial<CheckoutOrderRecord> = {}): CheckoutOrderRecord {
  return {
    orderId: "RVL-TELEMETRY-DELIVERY",
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
    ...overrides,
  };
}

test("sendPaymentCompletedEvent skips cleanly when Loops is not configured", async () => {
  const warnings: string[] = [];
  const telemetry = createCheckoutTelemetry({
    hasLoopsConfig: () => false,
    sendLoopsEvent: async () => {
      throw new Error("sendLoopsEvent should not be called without Loops config");
    },
    hasOpenPanelTrackingConfig: () => true,
    trackOpenPanelServerEvent: async () => null,
    logger: {
      warn: (message: string) => warnings.push(message),
    },
  });

  const result = await telemetry.sendPaymentCompletedEvent(buildOrder());

  assert.deepEqual(result, { status: "skipped" });
  assert.deepEqual(warnings, [
    "Skipping payment completed event: Loops not configured.",
  ]);
});

test("trackPurchaseFromOrder skips cleanly when OpenPanel tracking is not configured", async () => {
  const warnings: string[] = [];
  const telemetry = createCheckoutTelemetry({
    hasLoopsConfig: () => true,
    sendLoopsEvent: async () => ({ success: true } as any),
    hasOpenPanelTrackingConfig: () => false,
    trackOpenPanelServerEvent: async () => {
      throw new Error("trackOpenPanelServerEvent should not be called without OpenPanel config");
    },
    logger: {
      warn: (message: string) => warnings.push(message),
    },
  });

  const result = await telemetry.trackPurchaseFromOrder(buildOrder());

  assert.deepEqual(result, { status: "skipped" });
  assert.deepEqual(warnings, [
    "Skipping purchase telemetry: OpenPanel not configured.",
  ]);
});

test("sendPaymentCompletedEvent retries once before succeeding", async () => {
  let attempts = 0;
  const warnings: string[] = [];
  const telemetry = createCheckoutTelemetry({
    hasLoopsConfig: () => true,
    sendLoopsEvent: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("temporary loops outage");
      }

      return { success: true } as any;
    },
    hasOpenPanelTrackingConfig: () => true,
    trackOpenPanelServerEvent: async () => null,
    logger: {
      warn: (message: string) => warnings.push(message),
    },
  });

  const result = await telemetry.sendPaymentCompletedEvent(buildOrder());

  assert.deepEqual(result, { status: "completed" });
  assert.equal(attempts, 2);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Loops payment_completed attempt 1 failed/);
});

test("trackPurchaseFromOrder retries once before succeeding", async () => {
  let attempts = 0;
  const warnings: string[] = [];
  const telemetry = createCheckoutTelemetry({
    hasLoopsConfig: () => true,
    sendLoopsEvent: async () => ({ success: true } as any),
    hasOpenPanelTrackingConfig: () => true,
    trackOpenPanelServerEvent: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("temporary openpanel outage");
      }

      return null;
    },
    logger: {
      warn: (message: string) => warnings.push(message),
    },
  });

  const result = await telemetry.trackPurchaseFromOrder(buildOrder());

  assert.deepEqual(result, { status: "completed" });
  assert.equal(attempts, 2);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /OpenPanel purchase attempt 1 failed/);
});
