import { hasLoopsConfig, sendTransactionalEmail } from '@/lib/email/loops';
import {
  buildPromoterApplicationReceivedEmailPayload,
  buildPromoterApprovalEmailPayload,
  buildPromoterEarnedEmailPayload,
  buildPromoterRemovalEmailPayload,
  buildPromoterReferralLinkUpdatedEmailPayload,
  buildPromoterReinstatementEmailPayload,
  buildPromoterWeeklyPayoutSentEmailPayload,
} from '@/lib/email/promoter-email-payloads';

const DEFAULT_PROMOTER_APPLICATION_TRANSACTIONAL_ID =
  'cmnsxr0zc00j70h0q3beqenib';
const DEFAULT_PROMOTER_APPROVED_TRANSACTIONAL_ID =
  'cmnusjnuo0aso0i108dq551r4';
const DEFAULT_PROMOTER_INVITE_TRANSACTIONAL_ID = '';
const DEFAULT_PROMOTER_EARNED_TRANSACTIONAL_ID = 'cmnsxg5t70lhm0iyeq1wrjnyl';
const DEFAULT_PROMOTER_PAYOUT_SENT_TRANSACTIONAL_ID =
  'cmnusewzm0fkl0izt45gzip8i';
const DEFAULT_PROMOTER_REMOVAL_TRANSACTIONAL_ID = 'cmnusz5st0bib0izblw6h36rw';
const DEFAULT_PROMOTER_REINSTATEMENT_TRANSACTIONAL_ID =
  'cmnsxq49d00h90i1ff0r549e0';
const DEFAULT_PROMOTER_REFERRAL_LINK_UPDATED_TRANSACTIONAL_ID =
  'cmnut8yjo0byx0izbkc9i6pe9';

type PromoterPayoutEmailDependencies = {
  hasLoopsConfig: typeof hasLoopsConfig;
  sendTransactionalEmail: typeof sendTransactionalEmail;
  env: NodeJS.ProcessEnv;
  warn: typeof console.warn;
};

const productionPromoterPayoutEmailDependencies: PromoterPayoutEmailDependencies =
  {
    hasLoopsConfig,
    sendTransactionalEmail,
    env: process.env,
    warn: console.warn,
  };

function getFirstName(name?: string | null) {
  const normalized = name?.trim();
  if (!normalized) return 'there';
  return normalized.split(/\s+/)[0] || normalized;
}

export async function sendPromoterApplicationReceivedEmail(args: {
  applicantName?: string | null;
  applicantEmail: string;
}) {
  if (!hasLoopsConfig()) {
    console.warn('Skipping promoter application email: Loops not configured.');
    return null;
  }

  const transactionalId =
    process.env.LOOPS_TRANSACTIONAL_PROMOTER_APPLICATION_RECEIVED?.trim() ||
    DEFAULT_PROMOTER_APPLICATION_TRANSACTIONAL_ID;
  if (!transactionalId) {
    console.warn(
      'Skipping promoter application email: LOOPS_TRANSACTIONAL_PROMOTER_APPLICATION_RECEIVED not set.',
    );
    return null;
  }

  return sendTransactionalEmail({
    email: args.applicantEmail,
    transactionalId,
    addToAudience: true,
    dataVariables: buildPromoterApplicationReceivedEmailPayload(args),
  });
}

export async function sendPromoterApprovalEmail(args: {
  promoterEmail: string;
  promoterName?: string | null;
  referralLink: string;
}) {
  if (!hasLoopsConfig()) {
    console.warn('Skipping promoter approval email: Loops not configured.');
    return null;
  }

  const transactionalId =
    process.env.LOOPS_TRANSACTIONAL_PROMOTER_APPROVED?.trim() ||
    DEFAULT_PROMOTER_APPROVED_TRANSACTIONAL_ID;
  if (!transactionalId) {
    console.warn(
      'Skipping promoter approval email: LOOPS_TRANSACTIONAL_PROMOTER_APPROVED not set.',
    );
    return null;
  }

  return sendTransactionalEmail({
    email: args.promoterEmail,
    transactionalId,
    addToAudience: true,
    dataVariables: buildPromoterApprovalEmailPayload(args),
  });
}

