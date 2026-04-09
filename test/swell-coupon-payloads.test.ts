import assert from "node:assert/strict";
import test from "node:test";

import { buildSwellCouponCreatePayload } from "../lib/checkout/swell-coupon-payloads.ts";

test("buildSwellCouponCreatePayload sends coupon codes as objects", () => {
  assert.deepEqual(
    buildSwellCouponCreatePayload({
      code: " ready20-0984761b ",
      name: "Restock batch",
      percentOff: 20,
      expiresAt: "2026-04-12T00:00:00.000Z",
      description: "Auto-issued restock notification coupon.",
      limitUses: 1,
      limitAccountUses: 1,
    }),
    {
      name: "Restock batch",
      description: "Auto-issued restock notification coupon.",
      active: true,
      date_expired: "2026-04-12T00:00:00.000Z",
      codes: [{ code: "READY20-0984761B" }],
      limit_uses: 1,
      limit_account_uses: 1,
      discounts: [
        {
          type: "total",
          value_type: "percent",
          value_percent: 20,
        },
      ],
    },
  );
});
