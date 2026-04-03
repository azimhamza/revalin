import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ArrowRight, Wallet, WalletCards } from "lucide-react";

import { getServerSession } from "@/lib/auth-server";
import { getAffiliateByUserIdentity } from "@/lib/checkout/affiliate-service";
import { getAffiliateCommissionOverview } from "@/lib/checkout/commission-service";
import { getAffiliateVisitSummary } from "@/lib/checkout/affiliate-visit-service";
import { getPayoutsForAffiliate } from "@/lib/checkout/payout-service";
import { db } from "@/lib/db";
import { affiliatePayouts, checkoutOrders } from "@/lib/db/schema";
import { formatPrice } from "@/lib/swell/utils";

import {
  AffiliatePanel,
  AffiliateSectionHeader,
  AffiliateStatCard,
  affiliateChipClass,
  affiliateInsetClass,
  affiliateSecondaryButtonClass,
  affiliateStatusChipClass,
  getAffiliateStatusClasses,
  getPayoutStatusClasses,
} from "./_components/affiliate-shell";
import { AffiliateHeaderSummary } from "./_components/affiliate-header-summary";
import { AffiliateRecoveryState } from "./_components/affiliate-recovery-state";
import { formatWalletPreview, getConfiguredWallet } from "./wallet-utils";
import { EmbeddedWalletForm } from "./wallet/wallet-form";

