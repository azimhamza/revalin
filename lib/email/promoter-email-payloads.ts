import { formatUsdAmount } from "../checkout/affiliate-math.ts";

function getFirstName(name?: string | null) {
  const normalized = name?.trim();
  if (!normalized) return "there";
  return normalized.split(/\s+/)[0] || normalized;
}

export function buildPromoterEarnedEmailPayload(args: {
  promoterName: string;
  commissionAmount: string | number;
  growthPartnerName?: string | null;
}) {
  return {
    commission_amount: formatUsdAmount(args.commissionAmount),
    first_name: getFirstName(args.promoterName),
    growth_partner_first_name: getFirstName(args.growthPartnerName),
  };
}

export function buildPromoterWeeklyPayoutSentEmailPayload(args: {
  promoterName: string;
  payoutAmount: string | number;
  payoutPeriod: string;
}) {
  return {
    payout_amount: formatUsdAmount(args.payoutAmount),
    first_name: getFirstName(args.promoterName),
    payout_period: args.payoutPeriod,
  };
}

export function buildPromoterApplicationReceivedEmailPayload(args: {
  applicantName?: string | null;
  applicantEmail: string;
}) {
  const firstNameSource =
    args.applicantName?.trim() ||
    args.applicantEmail.split("@")[0] ||
    "Applicant";

  return {
    first_name: getFirstName(firstNameSource),
  };
}

export function buildPromoterReinstatementEmailPayload(args: {
  reinstatementReason?: string | null;
}) {
  return {
    reinstatement_reason:
      args.reinstatementReason?.trim() ||
      "Your promoter access has been reinstated.",
  };
}

export function buildPromoterReferralLinkUpdatedEmailPayload(args: {
  promoterName?: string | null;
  oldReferralLink: string;
  newReferralLink: string;
}) {
  return {
    first_name: getFirstName(args.promoterName),
    OLD_REFERRAL_LINK: args.oldReferralLink,
    NEW_REFERRAL_LINK: args.newReferralLink,
  };
}

export function buildPromoterRemovalEmailPayload(args: {
  promoterName?: string | null;
  removalReason?: string | null;
}) {
  return {
    first_name: getFirstName(args.promoterName),
    removal_reason:
      args.removalReason?.trim() || "Your promoter access has been removed.",
  };
}
