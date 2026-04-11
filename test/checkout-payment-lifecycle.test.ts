import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInitialCheckoutOrderProcessing,
  createPaymentLifecycle,
  type PaymentLifecycleDependencies,
} from "../lib/checkout/payment-lifecycle-core.ts";
import type { CheckoutOrderRecord } from "../lib/checkout/types.ts";

function buildNowPaymentsOrder(
  overrides: Partial<CheckoutOrderRecord> = {},
): CheckoutOrderRecord {
  return {
    orderId: "RVL-LIFECYCLE",
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
      name: "UPS Ground",
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
      status: "waiting",
      paymentCurrency: "btc",
      payAddress: "bc1test",
      payAmount: "0.001",
      ipnCallbackEnabled: true,
      createdAt: "2026-04-08T16:00:00.000Z",
      updatedAt: "2026-04-08T16:00:00.000Z",
    },
    swell: {
      accountId: "account_123",
      orderId: "swell_order_123",
      orderNumber: "1001",
    },
    processing: buildInitialCheckoutOrderProcessing(),
    latestError: null,
    ...overrides,
  };
}

function cloneOrder<T>(value: T): T {
  return structuredClone(value);
}

function createLifecycleHarness(initialOrder: CheckoutOrderRecord) {
  let currentOrder = cloneOrder(initialOrder);
  const calls: string[] = [];

  const dependencies: PaymentLifecycleDependencies = {
    createPayoutFromOrder: async () => {
      calls.push("affiliatePayout");
      return null;
    },
    getCheckoutOrder: async (orderId: string) =>
      currentOrder.orderId === orderId ? cloneOrder(currentOrder) : null,
    updateCheckoutOrder: async (
      orderId: string,
      updater: (current: CheckoutOrderRecord) => CheckoutOrderRecord,
    ) => {
      if (currentOrder.orderId !== orderId) return null;
      currentOrder = cloneOrder(updater(cloneOrder(currentOrder)));
      return cloneOrder(currentOrder);
    },
    syncCheckoutOrderToSwell: async () => {
      calls.push("swellPayment");
      return { id: "swell_payment_123" };
    },
    syncShieldClimbOrderToSwell: async () => {
      calls.push("swellPayment");
      return { id: "swell_payment_123" };
    },
    sendPaymentCompletedEvent: async () => {
      calls.push("paymentCompletedEvent");
      return null;
    },
    trackPurchaseFromOrder: async () => {
      calls.push("purchaseTelemetry");
      return null;
    },
    sendOrderConfirmationEmail: async () => {
      calls.push("confirmationEmail");
      return null;
    },
    purchaseShipEngineLabel: async () => {
      calls.push("labelPurchase");
      return {
        trackingCode: "TRACK123",
        labelUrl: "https://example.com/label.pdf",
        carrier: "UPS",
        service: "UPS Ground",
        publicTrackingUrl: "https://track.example.com/TRACK123",
      };
    },
    sendShippingLabelEmail: async ({ labelUrl }) => {
      assert.equal(labelUrl, "https://example.com/label.pdf");
      calls.push("shippingLabelEmail");
      return null;
    },
    sendOrderShippedEmail: async () => {
      calls.push("shippedEmail");
      return null;
    },
    isSuccessfulPaymentStatus: status =>
      ["finished", "paid"].includes((status || "").toLowerCase()),
    isWelcomeDiscountCode: discountCode => Boolean(discountCode?.startsWith("WELCOME")),
    markWelcomeDiscountUsed: async () => null,
  };

  const lifecycle = createPaymentLifecycle(dependencies);

  return {
    lifecycle,
    dependencies,
    getOrder: () => cloneOrder(currentOrder),
    calls,
  };
}

test("applyVerifiedPaymentStatus runs the verified-success lifecycle once and replays safely", async () => {
  const harness = createLifecycleHarness(buildNowPaymentsOrder());
  const first = await harness.lifecycle.applyVerifiedPaymentStatus({
    orderId: "RVL-LIFECYCLE",
    provider: "nowpayments",
    targetStatus: "finished",
    source: "nowpayments_ipn",
    paymentUpdater: current => ({
      ...current.payment,
      status: "finished",
    }),
  });

  assert.equal(first.paymentStateChanged, true);
  assert.deepEqual(harness.calls, [
    "swellPayment",
    "paymentCompletedEvent",
    "purchaseTelemetry",
    "confirmationEmail",
    "labelPurchase",
    "shippingLabelEmail",
    "shippedEmail",
  ]);

  const processedOrder = harness.getOrder();
  assert.equal(processedOrder.payment.status, "finished");
  assert.equal(processedOrder.processing?.paymentCompletedEvent.status, "completed");
  assert.equal(processedOrder.processing?.purchaseTelemetry.status, "completed");
  assert.equal(processedOrder.processing?.confirmationEmail.status, "completed");
  assert.equal(processedOrder.processing?.welcomeDiscount.status, "skipped");
  assert.equal(processedOrder.processing?.affiliatePayout.status, "skipped");

  const replay = await harness.lifecycle.applyVerifiedPaymentStatus({
    orderId: "RVL-LIFECYCLE",
    provider: "nowpayments",
    targetStatus: "finished",
    source: "nowpayments_poll",
    paymentUpdater: current => ({
      ...current.payment,
      status: "finished",
    }),
  });

  assert.equal(replay.paymentStateChanged, false);
  assert.deepEqual(harness.calls, [
    "swellPayment",
    "paymentCompletedEvent",
    "purchaseTelemetry",
    "confirmationEmail",
    "labelPurchase",
    "shippingLabelEmail",
    "shippedEmail",
  ]);
});

