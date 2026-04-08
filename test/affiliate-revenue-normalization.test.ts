import assert from "node:assert/strict";
import test from "node:test";

import { normalizeRevenueToUsd } from "../lib/checkout/affiliate-revenue-normalization.ts";

test("normalizeRevenueToUsd keeps USD amounts unchanged", async () => {
  const normalized = await normalizeRevenueToUsd({
    amount: 100,
    currencyCode: "USD",
  });

  assert.deepEqual(normalized, {
    normalizedOrderTotal: "100.00",
    payoutCurrencyCode: "USD",
  });
});

test("normalizeRevenueToUsd converts CAD via the injected converter", async () => {
  const normalized = await normalizeRevenueToUsd({
    amount: 135,
    currencyCode: "CAD",
    convertCurrency: async () => ({ value_coin: "99.50" }),
  });

  assert.deepEqual(normalized, {
    normalizedOrderTotal: "99.50",
    payoutCurrencyCode: "USD",
  });
});

test("normalizeRevenueToUsd throws when no conversion path exists", async () => {
  await assert.rejects(() =>
    normalizeRevenueToUsd({
      amount: 100,
      currencyCode: "EUR",
    }),
  );
});
