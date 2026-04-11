import Link from "next/link";
import {
  ArrowRight,
  ClipboardCheck,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";
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
            <div className="mt-10 mb-8 rounded-xl border border-[#0B2E2F]/12 bg-[#0B2E2F] px-4 py-3.5 md:hidden">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-semibold text-[#F4F1EA]">
                  Growth Partner Program
                </p>
                <div className="flex gap-3">
                  <div className="text-center">
                    <p className="text-[9px] uppercase tracking-[0.12em] text-[#F4F1EA]/40">
                      Commission
                    </p>
                    <p className="text-sm font-semibold text-[#F4F1EA]">10%+</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] uppercase tracking-[0.12em] text-[#F4F1EA]/40">
                      Access
                    </p>
                    <p className="text-sm font-semibold text-[#F4F1EA]">
                      Live dashboard
                    </p>
                  </div>
                </div>
              </div>
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

            <div className="mt-8 space-y-3 md:hidden">
              {[
                {
                  icon: ClipboardCheck,
                  text: "Apply with the channels you already use to reach serious researchers",
                },
                {
                  icon: WalletCards,
                  text: "Set your payout wallet and manage commissions once your account is approved",
                },
                {
                  icon: ShieldCheck,
                  text: "Use the same email for your application and dashboard access",
                },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[#0B2E2F]/12 bg-[#F4F1EA]/70">
                    <item.icon
                      className="size-3.5 text-[#0B2E2F]/60"
                      strokeWidth={1.5}
                    />
                  </div>
                  <p className="text-sm text-foreground/50">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative hidden overflow-hidden bg-[#0B2E2F] md:flex md:flex-col md:justify-between">
          <div className="relative z-10 flex flex-1 flex-col justify-start px-10 pt-16 md:pt-[calc(var(--top-spacing)-0.75rem)] lg:px-16">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#F4F1EA]/50">
              Revalin Growth Partner
            </p>
            <h2 className="mt-4 text-[1.85rem] font-semibold leading-[1.08] tracking-[-0.03em] text-[#F4F1EA] lg:text-[2.2rem]">
              Apply once. Share your link. Track every referral.
            </h2>

            <div className="mt-8 flex flex-wrap gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/40">
                  Commission
                </p>
                <p className="mt-1 text-xl font-semibold tracking-tight text-[#F4F1EA]">
                  10%+
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/40">
                  Approval
                </p>
                <p className="mt-1 text-xl font-semibold tracking-tight text-[#F4F1EA]">
                  Team review
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/40">
                  Dashboard
                </p>
                <p className="mt-1 text-xl font-semibold tracking-tight text-[#F4F1EA]">
                  Live tracking
                </p>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-4">
              {[
                {
                  icon: Users,
                  text: "List the channels or communities you want the team to review",
                },
                {
                  icon: ClipboardCheck,
                  text: "Applications are reviewed manually before approval goes live",
                },
                {
                  icon: WalletCards,
                  text: "Use the same account email so access is linked cleanly",
                },
                {
                  icon: ShieldCheck,
                  text: "Add your payout wallet after approval from the dashboard",
                },
              ].map((item) => (
                <div key={item.text} className="flex items-start gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5">
                    <item.icon
                      className="size-3.5 text-[#F4F1EA]/70"
                      strokeWidth={1.5}
                    />
                  </div>
                  <p className="text-[13px] leading-5 text-[#F4F1EA]/55">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 border-t border-white/8 px-10 py-5 lg:px-16">
            <p className="text-[11px] italic tracking-tight text-[#F4F1EA]/30">
              Applications are reviewed manually before partner codes and
              referral routes go live.
            </p>
          </div>

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-black/10" />
        </div>
      </div>
      <Footer />
    </>
  );
}
