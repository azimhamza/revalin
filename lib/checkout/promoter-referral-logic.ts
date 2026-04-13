/**
 * Pure logic for promoter referral flow decisions.
 * Extracted so it can be unit tested without DB or Next.js dependencies.
 */

import { DEFAULT_PROMOTER_COMMISSION_RATE } from "./promoter-math.ts";

export type AffiliateStatus = "pending" | "approved" | "rejected" | "suspended";

export type GrowRedirectInput = {
  isLoggedIn: boolean;
  affiliateStatus: AffiliateStatus | null;
  promoterCode: string;
  promoterFirstName: string;
};

export type GrowRedirectResult =
  | { destination: "affiliate_dashboard" }
  | { destination: "account_boost"; promoterCode: string }
  | { destination: "account_no_boost" }
  | { destination: "affiliate_signup"; promoterCode: string }
  | {
      destination: "signup";
      callbackUrl: string;
      promoterName: string;
    };

export function resolveGrowRedirect(
  input: GrowRedirectInput,
): GrowRedirectResult {
  if (input.isLoggedIn) {
    if (input.affiliateStatus === "approved") {
      return { destination: "affiliate_dashboard" };
    }

    if (
      input.affiliateStatus !== null &&
      input.affiliateStatus !== "approved" &&
      input.affiliateStatus !== "rejected"
    ) {
      return {
        destination: "account_boost",
        promoterCode: input.promoterCode,
      };
    }

    if (input.affiliateStatus === "rejected") {
      return { destination: "account_no_boost" };
    }

    return {
      destination: "affiliate_signup",
      promoterCode: input.promoterCode,
    };
  }

  return {
    destination: "signup",
    callbackUrl: `/affiliate/signup?promoter=${encodeURIComponent(input.promoterCode)}`,
    promoterName: input.promoterFirstName,
  };
}

export type BoostDialogInput = {
  promoterBoostCode: string | null;
  affiliateStatus: AffiliateStatus | null;
  linkResult: { linked: boolean } | null;
};

export function shouldShowBoostDialog(input: BoostDialogInput): boolean {
  if (!input.promoterBoostCode) return false;
  if (input.affiliateStatus === null) return false;
  if (input.affiliateStatus === "approved") return false;
  if (input.affiliateStatus === "rejected") return false;
  if (!input.linkResult?.linked) return false;
  return true;
}

export type AutoActivationCommissionInput = {
  inviteCommissionRate: string | null;
  promoterDefaultCommissionRate: string | null;
};

export function resolveAutoActivationCommissionRate(
  input: AutoActivationCommissionInput,
): string {
  return (
    input.inviteCommissionRate ||
    input.promoterDefaultCommissionRate ||
    DEFAULT_PROMOTER_COMMISSION_RATE
  );
}

export function getFirstName(name?: string | null): string | null {
  const normalized = name?.trim();
  if (!normalized) return null;
  return normalized.split(/\s+/)[0] || normalized;
}
