import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle, Clock, Wallet } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getServerSession } from "@/lib/auth-server";
import { getAffiliateByUserIdentity } from "@/lib/checkout/affiliate-service";
import { getAffiliateCommissionOverview } from "@/lib/checkout/commission-service";
import {
  buildPayoutDestinationPreview,
  getPayoutMethodShortLabel,
  hasCompletePayoutDestination,
} from "@/lib/checkout/payout-methods";
import { getPayoutsForAffiliate } from "@/lib/checkout/payout-service";
import { formatPayoutPeriodLabel } from "@/lib/checkout/payout-periods";
import { getWeeklyPayoutBatchesForAffiliate } from "@/lib/checkout/weekly-payout-service";

import {
  AffiliatePanel,
  AffiliateSectionHeader,
  AffiliateStatCard,
  affiliateSecondaryButtonClass,
  affiliateStatusChipClass,
  getAffiliateStatusClasses,
  getPayoutStatusClasses,
} from "../_components/affiliate-shell";
import { AffiliateRecoveryState } from "../_components/affiliate-recovery-state";

export const metadata = {
  title: "Payouts | Growth Partner Dashboard | Revalin",
};

function formatProviderLabel(provider?: string | null) {
  if (!provider) return "Manual";

  return provider
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatUsd(value: string | number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export default async function AffiliatePayoutsPage() {
  const session = await getServerSession();
  if (!session?.user) redirect("/login");

  const affiliate = await getAffiliateByUserIdentity({
    userId: session.user.id,
    email: session.user.email,
  });

  if (!affiliate) {
    return <AffiliateRecoveryState email={session.user.email} />;
  }

  const [earnings, weeklyBatches, commissionOverview] = await Promise.all([
    getPayoutsForAffiliate(affiliate.id),
    getWeeklyPayoutBatchesForAffiliate(affiliate.id),
    getAffiliateCommissionOverview({ affiliateId: affiliate.id }).catch(
      () => null,
    ),
  ]);

  const currentCommissionSummary = commissionOverview?.summary ?? null;
  const totalEarned = earnings.reduce(
    (sum, earning) =>
      sum + Number(earning.normalizedCommissionAmount ?? earning.commissionAmount),
    0,
  );
  const totalPendingReview = earnings
    .filter((earning) => earning.status === "pending")
    .reduce(
      (sum, earning) =>
        sum +
        Number(earning.normalizedCommissionAmount ?? earning.commissionAmount),
      0,
    );
  const totalApproved = weeklyBatches
    .filter((batch) => batch.status === "approved")
    .reduce((sum, batch) => sum + Number(batch.netPayoutAmount), 0);
  const totalPaid = weeklyBatches
    .filter((batch) => batch.status === "paid")
    .reduce((sum, batch) => sum + Number(batch.netPayoutAmount), 0);
  const totalRejected = earnings
    .filter((earning) => earning.status === "rejected")
    .reduce(
      (sum, earning) =>
        sum +
        Number(earning.normalizedCommissionAmount ?? earning.commissionAmount),
      0,
    );
  const nextToSettle = weeklyBatches.find(
    (batch) => batch.status === "approved" || batch.status === "pending",
  );
  const payoutReady = hasCompletePayoutDestination({
    payoutMethod: affiliate.payoutMethod,
    walletAddress: affiliate.walletAddress,
    achAccountHolderName: affiliate.achAccountHolderName,
    achBankName: affiliate.achBankName,
    achAccountType: affiliate.achAccountType,
    achRoutingNumberLast4: affiliate.achRoutingNumberLast4,
    achAccountNumberLast4: affiliate.achAccountNumberLast4,
  });
  const payoutDestinationPreview = buildPayoutDestinationPreview({
    payoutMethod: affiliate.payoutMethod,
    walletAddress: affiliate.walletAddress,
    achAccountHolderName: affiliate.achAccountHolderName,
    achBankName: affiliate.achBankName,
    achAccountType: affiliate.achAccountType,
    achRoutingNumberLast4: affiliate.achRoutingNumberLast4,
    achAccountNumberLast4: affiliate.achAccountNumberLast4,
  });
  const providerSummary = Array.from(
    earnings.reduce((summary, earning) => {
      const key = earning.paymentProvider || "manual";
      const entry = summary.get(key) || { count: 0, amount: 0 };

      entry.count += 1;
      entry.amount += Number(
        earning.normalizedCommissionAmount ?? earning.commissionAmount,
      );
      summary.set(key, entry);

      return summary;
    }, new Map<string, { count: number; amount: number }>()),
  );

  return (
    <div className="space-y-3">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <AffiliateStatCard
          label="Total earned"
          value={formatUsd(totalEarned)}
          detail={`${earnings.length} earned ${earnings.length === 1 ? "entry" : "entries"}.`}
          tone="inverse"
          size="compact"
        />
        <AffiliateStatCard
          label="Pending review"
          value={formatUsd(totalPendingReview)}
          detail="New earnings waiting for a weekly payout batch."
          size="compact"
        />
        <AffiliateStatCard
          label="Ready to send"
          value={formatUsd(totalApproved)}
          detail={
            payoutReady
              ? `${payoutDestinationPreview.title}.`
              : "Set payout details before approved weekly payouts are sent."
          }
          size="compact"
        />
        <AffiliateStatCard
          label="Paid out"
          value={formatUsd(totalPaid)}
          detail="Completed net payouts after any ACH fee."
          size="compact"
        />
        <AffiliateStatCard
          label="Rejected"
          value={formatUsd(totalRejected)}
          detail="Earnings removed from payout flow."
          size="compact"
        />
      </section>

      <AffiliatePanel>
        <AffiliateSectionHeader
          eyebrow="Weekly payouts"
          title="Settlement history"
          action={
            <Link
              href="/affiliate/dashboard#payout-settings"
              className={`inline-flex items-center justify-center gap-2 ${affiliateSecondaryButtonClass}`}
            >
              <Wallet className="size-4" />
              Payout settings
            </Link>
          }
        />

        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <div className="border border-[#0B2E2F]/10 bg-[#FCFAF6] px-3 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0B2E2F]">
              <Wallet className="size-4" />
              Current destination
            </div>
            <p className="mt-2 text-xs font-semibold text-[#0B2E2F]">
              {payoutDestinationPreview.title}
            </p>
            <p className="mt-1 text-[11px] text-[#0B2E2F]/58">
              {payoutDestinationPreview.subtitle || "-"}
            </p>
            <Link
              href="/affiliate/dashboard#payout-settings"
              className="mt-3 inline-flex items-center gap-2 text-[11px] font-semibold text-[#0B2E2F] underline underline-offset-4"
            >
              {payoutReady ? "Update payout settings" : "Set payout details"}
              <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="border border-[#0B2E2F]/10 bg-[#FCFAF6] px-3 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0B2E2F]">
              <CheckCircle className="size-4" />
              Growth Partner status
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`${affiliateStatusChipClass} ${getAffiliateStatusClasses(affiliate.status)}`}
              >
                {affiliate.status}
              </span>
              <span className="text-xs font-semibold text-[#0B2E2F]">
                {affiliate.code}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-[#0B2E2F]/58">
              Effective rate{" "}
              {(
                Number(
                  currentCommissionSummary?.effectiveRate ||
                    affiliate.commissionRate,
                ) * 100
              ).toFixed(1)}
              %. Tier{" "}
              {currentCommissionSummary?.tierLabel || "baseline"}.
            </p>
          </div>

          <div className="border border-[#0B2E2F]/10 bg-[#FCFAF6] px-3 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0B2E2F]">
              <Clock className="size-4" />
              Earning sources
            </div>
            {providerSummary.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                {providerSummary.map(([provider, summary]) => (
                  <div
                    key={provider}
                    className="flex items-center justify-between gap-3 text-[11px] text-[#0B2E2F]"
                  >
                    <span>{formatProviderLabel(provider)}</span>
                    <span className="font-semibold">
                      {summary.count} / {formatUsd(summary.amount)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-[#0B2E2F]/58">
                No earnings recorded yet.
              </p>
            )}
            {nextToSettle ? (
              <p className="mt-3 text-[11px] text-[#0B2E2F]/58">
                Next settlement window:{" "}
                {formatPayoutPeriodLabel({
                  start: nextToSettle.periodStart,
                  end: nextToSettle.periodEnd,
                  timezone: nextToSettle.periodTimezone,
                })}
                .
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-3 overflow-hidden border border-[#0B2E2F]/10 bg-white/72">
          <Table>
            <TableHeader>
              <TableRow className="border-[#0B2E2F]/10">
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Period
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Month
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Earnings
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Method
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Gross / fee / net
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Status
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Reference
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {weeklyBatches.map((batch) => (
                <TableRow key={batch.id} className="border-[#0B2E2F]/10">
                  <TableCell className="py-2 text-xs text-[#0B2E2F]">
                    {formatPayoutPeriodLabel({
                      start: batch.periodStart,
                      end: batch.periodEnd,
                      timezone: batch.periodTimezone,
                    })}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-[#0B2E2F]/72">
                    {batch.commissionMonthKey}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-[#0B2E2F]/72">
                    {batch.earningCount}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-[#0B2E2F]/72">
                    <p className="font-semibold text-[#0B2E2F]">
                      {getPayoutMethodShortLabel(batch.payoutMethod)}
                    </p>
                    <p className="mt-1 text-[11px] text-[#0B2E2F]/52">
                      {batch.destinationPreview.subtitle || batch.destinationPreview.title}
                    </p>
                  </TableCell>
                  <TableCell className="py-2 text-xs text-[#0B2E2F]/72">
                    <p className="font-semibold text-[#0B2E2F]">
                      Gross {formatUsd(batch.totalNormalizedCommissionAmount)}
                    </p>
                    <p className="mt-1 text-[11px] text-[#0B2E2F]/52">
                      ACH fee {formatUsd(batch.payoutFeeAmount)}
                    </p>
                    <p className="mt-1 font-semibold text-[#0B2E2F]">
                      Net received {formatUsd(batch.netPayoutAmount)}
                    </p>
                  </TableCell>
                  <TableCell className="py-2">
                    <span
                      className={`${affiliateStatusChipClass} ${getPayoutStatusClasses(batch.status)}`}
                    >
                      {batch.status}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate py-2 text-[11px] font-mono text-[#0B2E2F]/46">
                    {batch.txHash ? (
                      <a
                        href={`https://polygonscan.com/tx/${batch.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-[#0B2E2F]"
                      >
                        {batch.txHash.slice(0, 10)}...
                        <ArrowRight className="size-3" />
                      </a>
                    ) : batch.paymentReference ? (
                      batch.paymentReference
                    ) : (
                      "-"
                    )}
                  </TableCell>
                </TableRow>
              ))}

              {weeklyBatches.length === 0 ? (
                <TableRow className="border-[#0B2E2F]/10">
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-[11px] text-[#0B2E2F]/58"
                  >
                    No weekly payout batches yet. New earnings accumulate through the
                    week and appear here once they are grouped for payout.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </AffiliatePanel>

      <AffiliatePanel>
        <AffiliateSectionHeader
          eyebrow="Earnings"
          title="Recent earned entries"
          description="Per-sale earnings still show here as support detail, but settlement is done as weekly payout batches."
        />

        <div className="mt-3 overflow-hidden border border-[#0B2E2F]/10 bg-white/72">
          <Table>
            <TableHeader>
              <TableRow className="border-[#0B2E2F]/10">
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Order
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Order total
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Earned
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Weekly batch
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Status
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Source
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {earnings.map((earning) => (
                <TableRow key={earning.id} className="border-[#0B2E2F]/10">
                  <TableCell className="py-2 font-mono text-[11px] text-[#0B2E2F]">
                    {earning.orderId}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-[#0B2E2F]/72">
                    ${earning.orderTotal} {earning.currencyCode}
                  </TableCell>
                  <TableCell className="py-2 text-xs font-semibold text-[#0B2E2F]">
                    {formatUsd(
                      earning.normalizedCommissionAmount ?? earning.commissionAmount,
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-[#0B2E2F]/58">
                    {earning.payoutPeriodStart && earning.payoutPeriodEnd
                      ? formatPayoutPeriodLabel({
                          start: earning.payoutPeriodStart,
                          end: earning.payoutPeriodEnd,
                          timezone: earning.payoutPeriodTimezone,
                        })
                      : "-"}
                  </TableCell>
                  <TableCell className="py-2">
                    <span
                      className={`${affiliateStatusChipClass} ${getPayoutStatusClasses(earning.status)}`}
                    >
                      {earning.status}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-xs text-[#0B2E2F]/58">
                    {formatProviderLabel(earning.paymentProvider)}
                  </TableCell>
                </TableRow>
              ))}

              {earnings.length === 0 ? (
                <TableRow className="border-[#0B2E2F]/10">
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-[11px] text-[#0B2E2F]/58"
                  >
                    No earnings yet. Paid referred orders will create earned entries
                    automatically.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </AffiliatePanel>
    </div>
  );
}
