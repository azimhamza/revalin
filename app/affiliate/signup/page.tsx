import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { Footer } from "@/components/layout/footer";
import { getServerSession } from "@/lib/auth-server";
import { isTemporarilyHiddenAppRoute } from "@/lib/account-destination";
import { getAffiliateByUserIdentity } from "@/lib/checkout/affiliate-service";
import {
  recordPromoterApplicationFromReferralCode,
  resolveApprovedPromoterReferralCode,
} from "@/lib/checkout/promoter-service";

import { AffiliateSignupForm } from "./affiliate-signup-form";

export const metadata = {
  title: "Growth Partner Application | Revalin",
  description:
    "Request Growth Partner access by submitting the social profiles the team should review.",
};

function getStatusCopy(status: string) {
  if (status === "approved") {
    return "Your referral route is approved. Open the Growth Partner dashboard to track visits, referrals, and payouts.";
  }

  if (status === "rejected") {
    return "Your last application was rejected. Contact support if you need the admin team to review a new submission.";
  }

  if (status === "suspended") {
    return "Your Growth Partner access is suspended right now. Contact support if you need the admin team to review the account.";
  }

  return "Your application is already in the admin approval queue. We’ll email you once the code and dashboard access are ready.";
}

function getFirstName(name?: string | null) {
  const normalized = name?.trim();
  if (!normalized) return null;
  return normalized.split(/\s+/)[0] || normalized;
}

