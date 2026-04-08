import assert from "node:assert/strict";
import test from "node:test";

import {
  PRODUCT_NOTIFICATION_PRODUCT_VARIANT_KEY,
  buildProductNotificationName,
  buildProductNotificationSelectionKey,
  buildProductNotificationTrend,
  buildProductNotificationVariantKey,
  normalizeVariantTitle,
} from "../lib/back-in-stock/formatting.ts";

test("normalizeVariantTitle strips generic default labels", () => {
  assert.equal(normalizeVariantTitle("Default Title"), null);
  assert.equal(normalizeVariantTitle(" 10mg "), "10mg");
});

test("buildProductNotificationVariantKey uses a product sentinel when no variant exists", () => {
  assert.equal(
    buildProductNotificationVariantKey(null),
    PRODUCT_NOTIFICATION_PRODUCT_VARIANT_KEY,
  );
  assert.equal(buildProductNotificationVariantKey("variant-2"), "variant-2");
});

test("buildProductNotificationName appends the dosage when present", () => {
  assert.equal(
    buildProductNotificationName({
      productTitle: "Retatrutide",
      variantTitle: "10mg",
    }),
    "Retatrutide - 10mg",
  );
  assert.equal(
    buildProductNotificationName({
      productTitle: "Retatrutide",
      variantTitle: null,
    }),
    "Retatrutide",
  );
});

test("buildProductNotificationSelectionKey combines product and variant identity", () => {
  assert.equal(
    buildProductNotificationSelectionKey({
      productHandle: "retatrutide",
      variantKey: "variant-2",
    }),
    "retatrutide::variant-2",
  );
});

test("buildProductNotificationTrend fills missing dates with zero counts", () => {
  const today = new Date().toISOString().slice(0, 10);
  const trend = buildProductNotificationTrend(
    [{ date: today, signupCount: 3 }],
    3,
  );

  assert.equal(trend.length, 3);
  assert.equal(trend.at(-1)?.signupCount, 3);
  assert.equal(trend[0]?.signupCount, 0);
});
