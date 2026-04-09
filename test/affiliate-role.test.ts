import assert from "node:assert/strict";
import test from "node:test";

import { shouldPromoteToAffiliateRole } from "../lib/checkout/affiliate-role.ts";

test("shouldPromoteToAffiliateRole promotes customer-style accounts", () => {
  assert.equal(shouldPromoteToAffiliateRole("customer"), true);
  assert.equal(shouldPromoteToAffiliateRole(null), true);
  assert.equal(shouldPromoteToAffiliateRole(""), true);
});

test("shouldPromoteToAffiliateRole preserves admin access", () => {
  assert.equal(shouldPromoteToAffiliateRole("admin"), false);
  assert.equal(shouldPromoteToAffiliateRole("affiliate"), false);
});
