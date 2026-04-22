import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Shield, Wallet } from "lucide-react";

import { PageLayout } from "@/components/layout/page-layout";
import { getServerSession } from "@/lib/auth-server";
import { isTemporarilyHiddenAppRoute } from "@/lib/account-destination";
import { getAffiliateByUserIdentity } from "@/lib/checkout/affiliate-service";
import { hasCompletePayoutDestination } from "@/lib/checkout/payout-methods";

import { AffiliateNav } from "./_components/affiliate-nav";
import { AffiliateSetupToast } from "./_components/affiliate-setup-toast";
import {
  AffiliatePanel,
  affiliatePrimaryButtonClass,
  affiliateSecondaryButtonClass,
} from "./_components/affiliate-shell";

function getAffiliateSetupToastState(args: {
  affiliateRecord: Awaited<ReturnType<typeof getAffiliateByUserIdentity>>;
  hasPayoutDestination: boolean;
  role: string | null | undefined;
  userId?: string | null;
}) {
  if (!args.userId || args.role === "admin") {
    return null;
  }

  const messages: string[] = [];
  let actionHref: string | undefined;
  let actionLabel: string | undefined;

  if (!args.affiliateRecord) {
    messages.push(
      "This account can open the Growth Partner area, but the partner record is not linked yet. If you were already approved, the team needs to finish linking the record before payouts and reporting can load.",
    );
    actionHref = "/contact";
    actionLabel = "Contact support";
  } else {
    if (args.affiliateRecord.status !== "approved") {
      messages.push(
        args.affiliateRecord.status === "pending"
          ? "Your Growth Partner application is still pending approval."
          : args.affiliateRecord.status === "rejected"
            ? "Your Growth Partner application needs another review before live reporting can load."
            : "Your Growth Partner access is currently suspended.",
      );
      actionHref = "/affiliate/signup";
      actionLabel = "Open application";
    }

    if (!args.hasPayoutDestination) {
      messages.push(
        "Add payout details so the team can send approved payouts.",
      );
      if (!actionHref) {
        actionHref = "/affiliate/dashboard#payout-settings";
        actionLabel = "Set payout details";
      }
    }

    if (!args.affiliateRecord.discountCode) {
      messages.push("Your discount code is still being assigned.");
    }
  }

  if (!messages.length) {
    return null;
  }

  const stateKey = [
    args.userId,
    args.affiliateRecord ? "record" : "missing-record",
    args.affiliateRecord?.status ?? "none",
    args.hasPayoutDestination ? "payout" : "no-payout",
    args.affiliateRecord?.discountCode ? "discount" : "no-discount",
  ].join(":");

  const title = !args.affiliateRecord
    ? "Partner record needed"
    : !args.hasPayoutDestination && args.affiliateRecord.status === "approved"
      ? "Set payout details"
      : "Growth Partner update";

  return {
    title,
    description: messages.join(" "),
    storageKey: stateKey,
    actionHref,
    actionLabel,
  };
}

export default async function AffiliateDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (isTemporarilyHiddenAppRoute("/affiliate/dashboard")) {
    notFound();
  }

  const session = await getServerSession();

  if (!session?.user) {
    redirect("/login?callbackUrl=/affiliate/dashboard");
  }

  const affiliateRecord = await getAffiliateByUserIdentity({
    userId: session.user.id,
    email: session.user.email,
  });
  const role = (session.user as any)?.role;
  const canOpenDashboard =
    role === "affiliate" ||
    role === "admin" ||
    affiliateRecord?.status === "approved";

  if (!canOpenDashboard) {
    redirect(affiliateRecord ? "/affiliate/signup" : "/account");
  }

  const hasPayoutDestination = affiliateRecord
    ? hasCompletePayoutDestination({
        payoutMethod: affiliateRecord.payoutMethod,
        walletAddress: affiliateRecord.walletAddress,
        achAccountHolderName: affiliateRecord.achAccountHolderName,
        achBankName: affiliateRecord.achBankName,
        achAccountType: affiliateRecord.achAccountType,
        achRoutingNumberLast4: affiliateRecord.achRoutingNumberLast4,
        achAccountNumberLast4: affiliateRecord.achAccountNumberLast4,
      })
    : false;
  const primaryActionHref = affiliateRecord
    ? "/affiliate/dashboard#payout-settings"
    : "/contact";
  const primaryActionLabel = affiliateRecord
    ? hasPayoutDestination
      ? "Payout settings"
      : "Set payout details"
    : "Contact support";
  const showWorkspace = Boolean(affiliateRecord) || role === "admin";
  const setupToast = getAffiliateSetupToastState({
    affiliateRecord,
    hasPayoutDestination,
    role,
    userId: session.user.id,
  });

  return (
    <PageLayout>
      <div className="px-sides pt-top-spacing pb-12">
        <div className="mx-auto max-w-[1520px] space-y-3">
          {setupToast ? <AffiliateSetupToast {...setupToast} /> : null}

          <AffiliatePanel
            tone="inverse"
            className="relative overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_28%),linear-gradient(155deg,#0B2E2F_0%,#123B3D_100%)] p-0"
          >
            <div className="flex flex-col gap-3.5 px-3.5 py-3.5 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/48">
                  Growth Partner
                </p>
                <h1 className="text-[1.35rem] font-semibold tracking-[-0.04em] text-[#F4F1EA]">
                  Growth Partner dashboard
                </h1>
                <p className="max-w-3xl text-[12px] leading-5 text-[#F4F1EA]/70">
                  {affiliateRecord
                    ? "Track referrals, manage your payout wallet, and review commissions in one place."
                    : "If this account was already assigned as a Growth Partner, do not submit another application. The team still needs to link the partner record used for reporting and payouts."}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href="/account"
                  className={`inline-flex items-center justify-center gap-2 ${affiliateSecondaryButtonClass}`}
                >
                  <ArrowLeft className="size-4" />
                  Back to account
                </Link>
                <Link
                  href={primaryActionHref}
                  className={`inline-flex items-center justify-center gap-2 ${affiliatePrimaryButtonClass}`}
                >
                  <Wallet className="size-4" />
                  {primaryActionLabel}
                </Link>
                {role === "admin" ? (
                  <Link
                    href="/admin"
                    className={`inline-flex items-center justify-center gap-2 ${affiliateSecondaryButtonClass}`}
                  >
                    <Shield className="size-4" />
                    Open admin
                  </Link>
                ) : null}
              </div>
            </div>
          </AffiliatePanel>

          {showWorkspace ? (
            <div className="grid gap-3 xl:grid-cols-[190px_minmax(0,1fr)]">
              <aside className="space-y-2">
                <AffiliateNav />
              </aside>

              <div className="min-w-0">{children}</div>
            </div>
          ) : (
            <div className="min-w-0">{children}</div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
