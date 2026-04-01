import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import {
  ArrowRight,
  Link as LinkIcon,
  Wallet,
  WalletCards,
} from "lucide-react";

import {
  getAffiliateChartData,
  getAffiliateEvents,
  getAffiliateRevenue,
} from "@/lib/analytics/openpanel";
import { getServerSession } from "@/lib/auth-server";
import { getAffiliateByUserIdentity } from "@/lib/checkout/affiliate-service";
import {
  getAffiliateVisitSummary,
  getRecentAffiliateVisits,
} from "@/lib/checkout/affiliate-visit-service";
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
import { AffiliateRecoveryState } from "./_components/affiliate-recovery-state";
import { formatWalletPreview, getConfiguredWallet } from "./wallet-utils";

export const metadata = {
  title: "Growth Partner Dashboard | Revalin",
};

function formatEventTime(value: unknown) {
  const date =
    value instanceof Date
      ? value
      : typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : null;

  if (!date || Number.isNaN(date.getTime())) return "Unknown time";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function getEventName(event: any) {
  return event?.name || event?.event || event?.event_name || "event";
}

function getEventTimestamp(event: any) {
  return (
    event?.timestamp ||
    event?.createdAt ||
    event?.created_at ||
    event?.time ||
    null
  );
}

function getReferrerLabel(referrer: string | null | undefined) {
  if (!referrer) return "Direct / unknown";

  try {
    return new URL(referrer).host.replace(/^www\./, "");
  } catch {
    return referrer;
  }
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

function getDeviceLabel(userAgent: string | null | undefined) {
  if (!userAgent) return null;
  return /mobile|android|iphone|ipad/i.test(userAgent)
    ? "Mobile device"
    : "Desktop device";
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

  const analyticsStart = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [
    chartData,
    revenueData,
    events,
    payouts,
    referredOrderRows,
    visitSummary,
    recentVisits,
  ] = await Promise.all([
    getAffiliateChartData(affiliate.code, "30d").catch(() => null),
    getAffiliateRevenue(affiliate.code, "30d").catch(() => null),
    getAffiliateEvents(affiliate.code, { start: analyticsStart }).catch(
      () => [],
    ),
    getPayoutsForAffiliate(affiliate.id),
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
    getRecentAffiliateVisits(affiliate.id, 8),
  ]);

  const last30Start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const affiliateEvents = Array.isArray(events) ? events : [];
  const referredOrderCount = referredOrderRows.length;
  const sales30dRows = referredOrderRows.filter(({ order }) => {
    const createdAt =
      order.createdAt instanceof Date
        ? order.createdAt
        : new Date(order.createdAt);
    return createdAt >= last30Start;
  });

  const totalRevenue = payouts.reduce(
    (sum, payout) => sum + Number(payout.orderTotal),
    0,
  );
  const revenue30d = sales30dRows.reduce(
    (sum, { payout }) => sum + Number(payout.orderTotal),
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
  const conversionRate30d =
    visitSummary.uniqueVisitors30d > 0
      ? sales30dRows.length / visitSummary.uniqueVisitors30d
      : null;
  const trackedVisitEvents = affiliateEvents.filter(
    (event: any) => getEventName(event) === "affiliate_visit",
  ).length;
  const trackedVisits =
    chartData?.series?.[0]?.data?.reduce(
      (sum: number, datum: any) =>
        sum + Number(datum.count || datum.value || 0),
      0,
    ) ?? trackedVisitEvents;
  const trackedPurchases = affiliateEvents.filter(
    (event: any) => getEventName(event) === "purchase",
  ).length;
  const trackedRevenueFromEvents = affiliateEvents
    .filter((event: any) => getEventName(event) === "purchase")
    .reduce(
      (sum: number, event: any) =>
        sum + Number(event?.properties?.orderTotal || 0),
      0,
    );
  const trackedRevenue =
    revenueData?.series?.[0]?.data?.reduce(
      (sum: number, datum: any) => sum + Number(datum.value || datum.sum || 0),
      0,
    ) ?? trackedRevenueFromEvents;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://revalin.ca";
  const configuredWallet = getConfiguredWallet(affiliate.walletAddress);
  const walletPreview = formatWalletPreview(affiliate.walletAddress);
  const hasWallet = Boolean(configuredWallet);
  const trafficRampMessage =
    visitSummary.totalVisits > 0
      ? `${formatNumber(visitSummary.totalVisits)} total click${visitSummary.totalVisits === 1 ? "" : "s"} recorded in first-party tracking.`
      : trackedVisits > 0
        ? `${formatNumber(trackedVisits)} OpenPanel visits were tracked in the last 30 days. First-party click logging starts with this release.`
        : "First-party click logging starts with this release.";

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.95fr]">
        <AffiliatePanel tone="inverse" className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_30%)]" />

          <div className="relative">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#F4F1EA]/48">
              Growth Partner code
            </p>
            <p className="mt-3 font-mono text-[2.8rem] font-semibold tracking-[-0.08em] text-[#F4F1EA] sm:text-[3.4rem]">
              {affiliate.code}
            </p>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="border border-white/10 bg-white/6 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#F4F1EA]/50">
                  Referral link
                </p>
                <div className="mt-3 flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center border border-white/10 bg-white/8">
                    <LinkIcon className="size-4 text-[#F4F1EA]" />
                  </div>
                  <code className="break-all text-sm text-[#F4F1EA]/88">
                    {siteUrl}/{affiliate.code}
                  </code>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <Link
                  href="/affiliate/dashboard/wallet"
                  className="inline-flex h-11 items-center justify-center gap-2 border border-white/14 bg-white/8 px-4 text-sm font-semibold text-[#F4F1EA] transition-colors hover:bg-white/12"
                >
                  <Wallet className="size-4" />
                  {hasWallet ? "Wallet settings" : "Connect wallet"}
                </Link>
                <Link
                  href="/affiliate/dashboard/payouts"
                  className="inline-flex h-11 items-center justify-center gap-2 border border-white/14 bg-white/8 px-4 text-sm font-semibold text-[#F4F1EA] transition-colors hover:bg-white/12"
                >
                  <WalletCards className="size-4" />
                  Payout ledger
                </Link>
              </div>
            </div>
          </div>
        </AffiliatePanel>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <AffiliatePanel>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className={`${affiliateInsetClass} px-4 py-3`}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/46">
                  Status
                </p>
                <div className="mt-2">
                  <span
                    className={`${affiliateStatusChipClass} ${getAffiliateStatusClasses(affiliate.status)}`}
                  >
                    {affiliate.status}
                  </span>
                </div>
              </div>
              <div className={`${affiliateInsetClass} px-4 py-3`}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/46">
                  Commission rate
                </p>
                <p className="mt-2 text-xl font-semibold tracking-tight text-[#0B2E2F]">
                  {(Number(affiliate.commissionRate) * 100).toFixed(1)}%
                </p>
              </div>
              <div className={`${affiliateInsetClass} px-4 py-3`}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/46">
                  Discount code
                </p>
                <p className="mt-2 font-mono text-sm font-semibold text-[#0B2E2F]">
                  {affiliate.discountCode || "Not assigned"}
                </p>
              </div>
              <div className={`${affiliateInsetClass} px-4 py-3`}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/46">
                  Wallet
                </p>
                <p className="mt-2 font-mono text-sm font-semibold text-[#0B2E2F]">
                  {walletPreview}
                </p>
              </div>
            </div>
          </AffiliatePanel>

          <AffiliatePanel tone="muted">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0B2E2F]/46">
              Performance snapshot
            </p>
            <div className="mt-4 grid gap-3">
              <div className={`${affiliateInsetClass} px-4 py-3`}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/46">
                  Lifetime people
                </p>
                <p className="mt-2 text-xl font-semibold tracking-tight text-[#0B2E2F]">
                  {formatNumber(visitSummary.totalUniqueVisitors)}
                </p>
              </div>
              <div className={`${affiliateInsetClass} px-4 py-3`}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/46">
                  Successful sales
                </p>
                <p className="mt-2 text-xl font-semibold tracking-tight text-[#0B2E2F]">
                  {formatNumber(referredOrderCount)}
                </p>
              </div>
              <div className={`${affiliateInsetClass} px-4 py-3`}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/46">
                  Average order value
                </p>
                <p className="mt-2 text-xl font-semibold tracking-tight text-[#0B2E2F]">
                  ${averageOrderValue.toFixed(2)}
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-5 text-[#0B2E2F]/58">
              Sales and payout totals below come from Revalin order records.
              OpenPanel remains supplemental telemetry.
            </p>
          </AffiliatePanel>
        </div>
      </section>

      <section className="space-y-4">
        <AffiliateSectionHeader
          title="Traffic and conversion"
          description="How many people opened the referral link, how many clicks were recorded, and how often those visits converted into paid sales."
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <AffiliateStatCard
            label="People 30d"
            value={formatNumber(visitSummary.uniqueVisitors30d)}
            detail={`${formatNumber(visitSummary.totalUniqueVisitors)} lifetime unique visitors.`}
            tone="inverse"
          />
          <AffiliateStatCard
            label="Link clicks 30d"
            value={formatNumber(visitSummary.visits30d)}
            detail={trafficRampMessage}
          />
          <AffiliateStatCard
            label="Sales 30d"
            value={formatNumber(sales30dRows.length)}
            detail={`${formatNumber(referredOrderCount)} lifetime paid sale${referredOrderCount === 1 ? "" : "s"}.`}
          />
          <AffiliateStatCard
            label="Conversion 30d"
            value={formatPercent(conversionRate30d)}
            detail={
              visitSummary.uniqueVisitors30d > 0
                ? `${formatNumber(sales30dRows.length)} paid sale${sales30dRows.length === 1 ? "" : "s"} from ${formatNumber(visitSummary.uniqueVisitors30d)} unique people.`
                : "No first-party visitor history for the last 30 days yet."
            }
          />
          <AffiliateStatCard
            label="Revenue 30d"
            value={`$${revenue30d.toFixed(2)}`}
            detail={`Average order value $${averageOrderValue.toFixed(2)}.`}
          />
        </div>
      </section>

      <section className="space-y-4">
        <AffiliateSectionHeader
          title="Commission state"
          description="What has been earned, what still needs review or settlement, and what has already been paid."
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <AffiliateStatCard
            label="Total revenue"
            value={`$${totalRevenue.toFixed(2)}`}
            detail={`${formatNumber(referredOrderCount)} successful referred order${referredOrderCount === 1 ? "" : "s"}.`}
          />
          <AffiliateStatCard
            label="Commission earned"
            value={`$${commissionEarned.toFixed(2)}`}
            detail="All commission generated from paid sales."
            tone="inverse"
          />
          <AffiliateStatCard
            label="Commission due"
            value={`$${commissionDue.toFixed(2)}`}
            detail="Pending review plus approved payouts not yet paid."
          />
          <AffiliateStatCard
            label="Paid out"
            value={`$${commissionPaid.toFixed(2)}`}
            detail="Completed USDC payouts."
          />
          <AffiliateStatCard
            label="Rejected"
            value={`$${commissionRejected.toFixed(2)}`}
            detail="Entries removed from the payout flow."
          />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
        <AffiliatePanel>
          <AffiliateSectionHeader
            title="Sales ledger"
            description="Each referred sale with the order value, commission amount, attribution source, and payout state."
            action={
              <Link
                href="/affiliate/dashboard/payouts"
                className={`inline-flex h-11 items-center justify-center gap-2 px-5 text-sm font-semibold ${affiliateSecondaryButtonClass}`}
              >
                View payouts
                <ArrowRight className="size-4" />
              </Link>
            }
          />

          {referredOrderRows.length === 0 ? (
            <div className="mt-5 border border-dashed border-[#0B2E2F]/12 bg-[#FCFAF6] px-6 py-10 text-center">
              <p className="text-sm text-[#0B2E2F]/58">
                Successful referred sales will appear here once customers buy
                through the referral link or assigned discount code.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
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
                  <div key={payout.id} className={`${affiliateInsetClass} p-4`}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-[#0B2E2F]">
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
                        <div className="mt-3 flex flex-wrap gap-2">
                          {lines.slice(0, 4).map((line) => (
                            <span key={line.id} className={affiliateChipClass}>
                              {line.productTitle}
                              {line.quantity > 1 ? ` x${line.quantity}` : ""}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="sm:text-right">
                        <p className="text-lg font-semibold tracking-tight text-[#0B2E2F]">
                          {formatPrice(payout.orderTotal, payout.currencyCode)}
                        </p>
                        <p className="mt-1 text-sm text-[#0B2E2F]/58">
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

        <AffiliatePanel>
          <AffiliateSectionHeader
            title="Traffic log"
            description="First-party referral clicks captured when someone opens the Growth Partner link."
          />

          {recentVisits.length === 0 ? (
            <div className="mt-5 border border-dashed border-[#0B2E2F]/12 bg-[#FCFAF6] px-6 py-10 text-center">
              <p className="text-sm text-[#0B2E2F]/58">
                No first-party referral clicks have been recorded yet. New link
                visits will appear here after this tracking update is live.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {recentVisits.map((visit) => {
                const deviceLabel = getDeviceLabel(visit.userAgent);

                return (
                  <div key={visit.id} className={`${affiliateInsetClass} p-4`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#0B2E2F]">
                          {getReferrerLabel(visit.referrer)}
                        </p>
                        <p className="mt-1 text-xs text-[#0B2E2F]/46">
                          {formatEventTime(visit.createdAt)}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className={affiliateChipClass}>
                            Route {visit.referralPath || `/${affiliate.code}`}
                          </span>
                          <span className={affiliateChipClass}>
                            {visit.referrer
                              ? "External referral"
                              : "Direct / unknown"}
                          </span>
                          {deviceLabel ? (
                            <span className={affiliateChipClass}>
                              {deviceLabel}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </AffiliatePanel>
      </section>

      <AffiliatePanel tone="muted">
        <AffiliateSectionHeader
          title="OpenPanel telemetry"
          description="Supplemental analytics only. The traffic, sales, and payout totals above are based on first-party Revalin records."
        />

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className={`${affiliateInsetClass} px-4 py-4`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/46">
              Tracked visits 30d
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-[#0B2E2F]">
              {formatNumber(trackedVisits)}
            </p>
            <p className="mt-2 text-sm text-[#0B2E2F]/58">
              Link visit events recorded by OpenPanel.
            </p>
          </div>
          <div className={`${affiliateInsetClass} px-4 py-4`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/46">
              Tracked purchases 30d
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-[#0B2E2F]">
              {formatNumber(trackedPurchases)}
            </p>
            <p className="mt-2 text-sm text-[#0B2E2F]/58">
              Purchase events carrying this affiliate code.
            </p>
          </div>
          <div className={`${affiliateInsetClass} px-4 py-4`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/46">
              Tracked revenue 30d
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-[#0B2E2F]">
              ${trackedRevenue.toFixed(2)}
            </p>
            <p className="mt-2 text-sm text-[#0B2E2F]/58">
              Revenue total from OpenPanel purchase events.
            </p>
          </div>
        </div>

        {affiliateEvents.length === 0 ? (
          <div className="mt-5 border border-dashed border-[#0B2E2F]/12 bg-[#FCFAF6] px-6 py-8 text-center">
            <p className="text-sm text-[#0B2E2F]/58">
              OpenPanel has not returned affiliate events yet.
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {affiliateEvents.slice(0, 6).map((event: any, index: number) => {
              const name = getEventName(event);
              const orderTotal = event?.properties?.orderTotal;
              const discountCode = event?.properties?.discount_code;

              return (
                <div
                  key={`${name}-${getEventTimestamp(event) || index}`}
                  className={`${affiliateInsetClass} p-4`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold capitalize text-[#0B2E2F]">
                        {name.replace(/_/g, " ")}
                      </p>
                      <p className="mt-1 text-xs text-[#0B2E2F]/46">
                        {formatEventTime(getEventTimestamp(event))}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {discountCode ? (
                          <span className={affiliateChipClass}>
                            Discount {discountCode}
                          </span>
                        ) : null}
                        {orderTotal ? (
                          <span className={affiliateChipClass}>
                            Order ${Number(orderTotal).toFixed(2)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AffiliatePanel>
    </div>
  );
}