export async function sendPromoterGrowthPartnerInviteEmail(args: {
  invitedEmail: string;
  invitedName?: string | null;
  promoterName: string;
  signupLink: string;
}) {
  if (!hasLoopsConfig()) {
    console.warn('Skipping promoter invite email: Loops not configured.');
    return null;
  }

  const transactionalId =
    process.env.LOOPS_TRANSACTIONAL_PROMOTER_GROWTH_PARTNER_INVITE?.trim() ||
    DEFAULT_PROMOTER_INVITE_TRANSACTIONAL_ID;
  if (!transactionalId) {
    console.warn(
      'Skipping promoter invite email: LOOPS_TRANSACTIONAL_PROMOTER_GROWTH_PARTNER_INVITE not set.',
    );
    return null;
  }

  return sendTransactionalEmail({
    email: args.invitedEmail,
    transactionalId,
    addToAudience: true,
    dataVariables: {
      first_name: getFirstName(args.invitedName),
      promoter_name: args.promoterName,
      signup_link: args.signupLink,
    },
  });
}

export async function sendPromoterEarnedEmail(args: {
  promoterEmail: string;
  promoterName: string;
  commissionAmount: string | number;
  growthPartnerName?: string | null;
}) {
  if (!hasLoopsConfig()) {
    console.warn('Skipping promoter earned email: Loops not configured.');
    return null;
  }

  const transactionalId =
    process.env.LOOPS_TRANSACTIONAL_PROMOTER_EARNED?.trim() ||
    DEFAULT_PROMOTER_EARNED_TRANSACTIONAL_ID;
  if (!transactionalId) {
    console.warn(
      'Skipping promoter earned email: LOOPS_TRANSACTIONAL_PROMOTER_EARNED not set.',
    );
    return null;
  }

  return sendTransactionalEmail({
    email: args.promoterEmail,
    transactionalId,
    addToAudience: true,
    dataVariables: buildPromoterEarnedEmailPayload(args),
  });
}

export async function sendPromoterWeeklyPayoutSentEmail(args: {
  promoterEmail: string;
  promoterName: string;
  payoutAmount: string | number;
  payoutPeriod: string;
}) {
  if (!hasLoopsConfig()) {
    console.warn('Skipping promoter payout sent email: Loops not configured.');
    return null;
  }

  const transactionalId =
    process.env.LOOPS_TRANSACTIONAL_PROMOTER_PAYOUT_SENT?.trim() ||
    DEFAULT_PROMOTER_PAYOUT_SENT_TRANSACTIONAL_ID;
  if (!transactionalId) {
    console.warn(
      'Skipping promoter payout sent email: LOOPS_TRANSACTIONAL_PROMOTER_PAYOUT_SENT not set.',
    );
    return null;
  }

  return sendTransactionalEmail({
    email: args.promoterEmail,
    transactionalId,
    addToAudience: true,
    dataVariables: buildPromoterWeeklyPayoutSentEmailPayload(args),
  });
}

export function createPromoterPayoutEmailSender(
  dependencies: Partial<PromoterPayoutEmailDependencies> = {},
) {
  const deps = {
    ...productionPromoterPayoutEmailDependencies,
    ...dependencies,
  };

  return {
    async sendPromoterEarnedEmail(args: {
      promoterEmail: string;
      promoterName: string;
      commissionAmount: string | number;
      growthPartnerName?: string | null;
    }) {
      if (!deps.hasLoopsConfig()) {
        deps.warn('Skipping promoter earned email: Loops not configured.');
        return null;
      }

      const transactionalId =
        deps.env.LOOPS_TRANSACTIONAL_PROMOTER_EARNED?.trim() ||
        DEFAULT_PROMOTER_EARNED_TRANSACTIONAL_ID;
      if (!transactionalId) {
        deps.warn(
          'Skipping promoter earned email: LOOPS_TRANSACTIONAL_PROMOTER_EARNED not set.',
        );
        return null;
      }

      return deps.sendTransactionalEmail({
        email: args.promoterEmail,
        transactionalId,
        addToAudience: true,
        dataVariables: buildPromoterEarnedEmailPayload(args),
      });
    },

    async sendPromoterWeeklyPayoutSentEmail(args: {
      promoterEmail: string;
      promoterName: string;
      payoutAmount: string | number;
      payoutPeriod: string;
    }) {
      if (!deps.hasLoopsConfig()) {
        deps.warn('Skipping promoter payout sent email: Loops not configured.');
        return null;
      }

      const transactionalId =
        deps.env.LOOPS_TRANSACTIONAL_PROMOTER_PAYOUT_SENT?.trim() ||
        DEFAULT_PROMOTER_PAYOUT_SENT_TRANSACTIONAL_ID;
      if (!transactionalId) {
        deps.warn(
          'Skipping promoter payout sent email: LOOPS_TRANSACTIONAL_PROMOTER_PAYOUT_SENT not set.',
        );
        return null;
      }

      return deps.sendTransactionalEmail({
        email: args.promoterEmail,
        transactionalId,
        addToAudience: true,
        dataVariables: buildPromoterWeeklyPayoutSentEmailPayload(args),
      });
    },
  };
}

