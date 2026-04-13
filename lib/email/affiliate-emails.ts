import { hasLoopsConfig, sendTransactionalEmail } from "@/lib/email/loops";

const DEFAULT_AFFILIATE_APPROVAL_TRANSACTIONAL_ID = "cmnhzqj3z02jx0i31crzp740f";
const DEFAULT_AFFILIATE_REMOVAL_TRANSACTIONAL_ID = "cmnj8xa4300eb0ivwkioll82w";
const DEFAULT_AFFILIATE_REINSTATEMENT_TRANSACTIONAL_ID =
  "cmnj9xaj2009e0i1dgya1lguq";
const DEFAULT_AFFILIATE_APPLICATION_TRANSACTIONAL_ID =
  "cmnmb8o0s00b40iuq46qek8jv";

function getSiteUrl() {
  const explicit =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim();
  if (!explicit) return "https://revalin.ca";
  return explicit.replace(/\/$/, "");
}

function getFirstName(name: string) {
  const normalized = name.trim();
  if (!normalized) return "there";
  return normalized.split(/\s+/)[0] || normalized;
}

export async function sendAffiliateApplicationReceivedEmail(args: {
  applicantName?: string | null;
  applicantEmail: string;
}) {
  if (!hasLoopsConfig()) {
    console.warn(
      "Skipping affiliate application email: Loops not configured.",
    );
    return null;
  }

  const transactionalId =
    process.env.LOOPS_TRANSACTIONAL_AFFILIATE_APPLICATION_RECEIVED?.trim() ||
    DEFAULT_AFFILIATE_APPLICATION_TRANSACTIONAL_ID;
  if (!transactionalId) {
    console.warn(
      "Skipping affiliate application email: LOOPS_TRANSACTIONAL_AFFILIATE_APPLICATION_RECEIVED not set.",
    );
    return null;
  }

  const firstNameSource =
    args.applicantName?.trim() ||
    args.applicantEmail.split("@")[0] ||
    "Applicant";

  return sendTransactionalEmail({
    email: args.applicantEmail,
    transactionalId,
    addToAudience: true,
    dataVariables: {
      first_name: getFirstName(firstNameSource),
    },
  });
}

export async function sendAffiliateApprovalEmail(args: {
  affiliateName: string;
  affiliateEmail: string;
  affiliateCode: string;
  discountCode: string;
  discountPercent: string;
}) {
  if (!hasLoopsConfig()) {
    console.warn("Skipping affiliate approval email: Loops not configured.");
    return null;
  }

  const transactionalId =
    process.env.LOOPS_TRANSACTIONAL_AFFILIATE_APPROVED?.trim() ||
    DEFAULT_AFFILIATE_APPROVAL_TRANSACTIONAL_ID;
  if (!transactionalId) {
    console.warn(
      "Skipping affiliate approval email: LOOPS_TRANSACTIONAL_AFFILIATE_APPROVED not set.",
    );
    return null;
  }

  const siteUrl = getSiteUrl();
  const referralLink = `${siteUrl}/${args.affiliateCode}`;
  const checkoutLink = `${siteUrl}/checkout?discount=${encodeURIComponent(args.discountCode)}`;

  return sendTransactionalEmail({
    email: args.affiliateEmail,
    transactionalId,
    addToAudience: true,
    dataVariables: {
      PARTNER_CODE: args.affiliateCode,
      REFERRAL_LINK: referralLink,
      affiliateName: args.affiliateName,
      affiliateEmail: args.affiliateEmail,
      affiliateCode: args.affiliateCode,
      discountCode: args.discountCode,
      discountPercent: args.discountPercent,
      referralLink,
      checkoutLink,
    },
  });
}

export async function sendAffiliateRemovalEmail(args: {
  affiliateName: string;
  affiliateEmail: string;
  removalReason?: string | null;
  suspensionReason?: string | null;
}) {
  if (!hasLoopsConfig()) {
    console.warn("Skipping affiliate removal email: Loops not configured.");
    return null;
  }

  const transactionalId =
    process.env.LOOPS_TRANSACTIONAL_AFFILIATE_REMOVED?.trim() ||
    DEFAULT_AFFILIATE_REMOVAL_TRANSACTIONAL_ID;
  if (!transactionalId) {
    console.warn(
      "Skipping affiliate removal email: LOOPS_TRANSACTIONAL_AFFILIATE_REMOVED not set.",
    );
    return null;
  }

  return sendTransactionalEmail({
    email: args.affiliateEmail,
    transactionalId,
    addToAudience: true,
    dataVariables: {
      first_name: getFirstName(args.affiliateName),
      removal_reason:
        args.removalReason?.trim() || "Your Growth Partner access was removed.",
      suspension_reason:
        args.suspensionReason?.trim() ||
        "Your Growth Partner access is currently suspended.",
    },
  });
}

export async function sendAffiliateReinstatementEmail(args: {
  affiliateName: string;
  affiliateEmail: string;
  affiliateCode: string;
  reinstatementReason?: string | null;
}) {
  if (!hasLoopsConfig()) {
    console.warn(
      "Skipping affiliate reinstatement email: Loops not configured.",
    );
    return null;
  }

  const transactionalId =
    process.env.LOOPS_TRANSACTIONAL_AFFILIATE_REINSTATED?.trim() ||
    DEFAULT_AFFILIATE_REINSTATEMENT_TRANSACTIONAL_ID;
  if (!transactionalId) {
    console.warn(
      "Skipping affiliate reinstatement email: LOOPS_TRANSACTIONAL_AFFILIATE_REINSTATED not set.",
    );
    return null;
  }

  const siteUrl = getSiteUrl();
  const referralLink = `${siteUrl}/${args.affiliateCode}`;

  return sendTransactionalEmail({
    email: args.affiliateEmail,
    transactionalId,
    addToAudience: true,
    dataVariables: {
      first_name: getFirstName(args.affiliateName),
      reinstatement_reason:
        args.reinstatementReason?.trim() ||
        "Your Growth Partner access has been reinstated.",
      PARTNER_CODE: args.affiliateCode,
      REFERRAL_LINK: referralLink,
    },
  });
}
