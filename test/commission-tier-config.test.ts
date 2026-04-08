import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_COMMISSION_TIER_CONFIG,
  getCommissionTierProgress,
  validateCommissionTierConfiguration,
} from "../lib/checkout/commission-tier-config.ts";

test("validateCommissionTierConfiguration accepts the default ladder", () => {
  const tiers = validateCommissionTierConfiguration(DEFAULT_COMMISSION_TIER_CONFIG);

  assert.equal(tiers.length, DEFAULT_COMMISSION_TIER_CONFIG.length);
  assert.equal(tiers[0]?.minRevenue, "0.00");
  assert.equal(tiers.at(-1)?.maxRevenue, null);
});

test("validateCommissionTierConfiguration rejects discontinuous ranges", () => {
  assert.throws(() =>
    validateCommissionTierConfiguration([
      DEFAULT_COMMISSION_TIER_CONFIG[0]!,
      {
        ...DEFAULT_COMMISSION_TIER_CONFIG[1]!,
        minRevenue: "10001.00",
      },
      ...DEFAULT_COMMISSION_TIER_CONFIG.slice(2),
    ]),
  );
});

test("getCommissionTierProgress returns current tier, next tier, and gap", () => {
  const progress = getCommissionTierProgress({
    revenue: 25000,
    tiers: DEFAULT_COMMISSION_TIER_CONFIG,
  });

  assert.equal(progress.currentTier.key, "builder");
  assert.equal(progress.nextTier?.key, "scaler");
  assert.equal(progress.amountToNextTier, "5000.00");
});