export const metadata = {
  title: "Growth Partner Dashboard | Revalin",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function getAffiliateSourceLabel(source: unknown) {
  if (source === "url") return "Referral link";
  if (source === "discount_code") return "Discount code";
  return "Attribution saved";
}

function getPaymentStatusLabel(status: unknown) {
  if (typeof status !== "string" || !status.trim()) return "unknown";
  return status.replace(/[_-]+/g, " ");
}

export default async function AffiliateDashboardPage() {
  const session = await getServerSession();
  if (!session?.user) redirect("/login");

  const affiliate = await getAffiliateByUserIdentity({
    userId: session.user.id,
    email: session.user.email,
  });

  if (!affiliate) {
    return <AffiliateRecoveryState email={session.user.email} />;
  }

  const [payouts, commissionOverview, referredOrderRows, visitSummary] =
    await Promise.all([
      getPayoutsForAffiliate(affiliate.id),
      getAffiliateCommissionOverview({ affiliateId: affiliate.id }).catch(
        () => null,
      ),
      db
        .select({
          payout: affiliatePayouts,
          order: checkoutOrders,
        })
        .from(affiliatePayouts)
        .innerJoin(
          checkoutOrders,
          eq(affiliatePayouts.orderId, checkoutOrders.orderId),
        )
        .where(eq(affiliatePayouts.affiliateId, affiliate.id))
        .orderBy(desc(affiliatePayouts.createdAt))
        .limit(20),
      getAffiliateVisitSummary(affiliate.id),
    ]);

  const currentCommissionSummary = commissionOverview?.summary ?? null;
  const referredOrderCount = referredOrderRows.length;

  const totalRevenue = payouts.reduce(
    (sum, payout) => sum + Number(payout.orderTotal),
    0,
  );
  const averageOrderValue =
    referredOrderCount > 0 ? totalRevenue / referredOrderCount : 0;
  const commissionEarned = payouts.reduce(
    (sum, payout) => sum + Number(payout.commissionAmount),
    0,
  );
  const commissionPaid = payouts
    .filter((payout) => payout.status === "paid")
    .reduce((sum, payout) => sum + Number(payout.commissionAmount), 0);
  const commissionPendingReview = payouts
    .filter((payout) => payout.status === "pending")
    .reduce((sum, payout) => sum + Number(payout.commissionAmount), 0);
  const commissionApproved = payouts
    .filter((payout) => payout.status === "approved")
    .reduce((sum, payout) => sum + Number(payout.commissionAmount), 0);
  const commissionRejected = payouts
    .filter((payout) => payout.status === "rejected")
    .reduce((sum, payout) => sum + Number(payout.commissionAmount), 0);
  const commissionDue = commissionPendingReview + commissionApproved;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://revalin.ca";
  const configuredWallet = getConfiguredWallet(affiliate.walletAddress);
  const walletPreview = formatWalletPreview(affiliate.walletAddress);
  const hasWallet = Boolean(configuredWallet);

  return (
    <div className="space-y-3">
      <section className="space-y-3">
        <AffiliatePanel tone="inverse" className="relative overflow-hidden p-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_30%)]" />

          <div className="relative space-y-0">
            <div className="border-b border-white/10 px-3.5 py-3.5">
              <AffiliateHeaderSummary
                affiliateCode={affiliate.code}
                referralLink={`${siteUrl}/${affiliate.code}`}
              />
            </div>

            <div className="grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-5">
              <div className="bg-white/6 px-3.5 py-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#F4F1EA]/48">
                  Status
                </p>
                <div className="mt-1.5">
                  <span
                    className={`${affiliateStatusChipClass} ${getAffiliateStatusClasses(affiliate.status, "inverse")}`}
                  >
                    {affiliate.status}
                  </span>
                </div>
              </div>
              <div className="bg-white/6 px-3.5 py-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#F4F1EA]/48">
                  Effective commission
                </p>
                <p className="mt-1.5 text-sm font-semibold text-[#F4F1EA]">
                  {(
                    Number(
                      currentCommissionSummary?.effectiveRate ||
                        affiliate.commissionRate,
                    ) * 100
                  ).toFixed(1)}
                  %
                </p>
              </div>
              <div className="bg-white/6 px-3.5 py-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#F4F1EA]/48">
                  Discount code
                </p>
                <p className="mt-1.5 font-mono text-sm font-semibold text-[#F4F1EA]">
                  {affiliate.discountCode || "Pending"}
                </p>
              </div>
              <div className="bg-white/6 px-3.5 py-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#F4F1EA]/48">
                  Wallet
                </p>
                <p className="mt-1.5 text-sm font-semibold text-[#F4F1EA]">
                  {hasWallet ? "Connected" : "Not connected"}
                </p>
              </div>
              <div className="bg-white/6 px-3.5 py-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#F4F1EA]/48">
                  Paid revenue this month
                </p>
                <p className="mt-1.5 text-sm font-semibold text-[#F4F1EA]">
                  ${Number(currentCommissionSummary?.recognizedRevenue || 0).toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </AffiliatePanel>

        <AffiliatePanel tone="muted">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/46">
                Snapshot
              </p>
              <p className="mt-1 text-[11px] leading-4 text-[#0B2E2F]/58">
                Core partner and sales totals from first-party Revalin records.
                Traffic attribution now lives in Analytics.
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className={`${affiliateInsetClass} px-3 py-2.5`}>
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                Lifetime people
              </p>
              <p className="mt-1 text-xs font-semibold tracking-tight text-[#0B2E2F]">
                {formatNumber(visitSummary.totalUniqueVisitors)}
              </p>
            </div>
            <div className={`${affiliateInsetClass} px-3 py-2.5`}>
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                Successful sales
              </p>
              <p className="mt-1 text-xs font-semibold tracking-tight text-[#0B2E2F]">
                {formatNumber(referredOrderCount)}
              </p>
            </div>
            <div className={`${affiliateInsetClass} px-3 py-2.5`}>
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                Average order value
              </p>
              <p className="mt-1 text-xs font-semibold tracking-tight text-[#0B2E2F]">
                ${averageOrderValue.toFixed(2)}
              </p>
            </div>
          </div>
        </AffiliatePanel>
      </section>

      <AffiliatePanel id="payout-settings" className="scroll-mt-24">
        <details className="group" open={!hasWallet}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <AffiliateSectionHeader
              eyebrow="Wallet"
              title="Payout settings"
              description="Add or update the Polygon wallet that should receive approved USDC payouts. We use wallet payouts because they are faster than handling manual payout details later."
            />
            <span className={`${affiliateChipClass} shrink-0`}>
              {hasWallet ? "Wallet on file" : "Wallet needed"}
            </span>
          </summary>

          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <div className={`${affiliateInsetClass} px-3 py-3`}>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#0B2E2F]">
                <Wallet className="size-4" />
                Current wallet
              </div>
              <p className="mt-2 font-mono text-xs font-semibold text-[#0B2E2F]">
                {walletPreview}
              </p>
            </div>

            <div className={`${affiliateInsetClass} px-3 py-3`}>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#0B2E2F]">
                <WalletCards className="size-4" />
                Payout readiness
              </div>
              <p className="mt-2 text-[11px] leading-4 text-[#0B2E2F]/62">
                {hasWallet
                  ? "Approved payouts will use this wallet so the team can send USDC faster."
                  : "Add a Polygon wallet here so the team can send approved USDC payouts faster."}
              </p>
            </div>

            <div className={`${affiliateInsetClass} px-3 py-3`}>
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                Effective commission
              </p>
              <p className="mt-2 text-base font-semibold tracking-tight text-[#0B2E2F]">
                {(
                  Number(
                    currentCommissionSummary?.effectiveRate ||
                      affiliate.commissionRate,
                  ) * 100
                ).toFixed(1)}
                %
              </p>
              <p className="mt-1 text-[11px] text-[#0B2E2F]/58">
                {currentCommissionSummary?.tierLabel || "Baseline rate"}
              </p>
            </div>
          </div>

          <div className="mt-3">
            <EmbeddedWalletForm currentWallet={configuredWallet} />
          </div>
        </details>
      </AffiliatePanel>

      <section className="space-y-3">
        <AffiliateSectionHeader
          eyebrow="Commission"
          title="Commission state"
          description="What has been earned, what still needs review or settlement, and what has already been paid."
        />

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <AffiliateStatCard
            label="Total revenue"
            value={`$${totalRevenue.toFixed(2)}`}
            detail={`${formatNumber(referredOrderCount)} successful referred order${referredOrderCount === 1 ? "" : "s"}.`}
            size="compact"
          />
          <AffiliateStatCard
            label="Commission earned"
            value={`$${commissionEarned.toFixed(2)}`}
            detail="All commission generated from paid sales."
            tone="inverse"
            size="compact"
          />
          <AffiliateStatCard
            label="Commission due"
            value={`$${commissionDue.toFixed(2)}`}
            detail="Pending review plus approved payouts not yet paid."
            size="compact"
          />
          <AffiliateStatCard
            label="Paid out"
            value={`$${commissionPaid.toFixed(2)}`}
            detail="Completed USDC payouts."
            size="compact"
          />
          <AffiliateStatCard
            label="Rejected"
            value={`$${commissionRejected.toFixed(2)}`}
            detail="Entries removed from the payout flow."
            size="compact"
          />
        </div>
      </section>

      <section className="space-y-3">
        <AffiliatePanel>
          <AffiliateSectionHeader
            eyebrow="Ledger"
            title="Sales ledger"
            description="Each referred sale with the order value, commission amount, attribution source, and payout state."
            action={
              <Link
                href="/affiliate/dashboard/payouts"
                className={`inline-flex items-center justify-center gap-2 ${affiliateSecondaryButtonClass}`}
              >
                View payouts
                <ArrowRight className="size-4" />
              </Link>
            }
          />

          {referredOrderRows.length === 0 ? (
            <div className="mt-3 border border-dashed border-[#0B2E2F]/12 bg-[#FCFAF6] px-4 py-6 text-center">
              <p className="text-[11px] text-[#0B2E2F]/58">
                Successful referred sales will appear here once customers buy
                through the referral link or assigned discount code.
              </p>
            </div>
          ) : (
            <div className="mt-3 space-y-2.5">
              {referredOrderRows.map(({ payout, order }) => {
                const lines = Array.isArray(order.lines)
                  ? (order.lines as any[])
                  : [];
                const itemCount = lines.reduce(
                  (sum, line) => sum + Number(line?.quantity || 0),
                  0,
                );
                const attribution = (order.affiliate as any) || null;
                const paymentStatus =
                  typeof (order.payment as any)?.status === "string"
                    ? (order.payment as any).status
                    : null;

                return (
                  <div key={payout.id} className={`${affiliateInsetClass} p-3`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-semibold text-[#0B2E2F]">
                            Order {payout.orderId}
                          </p>
                          <span
                            className={`${affiliateStatusChipClass} ${getPayoutStatusClasses(payout.status)}`}
                          >
                            {payout.status}
                          </span>
                          <span className={affiliateChipClass}>
                            {getAffiliateSourceLabel(attribution?.source)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[#0B2E2F]/46">
                          {new Date(order.createdAt).toLocaleDateString()} •{" "}
                          {itemCount} item{itemCount === 1 ? "" : "s"} • Payment{" "}
                          {getPaymentStatusLabel(paymentStatus)}
                        </p>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {lines.slice(0, 4).map((line) => (
                            <span key={line.id} className={affiliateChipClass}>
                              {line.productTitle}
                              {line.quantity > 1 ? ` x${line.quantity}` : ""}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="sm:text-right">
                        <p className="text-xs font-semibold tracking-tight text-[#0B2E2F]">
                          {formatPrice(payout.orderTotal, payout.currencyCode)}
                        </p>
                        <p className="mt-1 text-[11px] text-[#0B2E2F]/58">
                          Commission{" "}
                          {formatPrice(
                            payout.commissionAmount,
                            payout.currencyCode,
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </AffiliatePanel>
      </section>
    </div>
  );
}
