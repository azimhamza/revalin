import { hasLoopsConfig, sendTransactionalEmail } from '@/lib/email/loops';
import {
  buildAffiliateEarnedEmailPayload,
  buildAffiliateWeeklyPayoutSentEmailPayload,
} from '@/lib/email/affiliate-payout-email-payloads';

const DEFAULT_AFFILIATE_EARNED_TRANSACTIONAL_ID = 'cmnmu6kpd28570ivpgny6iyu7';
const DEFAULT_AFFILIATE_PAYOUT_SENT_TRANSACTIONAL_ID =
  'cmnmuuz2807d70iwjl09j9ued';

type AffiliatePayoutEmailDependencies = {
  hasLoopsConfig: typeof hasLoopsConfig;
  sendTransactionalEmail: typeof sendTransactionalEmail;
  env: NodeJS.ProcessEnv;
  warn: typeof console.warn;
};

const productionAffiliatePayoutEmailDependencies: AffiliatePayoutEmailDependencies =
  {
    hasLoopsConfig,
    sendTransactionalEmail,
    env: process.env,
    warn: console.warn,
  };

type AffiliateEarnedEmailArgs = {
  affiliateEmail: string;
  affiliateName: string;
  commissionAmount: string | number;
};

type AffiliateWeeklyPayoutSentEmailArgs = {
  affiliateEmail: string;
  affiliateName: string;
  payoutAmount: string | number;
  payoutPeriod: string;
  currentTier: string;
  amountToNextTier: string | number | null;
  nextTier: string | null;
};

export function createAffiliatePayoutEmailSender(
  dependencies: Partial<AffiliatePayoutEmailDependencies> = {},
) {
  const deps = {
    ...productionAffiliatePayoutEmailDependencies,
    ...dependencies,
  };

  return {
    async sendAffiliateEarnedEmail(args: AffiliateEarnedEmailArgs) {
      if (!deps.hasLoopsConfig()) {
        deps.warn('Skipping affiliate earned email: Loops not configured.');
        return null;
      }

      const transactionalId =
        deps.env.LOOPS_TRANSACTIONAL_AFFILIATE_EARNED?.trim() ||
        DEFAULT_AFFILIATE_EARNED_TRANSACTIONAL_ID;

      return deps.sendTransactionalEmail({
        email: args.affiliateEmail,
        transactionalId,
        addToAudience: true,
        dataVariables: buildAffiliateEarnedEmailPayload(args),
      });
    },

    async sendAffiliateWeeklyPayoutSentEmail(
      args: AffiliateWeeklyPayoutSentEmailArgs,
    ) {
      if (!deps.hasLoopsConfig()) {
        deps.warn(
          'Skipping affiliate payout sent email: Loops not configured.',
        );
        return null;
      }

      const transactionalId =
        deps.env.LOOPS_TRANSACTIONAL_AFFILIATE_PAYOUT_SENT?.trim() ||
        DEFAULT_AFFILIATE_PAYOUT_SENT_TRANSACTIONAL_ID;

      return deps.sendTransactionalEmail({
        email: args.affiliateEmail,
        transactionalId,
        addToAudience: true,
        dataVariables: buildAffiliateWeeklyPayoutSentEmailPayload(args),
      });
    },
  };
}

const affiliatePayoutEmailSender = createAffiliatePayoutEmailSender();

export async function sendAffiliateEarnedEmail(args: AffiliateEarnedEmailArgs) {
  return affiliatePayoutEmailSender.sendAffiliateEarnedEmail(args);
}

export async function sendAffiliateWeeklyPayoutSentEmail(
  args: AffiliateWeeklyPayoutSentEmailArgs,
) {
  return affiliatePayoutEmailSender.sendAffiliateWeeklyPayoutSentEmail(args);
}