test("applyVerifiedPaymentStatus keeps promoter payouts on the affiliate payout processing step", async () => {
  const harness = createLifecycleHarness(
    buildNowPaymentsOrder({
      affiliate: {
        id: "affiliate_123",
        code: "growth",
        commissionRate: "0.1",
        source: "url",
      },
      promoter: {
        id: "promoter_123",
        inviteId: "invite_123",
        affiliateId: "affiliate_123",
        affiliateCode: "growth",
        commissionRate: "0.025",
        source: "promoter_invite",
      },
    }),
  );

  await harness.lifecycle.applyVerifiedPaymentStatus({
    orderId: "RVL-LIFECYCLE",
    provider: "nowpayments",
    targetStatus: "finished",
    source: "nowpayments_ipn",
    paymentUpdater: current => ({
      ...current.payment,
      status: "finished",
    }),
  });

  assert.deepEqual(harness.calls, [
    "swellPayment",
    "paymentCompletedEvent",
    "purchaseTelemetry",
    "affiliatePayout",
    "confirmationEmail",
    "labelPurchase",
    "shippingLabelEmail",
    "shippedEmail",
  ]);
  assert.equal(harness.getOrder().processing?.affiliatePayout.status, "completed");

  await harness.lifecycle.applyVerifiedPaymentStatus({
    orderId: "RVL-LIFECYCLE",
    provider: "nowpayments",
    targetStatus: "finished",
    source: "nowpayments_poll",
    paymentUpdater: current => ({
      ...current.payment,
      status: "finished",
    }),
  });

  assert.equal(
    harness.calls.filter((call) => call === "affiliatePayout").length,
    1,
  );
});

test("applyVerifiedPaymentStatus does not revive immutable terminal orders or emit success telemetry", async () => {
  const harness = createLifecycleHarness(
    buildNowPaymentsOrder({
      payment: {
        provider: "nowpayments",
        paymentId: "payment_123",
        purchaseId: "purchase_123",
        status: "cancelled",
        paymentCurrency: "btc",
        payAddress: "bc1test",
        ipnCallbackEnabled: true,
      },
    }),
  );

  const result = await harness.lifecycle.applyVerifiedPaymentStatus({
    orderId: "RVL-LIFECYCLE",
    provider: "nowpayments",
    targetStatus: "finished",
    source: "nowpayments_ipn",
    ipnEvent: {
      receivedAt: "2026-04-08T16:30:00.000Z",
      valid: true,
      payload: { payment_status: "finished" },
    },
    paymentUpdater: current => ({
      ...current.payment,
      status: "finished",
    }),
  });

  assert.equal(result.wasNoopTerminal, true);
  assert.equal(harness.getOrder().payment.status, "cancelled");
  assert.equal(harness.getOrder().ipnEvents?.length, 1);
  assert.deepEqual(harness.calls, []);
});

test("non-blocking telemetry failures do not stop downstream successful-payment processing", async () => {
  const harness = createLifecycleHarness(buildNowPaymentsOrder());
  const lifecycle = createPaymentLifecycle({
    ...harness.dependencies,
    sendPaymentCompletedEvent: async () => {
      harness.calls.push("paymentCompletedEvent");
      throw new Error("loops unavailable");
    },
    trackPurchaseFromOrder: async () => {
      harness.calls.push("purchaseTelemetry");
      throw new Error("openpanel unavailable");
    },
  });

  await lifecycle.applyVerifiedPaymentStatus({
    orderId: "RVL-LIFECYCLE",
    provider: "nowpayments",
    targetStatus: "finished",
    source: "nowpayments_ipn",
    paymentUpdater: current => ({
      ...current.payment,
      status: "finished",
    }),
  });

  const processedOrder = harness.getOrder();
  assert.equal(processedOrder.processing?.paymentCompletedEvent.status, "failed");
  assert.equal(processedOrder.processing?.purchaseTelemetry.status, "failed");
  assert.equal(processedOrder.processing?.confirmationEmail.status, "completed");
  assert.equal(processedOrder.processing?.labelPurchase.status, "completed");
  assert.deepEqual(harness.calls, [
    "swellPayment",
    "paymentCompletedEvent",
    "purchaseTelemetry",
    "confirmationEmail",
    "labelPurchase",
    "shippingLabelEmail",
    "shippedEmail",
  ]);
});

test("skipped telemetry outcomes are recorded as skipped and downstream fulfillment still continues", async () => {
  const harness = createLifecycleHarness(buildNowPaymentsOrder());
  const lifecycle = createPaymentLifecycle({
    ...harness.dependencies,
    sendPaymentCompletedEvent: async () => {
      harness.calls.push("paymentCompletedEvent");
      return { status: "skipped" as const };
    },
    trackPurchaseFromOrder: async () => {
      harness.calls.push("purchaseTelemetry");
      return { status: "skipped" as const };
    },
  });

  await lifecycle.applyVerifiedPaymentStatus({
    orderId: "RVL-LIFECYCLE",
    provider: "nowpayments",
    targetStatus: "finished",
    source: "nowpayments_ipn",
    paymentUpdater: current => ({
      ...current.payment,
      status: "finished",
    }),
  });

  const processedOrder = harness.getOrder();
  assert.equal(processedOrder.processing?.paymentCompletedEvent.status, "skipped");
  assert.equal(processedOrder.processing?.purchaseTelemetry.status, "skipped");
  assert.equal(processedOrder.processing?.confirmationEmail.status, "completed");
  assert.equal(processedOrder.processing?.labelPurchase.status, "completed");
  assert.deepEqual(harness.calls, [
    "swellPayment",
    "paymentCompletedEvent",
    "purchaseTelemetry",
    "confirmationEmail",
    "labelPurchase",
    "shippingLabelEmail",
    "shippedEmail",
  ]);
});
