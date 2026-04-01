import { hasLoopsConfig, sendTransactionalEmail } from "@/lib/email/loops";

function getSiteUrl() {
  const explicit =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim();
  if (!explicit) return "https://revalin.ca";
  return explicit.replace(/\/$/, "");
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
    process.env.LOOPS_TRANSACTIONAL_AFFILIATE_APPROVED?.trim();
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
