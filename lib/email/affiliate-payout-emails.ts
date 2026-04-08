import { hasLoopsConfig, sendTransactionalEmail } from "@/lib/email/loops";
import {
  buildAffiliateEarnedEmailPayload,
  buildAffiliateWeeklyPayoutSentEmailPayload,
} from "@/lib/email/affiliate-payout-email-payloads";

const DEFAULT_AFFILIATE_EARNED_TRANSACTIONAL_ID = "cmnmu6kpd28570ivpgny6iyu7";
const DEFAULT_AFFILIATE_PAYOUT_SENT_TRANSACTIONAL_ID =
  "cmnmuuz2807d70iwjl09j9ued";

export async function sendAffiliateEarnedEmail(args: {
  affiliateEmail: string;
  affiliateName: string;
  commissionAmount: string | number;
}) {
  if (!hasLoopsConfig()) {
    console.warn("Skipping affiliate earned email: Loops not configured.");
    return null;
  }

  const transactionalId =
    process.env.LOOPS_TRANSACTIONAL_AFFILIATE_EARNED?.trim() ||
    DEFAULT_AFFILIATE_EARNED_TRANSACTIONAL_ID;

  return sendTransactionalEmail({
    email: args.affiliateEmail,
    transactionalId,
    addToAudience: true,
    dataVariables: buildAffiliateEarnedEmailPayload(args),
  });
}

export async function sendAffiliateWeeklyPayoutSentEmail(args: {
  affiliateEmail: string;
  affiliateName: string;
  payoutAmount: string | number;
  payoutPeriod: string;
  currentTier: string;
  amountToNextTier: string | number | null;
  nextTier: string | null;
}) {
  if (!hasLoopsConfig()) {
    console.warn("Skipping affiliate payout sent email: Loops not configured.");
    return null;
  }

  const transactionalId =
    process.env.LOOPS_TRANSACTIONAL_AFFILIATE_PAYOUT_SENT?.trim() ||
    DEFAULT_AFFILIATE_PAYOUT_SENT_TRANSACTIONAL_ID;

  return sendTransactionalEmail({
    email: args.affiliateEmail,
    transactionalId,
    addToAudience: true,
    dataVariables: buildAffiliateWeeklyPayoutSentEmailPayload(args),
  });
}
