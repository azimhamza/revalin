import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPromoterApplicationReceivedEmailPayload,
  buildPromoterEarnedEmailPayload,
  buildPromoterRemovalEmailPayload,
  buildPromoterReferralLinkUpdatedEmailPayload,
  buildPromoterReinstatementEmailPayload,
  buildPromoterWeeklyPayoutSentEmailPayload,
} from "../lib/email/promoter-email-payloads.ts";

test("buildPromoterApplicationReceivedEmailPayload matches the Loops application template", () => {
  assert.deepEqual(
    buildPromoterApplicationReceivedEmailPayload({
      applicantName: "Marie Curie",
      applicantEmail: "marie@example.com",
    }),
    {
      first_name: "Marie",
    },
  );
});

test("buildPromoterEarnedEmailPayload matches the Loops promoter earned template", () => {
  assert.deepEqual(
    buildPromoterEarnedEmailPayload({
      promoterName: "Ada Lovelace",
      commissionAmount: "2.49",
      growthPartnerName: "Grace Hopper",
    }),
    {
      commission_amount: "$2.49",
      first_name: "Ada",
      growth_partner_first_name: "Grace",
    },
  );
});

test("buildPromoterWeeklyPayoutSentEmailPayload matches the Loops payout sent template", () => {
  assert.deepEqual(
    buildPromoterWeeklyPayoutSentEmailPayload({
      promoterName: "Ada Lovelace",
      payoutAmount: "52.75",
      payoutPeriod: "Apr 3, 2026 - Apr 10, 2026",
    }),
    {
      payout_amount: "$52.75",
      first_name: "Ada",
      payout_period: "Apr 3, 2026 - Apr 10, 2026",
    },
  );
});

test("buildPromoterReinstatementEmailPayload matches the Loops reinstatement template", () => {
  assert.deepEqual(
    buildPromoterReinstatementEmailPayload({
      reinstatementReason: "Your promoter account is active again.",
    }),
    {
      reinstatement_reason: "Your promoter account is active again.",
    },
  );
});

test("buildPromoterReferralLinkUpdatedEmailPayload matches the Loops link update template", () => {
  assert.deepEqual(
    buildPromoterReferralLinkUpdatedEmailPayload({
      promoterName: "Rosalind Franklin",
      oldReferralLink: "https://revalin.ca/promoter/r/promoter-a1b2c3d4e5",
      newReferralLink: "https://revalin.ca/grow/promoter-a1b2c3d4e5",
    }),
    {
      first_name: "Rosalind",
      OLD_REFERRAL_LINK: "https://revalin.ca/promoter/r/promoter-a1b2c3d4e5",
      NEW_REFERRAL_LINK: "https://revalin.ca/grow/promoter-a1b2c3d4e5",
    },
  );
});

test("buildPromoterRemovalEmailPayload matches the Loops removal template", () => {
  assert.deepEqual(
    buildPromoterRemovalEmailPayload({
      promoterName: "Katherine Johnson",
      removalReason: "Promoter access was removed after policy review.",
    }),
    {
      first_name: "Katherine",
      removal_reason: "Promoter access was removed after policy review.",
    },
  );
});
