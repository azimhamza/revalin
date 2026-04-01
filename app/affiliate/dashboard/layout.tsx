import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Shield, Wallet, WalletCards } from "lucide-react";

import { PageLayout } from "@/components/layout/page-layout";
import { getServerSession } from "@/lib/auth-server";
import { isTemporarilyHiddenAppRoute } from "@/lib/account-destination";
import { getAffiliateByUserIdentity } from "@/lib/checkout/affiliate-service";

import { AffiliateNav } from "./_components/affiliate-nav";
import {
  affiliateDarkPanelClass,
  affiliateInsetClass,
  affiliatePrimaryButtonClass,
  affiliateSecondaryButtonClass,
  affiliateStatusChipClass,
  getAffiliateStatusClasses,
} from "./_components/affiliate-shell";
import { formatWalletPreview, getConfiguredWallet } from "./wallet-utils";

export default async function AffiliateDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (isTemporarilyHiddenAppRoute("/affiliate/dashboard")) {
    notFound();
  }

  const session = await getServerSession();
  const role = (session?.user as any)?.role;

  if (!session?.user || (role !== "affiliate" && role !== "admin")) {
    redirect("/login?callbackUrl=/affiliate/dashboard");
  }

  const affiliateRecord = await getAffiliateByUserIdentity({
    userId: session.user.id,
    email: session.user.email,
  });
  const walletPreview = formatWalletPreview(affiliateRecord?.walletAddress);
  const hasWallet = Boolean(getConfiguredWallet(affiliateRecord?.walletAddress));
  const primaryActionHref = affiliateRecord
    ? "/affiliate/dashboard/wallet"
    : "/affiliate/signup";
  const primaryActionLabel = affiliateRecord
    ? hasWallet
      ? "Wallet settings"
      : "Connect wallet"
    : "Complete setup";
  const showWorkspace = Boolean(affiliateRecord) || role === "admin";

  return (
    <PageLayout>
      <div className="px-sides pt-top-spacing pb-16">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="relative overflow-hidden border border-[#0B2E2F]/12 bg-[linear-gradient(135deg,#E7E1D3_0%,#F4F1EA_56%,#DDE7E0_100%)] px-6 py-7 shadow-[0_20px_80px_rgba(11,46,47,0.08)] sm:px-8 sm:py-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(11,46,47,0.10),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.9),transparent_38%)]" />

            <div className="relative grid gap-8 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#0B2E2F]/46">
                  Growth Partner
                </p>
                <h1 className="mt-2 text-[2.2rem] font-semibold tracking-[-0.04em] text-[#0B2E2F] sm:text-[2.8rem]">
                  Growth Partner dashboard
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[#0B2E2F]/68 sm:text-base">
                  {affiliateRecord
                    ? "OpenPanel telemetry, referral orders, wallet setup, and payout operations stay in one place."
                    : "This account can open the Growth Partner area, but the partner record still needs to be linked before the full workspace is available."}
                </p>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href="/account"
                    className={`inline-flex h-11 items-center justify-center gap-2 px-5 text-sm font-semibold ${affiliateSecondaryButtonClass}`}
                  >
                    <ArrowLeft className="size-4" />
                    Back to account
                  </Link>
                  <Link
                    href={primaryActionHref}
                    className={`inline-flex h-11 items-center justify-center gap-2 px-5 text-sm font-semibold ${affiliatePrimaryButtonClass}`}
                  >
                    <Wallet className="size-4" />
                    {primaryActionLabel}
                  </Link>
                  {role === "admin" ? (
                    <Link
                      href="/admin"
                      className={`inline-flex h-11 items-center justify-center gap-2 px-5 text-sm font-semibold ${affiliateSecondaryButtonClass}`}
                    >
                      <Shield className="size-4" />
                      Open admin
                    </Link>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className={`${affiliateInsetClass} p-4`}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0B2E2F]/46">
                    Partner snapshot
                  </p>
                  <div className="mt-3 grid gap-3 text-sm">
                    <div className="flex items-center justify-between gap-3 text-[#0B2E2F]">
                      <span className="text-[#0B2E2F]/58">Code</span>
                      <span className="font-mono font-semibold">
                        {affiliateRecord?.code || "Not linked"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-[#0B2E2F]">
                      <span className="text-[#0B2E2F]/58">Status</span>
                      {affiliateRecord ? (
                        <span
                          className={`${affiliateStatusChipClass} ${getAffiliateStatusClasses(affiliateRecord.status)}`}
                        >
                          {affiliateRecord.status}
                        </span>
                      ) : (
                        <span className="font-semibold">Setup required</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3 text-[#0B2E2F]">
                      <span className="text-[#0B2E2F]/58">Wallet</span>
                      <span className="font-mono font-semibold">
                        {walletPreview}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-[#0B2E2F]">
                      <span className="text-[#0B2E2F]/58">Discount</span>
                      <span className="font-mono font-semibold">
                        {affiliateRecord?.discountCode || "Pending"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className={`${affiliateDarkPanelClass} p-4`}>
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#F4F1EA]">
                    <WalletCards className="size-4" />
                    Workspace focus
                  </div>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-[#F4F1EA]/74">
                    {affiliateRecord ? (
                      <>
                        <p>Overview tracks OpenPanel traffic, conversions, and order performance.</p>
                        <p>Wallet settings control where approved USDC payouts are sent.</p>
                        <p>Payout ledger shows commission state and transaction history.</p>
                      </>
                    ) : (
                      <>
                        <p>Finish linking the partner record before this workspace can load live affiliate data.</p>
                        <p>Once linked, the overview, wallet, and payout sections will populate automatically.</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {showWorkspace ? (
            <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">
              <aside className="space-y-3">
                <div className={`${affiliateInsetClass} px-4 py-3`}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/46">
                    Sections
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[#0B2E2F]">
                    Overview, wallet, and payouts
                  </p>
                </div>

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
