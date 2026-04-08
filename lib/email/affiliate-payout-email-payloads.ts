import { formatUsdAmount, parseAmount } from "../checkout/affiliate-math.ts";

function getFirstName(name: string) {
  const normalized = name.trim();
  if (!normalized) return "there";
  return normalized.split(/\s+/)[0] || normalized;
}

export function buildAffiliateEarnedEmailPayload(args: {
  affiliateName: string;
  commissionAmount: string | number;
}) {
  return {
    commission_amount: formatUsdAmount(args.commissionAmount),
    first_name: getFirstName(args.affiliateName),
  };
}

export function buildAffiliateWeeklyPayoutSentEmailPayload(args: {
  affiliateName: string;
  payoutAmount: string | number;
  payoutPeriod: string;
  currentTier: string;
  amountToNextTier: string | number | null;
  nextTier: string | null;
}) {
  return {
    payout_amount: formatUsdAmount(args.payoutAmount),
    first_name: getFirstName(args.affiliateName),
    payout_period: args.payoutPeriod,
    current_tier: args.currentTier,
    amount_to_next_tier:
      args.amountToNextTier === null
        ? "$0.00"
        : formatUsdAmount(parseAmount(args.amountToNextTier)),
    next_tier: args.nextTier || "Top tier unlocked",
  };
}