export async function sendPromoterReinstatementEmail(args: {
  promoterEmail: string;
  promoterName?: string | null;
  reinstatementReason?: string | null;
}) {
  if (!hasLoopsConfig()) {
    console.warn(
      'Skipping promoter reinstatement email: Loops not configured.',
    );
    return null;
  }

  const transactionalId =
    process.env.LOOPS_TRANSACTIONAL_PROMOTER_REINSTATED?.trim() ||
    DEFAULT_PROMOTER_REINSTATEMENT_TRANSACTIONAL_ID;
  if (!transactionalId) {
    console.warn(
      'Skipping promoter reinstatement email: LOOPS_TRANSACTIONAL_PROMOTER_REINSTATED not set.',
    );
    return null;
  }

  return sendTransactionalEmail({
    email: args.promoterEmail,
    transactionalId,
    addToAudience: true,
    dataVariables: buildPromoterReinstatementEmailPayload(args),
  });
}

export async function sendPromoterRemovalEmail(args: {
  promoterEmail: string;
  promoterName?: string | null;
  removalReason?: string | null;
  status?: 'rejected' | 'suspended';
}) {
  if (!hasLoopsConfig()) {
    console.warn('Skipping promoter removal email: Loops not configured.');
    return null;
  }

  const transactionalId =
    (args.status === 'suspended'
      ? process.env.LOOPS_TRANSACTIONAL_PROMOTER_SUSPENDED?.trim()
      : process.env.LOOPS_TRANSACTIONAL_PROMOTER_REMOVED?.trim()) ||
    process.env.LOOPS_TRANSACTIONAL_PROMOTER_REMOVED?.trim() ||
    process.env.LOOPS_TRANSACTIONAL_PROMOTER_SUSPENDED?.trim() ||
    DEFAULT_PROMOTER_REMOVAL_TRANSACTIONAL_ID;
  if (!transactionalId) {
    console.warn(
      'Skipping promoter removal email: LOOPS_TRANSACTIONAL_PROMOTER_REMOVED not set.',
    );
    return null;
  }

  return sendTransactionalEmail({
    email: args.promoterEmail,
    transactionalId,
    addToAudience: true,
    dataVariables: buildPromoterRemovalEmailPayload(args),
  });
}

export async function sendPromoterReferralLinkUpdatedEmail(args: {
  promoterEmail: string;
  promoterName?: string | null;
  oldReferralLink: string;
  newReferralLink: string;
}) {
  if (!hasLoopsConfig()) {
    console.warn('Skipping promoter link update email: Loops not configured.');
    return null;
  }

  const transactionalId =
    process.env.LOOPS_TRANSACTIONAL_PROMOTER_REFERRAL_LINK_UPDATED?.trim() ||
    DEFAULT_PROMOTER_REFERRAL_LINK_UPDATED_TRANSACTIONAL_ID;
  if (!transactionalId) {
    console.warn(
      'Skipping promoter link update email: LOOPS_TRANSACTIONAL_PROMOTER_REFERRAL_LINK_UPDATED not set.',
    );
    return null;
  }

  return sendTransactionalEmail({
    email: args.promoterEmail,
    transactionalId,
    addToAudience: true,
    dataVariables: buildPromoterReferralLinkUpdatedEmailPayload(args),
  });
}