export default async function AffiliateSignupPage({
  searchParams,
}: {
  searchParams?: Promise<{
    promoter?: string | string[] | undefined;
  }>;
}) {
  if (isTemporarilyHiddenAppRoute("/affiliate/signup")) {
    notFound();
  }

  const params = (await searchParams) || {};
  const promoterReferralCode = Array.isArray(params.promoter)
    ? params.promoter[0]
    : params.promoter;
  const promoterResolution = promoterReferralCode
    ? await resolveApprovedPromoterReferralCode(promoterReferralCode)
    : null;
  const promoterFirstName = getFirstName(promoterResolution?.promoter.name);
  const callbackPath = promoterReferralCode
    ? `/affiliate/signup?promoter=${encodeURIComponent(promoterReferralCode)}`
    : "/affiliate/signup";
  const session = await getServerSession();
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackPath)}`);
  }

  const affiliateRecord = session?.user
    ? await getAffiliateByUserIdentity({
        userId: session.user.id,
        email: session.user.email,
      })
    : null;
  const hasConfiguredWallet = Boolean(affiliateRecord?.walletAddress?.trim());

  if (
    affiliateRecord &&
    promoterReferralCode &&
    affiliateRecord.status !== "approved" &&
    affiliateRecord.status !== "rejected"
  ) {
    try {
      await recordPromoterApplicationFromReferralCode({
        referralCode: promoterReferralCode,
        affiliateId: affiliateRecord.id,
        applicantName: session.user.name,
        applicantEmail: session.user.email.toLowerCase(),
        socialProfiles: affiliateRecord.socialProfiles,
      });
    } catch (error) {
      console.error("[PROMOTER-AFFILIATE-SIGNUP-ATTRIBUTION]", error);
    }
  }

  if (affiliateRecord?.status === "approved") {
    redirect(
      hasConfiguredWallet
        ? "/affiliate/dashboard"
        : "/affiliate/dashboard#payout-settings",
    );
  }

  const existingApplicationTitle = "Application on file";

  return (
    <>
      <div className="min-h-screen md:grid md:grid-cols-2">
        <div className="flex min-h-screen flex-col justify-center bg-background px-sides py-16 md:justify-start md:px-10 md:pt-top-spacing lg:px-16">
          <div className="mx-auto w-full max-w-[440px] md:my-auto">
            <div className="mb-8 mt-10 md:mt-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                Growth Partner
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.02em]">Apply for access</h1>
            </div>

            <div className="rounded-[26px] border border-[#0B2E2F]/12 bg-card p-6 shadow-[0_20px_48px_rgba(11,46,47,0.05)]">
              {affiliateRecord ? (
                <div className="space-y-5">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                      Existing application
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                      {existingApplicationTitle}
                    </h2>
                  </div>

                  <div className="rounded-xl border border-border bg-background/70 p-4 text-sm leading-6 text-foreground/70">
                    {promoterFirstName ? (
                      <p className="mb-2 border-b border-border pb-2 text-xs text-foreground/60">
                        {promoterFirstName} invited you to join the Growth Partner Program.
                      </p>
                    ) : null}
                    <p>
                      Status:{" "}
                      <span className="font-semibold capitalize text-foreground">
                        {affiliateRecord.status}
                      </span>
                    </p>
                    <p className="mt-2">
                      {getStatusCopy(affiliateRecord.status)}
                    </p>
                    {affiliateRecord.socialProfiles.length ? (
                      <p className="mt-2">
                        Submitted social profiles:{" "}
                        <span className="font-semibold text-foreground">
                          {affiliateRecord.socialProfiles.length}
                        </span>
                      </p>
                    ) : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Link
                      href="/contact"
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#0B2E2F] bg-[#0B2E2F] px-5 text-sm font-semibold text-[#F4F1EA] transition-colors hover:bg-[#173d3e]"
                    >
                      Contact support
                      <ArrowRight className="size-4" />
                    </Link>
                    <Link
                      href="/account"
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-[#0B2E2F]/14 bg-[#FCFAF6] px-5 text-sm font-semibold text-[#0B2E2F] transition-colors hover:bg-[#F1EADB]"
                    >
                      Back to account
                    </Link>
                  </div>
                </div>
              ) : (
                <AffiliateSignupForm
                  initialName={session?.user?.name}
                  initialEmail={session?.user?.email}
                  promoterFirstName={promoterFirstName}
                />
              )}
            </div>

            <div className="mt-8 flex items-center gap-2.5 md:hidden">
              <ShieldCheck className="size-4 shrink-0 text-[#0B2E2F]/40" strokeWidth={1.5} />
              <p className="text-sm text-foreground/40">15%+ commission. Live dashboard. Weekly payouts.</p>
            </div>
          </div>
        </div>

        <div className="relative hidden overflow-hidden bg-[#0B2E2F] md:flex md:flex-col md:justify-between">
          <div className="relative z-10 flex flex-1 flex-col justify-end px-10 pb-20 lg:px-16">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#F4F1EA]/40">
              Revalin Growth Partner
            </p>
            <h2 className="mt-5 max-w-[16ch] text-[2.75rem] font-semibold leading-[1.04] tracking-[-0.04em] text-[#F4F1EA] lg:text-[3.5rem]">
              {promoterFirstName
                ? `${promoterFirstName} thinks you should apply as a Growth Partner.`
                : "Share your link. Earn on every sale."}
            </h2>
            <p className="mt-5 max-w-sm text-base leading-relaxed text-[#F4F1EA]/50">
              {promoterFirstName
                ? `${promoterFirstName} referred you. Submit your social profiles and the admin team will review your application.`
                : "Apply once, get a personal referral link, and track every conversion from a live dashboard."}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <div className="border border-white/10 bg-white/[0.04] px-4 py-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/40">Commission</p>
                <p className="mt-0.5 text-lg font-semibold tracking-tight text-[#F4F1EA]">15%+</p>
              </div>
              <div className="border border-white/10 bg-white/[0.04] px-4 py-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/40">Dashboard</p>
                <p className="mt-0.5 text-lg font-semibold tracking-tight text-[#F4F1EA]">Live tracking</p>
              </div>
              <div className="border border-white/10 bg-white/[0.04] px-4 py-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/40">Payouts</p>
                <p className="mt-0.5 text-lg font-semibold tracking-tight text-[#F4F1EA]">Weekly</p>
              </div>
            </div>
          </div>

          <div className="relative z-10 border-t border-white/8 px-10 py-5 lg:px-16">
            <p className="text-xs italic tracking-tight text-[#F4F1EA]/25">
              Applications are reviewed manually before partner codes go live.
            </p>
          </div>

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.02] via-transparent to-black/10" />
        </div>
      </div>
      <Footer />
    </>
  );
}
