import assert from "node:assert/strict";
import test from "node:test";

import { buildProductNotificationReadyEmailVariables } from "../lib/back-in-stock/email-payloads.ts";

test("buildProductNotificationReadyEmailVariables includes Loops template keys", () => {
  const variables = buildProductNotificationReadyEmailVariables({
    productTitle: "GHK-Cu",
    variantTitle: "50mg",
    discountPercent: 20,
    discountCode: "R2051C433",
    discountExpiresAt: "2026-04-11T16:00:00.000Z",
    productUrl: "https://revalin.ca/product/ghk-cu",
    checkoutUrl: "https://revalin.ca/checkout?discount=R2051C433",
  });

  assert.equal(variables.product_name, "GHK-Cu - 50mg");
  assert.equal(variables.discount_code, "R2051C433");
  assert.equal(variables.productTitle, "GHK-Cu");
  assert.equal(variables.discountCode, "R2051C433");
});
