import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PROMOTER_COMMISSION_RATE,
  calculatePromoterCommissionAmount,
  normalizePromoterCommissionRateInput,
} from "../lib/checkout/promoter-math.ts";

test("normalizePromoterCommissionRateInput defaults to 2.5 percent", () => {
  assert.equal(DEFAULT_PROMOTER_COMMISSION_RATE, "0.025");
  assert.deepEqual(normalizePromoterCommissionRateInput(undefined), {
    numeric: 0.025,
    stored: "0.025",
    percentDisplay: "2.5",
  });
});

test("normalizePromoterCommissionRateInput accepts percent and decimal inputs", () => {
  assert.deepEqual(normalizePromoterCommissionRateInput("2.5"), {
    numeric: 0.025,
    stored: "0.025",
    percentDisplay: "2.5",
  });

  assert.deepEqual(normalizePromoterCommissionRateInput("0.03"), {
    numeric: 0.03,
    stored: "0.03",
    percentDisplay: "3",
  });
});

test("normalizePromoterCommissionRateInput rejects zero and rates above 100 percent", () => {
  assert.throws(() => normalizePromoterCommissionRateInput("0"));
  assert.throws(() => normalizePromoterCommissionRateInput("101"));
});

test("calculatePromoterCommissionAmount uses normalized paid order total", () => {
  assert.equal(
    calculatePromoterCommissionAmount({
      normalizedOrderTotal: "99.50",
      commissionRate: "0.025",
    }),
    "2.49",
  );

  assert.equal(
    calculatePromoterCommissionAmount({
      normalizedOrderTotal: "135.00",
      commissionRate: "0.03",
    }),
    "4.05",
  );
});
