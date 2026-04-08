import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAffiliateEarnedEmailPayload,
  buildAffiliateWeeklyPayoutSentEmailPayload,
} from "../lib/email/affiliate-payout-email-payloads.ts";

test("buildAffiliateEarnedEmailPayload formats first name and commission", () => {
  assert.deepEqual(
    buildAffiliateEarnedEmailPayload({
      affiliateName: "Jane Doe",
      commissionAmount: "125.5",
    }),
    {
      commission_amount: "$125.50",
      first_name: "Jane",
    },
  );
});

test("buildAffiliateWeeklyPayoutSentEmailPayload formats tier data", () => {
  assert.deepEqual(
    buildAffiliateWeeklyPayoutSentEmailPayload({
      affiliateName: "Jane Doe",
      payoutAmount: "400",
      payoutPeriod: "Mar 30, 2026 - Apr 3, 2026",
      currentTier: "Builder",
      amountToNextTier: "5000",
      nextTier: "Scaler",
    }),
    {
      payout_amount: "$400.00",
      first_name: "Jane",
      payout_period: "Mar 30, 2026 - Apr 3, 2026",
      current_tier: "Builder",
      amount_to_next_tier: "$5,000.00",
      next_tier: "Scaler",
    },
  );
});
