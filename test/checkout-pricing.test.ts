import assert from "node:assert/strict";
import test from "node:test";

import {
  DIRECT_CRYPTO_DISCOUNT_LABEL,
  calculateCheckoutPricing,
  getCheckoutDiscounts,
} from "../lib/checkout/pricing.ts";

test("calculateCheckoutPricing stacks coupon and crypto discounts into the final total", () => {
  const pricing = calculateCheckoutPricing({
    currencyCode: "USD",
    subtotalAmount: 100,
    couponDiscountAmount: 10,
    couponCode: "WELCOME10",
    shippingAmount: 15,
    taxAmount: 5,
    paymentMethod: "crypto",
  });

  assert.equal(pricing.cryptoDiscountValue, 5.5);
  assert.equal(pricing.discountTotalValue, 15.5);
  assert.equal(pricing.totalValue, 104.5);
  assert.deepEqual(
    pricing.discounts.map(discount => [discount.kind, discount.label, discount.amount.amount]),
    [
      ["coupon", "Discount (WELCOME10)", "10.00"],
      ["crypto", DIRECT_CRYPTO_DISCOUNT_LABEL, "5.50"],
    ],
  );
});

test("calculateCheckoutPricing leaves card totals unchanged by the crypto discount", () => {
  const pricing = calculateCheckoutPricing({
    currencyCode: "USD",
    subtotalAmount: 100,
    shippingAmount: 10,
    taxAmount: 5,
    paymentMethod: "card",
  });

  assert.equal(pricing.cryptoDiscountValue, 0);
  assert.equal(pricing.discountTotalValue, 0);
  assert.equal(pricing.totalValue, 115);
  assert.equal(pricing.discounts.length, 0);
});

test("getCheckoutDiscounts falls back to the legacy single discount shape", () => {
  const discounts = getCheckoutDiscounts({
    currencyCode: "USD",
    discountAmount: "7.25",
    discountCode: "WELCOME10",
  });

  assert.deepEqual(discounts, [
    {
      kind: "coupon",
      label: "Discount (WELCOME10)",
      code: "WELCOME10",
      amount: {
        amount: "7.25",
        currencyCode: "USD",
      },
    },
  ]);
});
