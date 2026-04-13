import Link from "next/link";
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
import {
  getPromoterByUserIdentity,
  listPromoterInvites,
} from "@/lib/checkout/promoter-service";
import { getPromoterEarningsForPromoter } from "@/lib/checkout/promoter-earnings-service";
import { getPromoterWeeklyPayoutBatchesForPromoter } from "@/lib/checkout/promoter-weekly-payout-service";
import { formatPayoutPeriodLabel } from "@/lib/checkout/payout-periods";

import {
  PromoterPanel,
  PromoterSectionHeader,
  PromoterStatCard,
  promoterStatusChipClass,
  getPayoutStatusClasses,
  getPromoterStatusClasses,
} from "../_components/promoter-shell";

export const metadata = {
  title: "Payouts | Promoter Dashboard | Revalin",
};

function formatUsd(value: string | number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function walletPreview(value: string) {
  const normalized = value.trim();
  if (!normalized) return "Not connected";
  if (normalized.length <= 10) return normalized;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

export default async function PromoterPayoutsPage() {
  const session = await getServerSession();
  if (!session?.user) return null;

  const promoter = await getPromoterByUserIdentity({
    userId: session.user.id,
    email: session.user.email,
  });

  if (!promoter || promoter.status !== "approved") return null;

  const [earnings, weeklyBatches, inviteRows] = await Promise.all([
    getPromoterEarningsForPromoter(promoter.id),
    getPromoterWeeklyPayoutBatchesForPromoter(promoter.id),
    listPromoterInvites({ promoterId: promoter.id }),
  ]);

  const totalEarned = earnings.reduce(
    (sum, earning) =>
      sum +
      Number(earning.normalizedCommissionAmount ?? earning.commissionAmount),
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
    .reduce(
      (sum, batch) => sum + Number(batch.totalNormalizedCommissionAmount),
      0,
    );
  const totalPaid = weeklyBatches
    .filter((batch) => batch.status === "paid")
    .reduce(
      (sum, batch) => sum + Number(batch.totalNormalizedCommissionAmount),
      0,
    );
  const totalRejected = earnings
    .filter((earning) => earning.status === "rejected")
    .reduce(
      (sum, earning) =>
        sum +
        Number(earning.normalizedCommissionAmount ?? earning.commissionAmount),
      0,
    );

  const hasWallet = Boolean(promoter.walletAddress?.trim());
  const nextToSettle = weeklyBatches.find(
    (batch) => batch.status === "approved" || batch.status === "pending",
  );

  const partnerNameMap = new Map<string, string>();
  for (const row of inviteRows) {
    if (row.affiliateCode && (row.affiliateName || row.invite.invitedName)) {
      partnerNameMap.set(
        row.affiliateCode,
        row.affiliateName || row.invite.invitedName || "",
      );
    }
  }

  const partnerEarningSummary = Array.from(
    earnings.reduce((summary, earning) => {
      const code = earning.affiliateCode || "unknown";
      const entry = summary.get(code) || { count: 0, amount: 0 };
      entry.count += 1;
      entry.amount += Number(
        earning.normalizedCommissionAmount ?? earning.commissionAmount,
      );
      summary.set(code, entry);
      return summary;
    }, new Map<string, { count: number; amount: number }>()),
  );

  return (
    <div className="space-y-3">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <PromoterStatCard
          label="Total earned"
          value={formatUsd(totalEarned)}
          detail={`${earnings.length} earned ${earnings.length === 1 ? "entry" : "entries"}.`}
          tone="inverse"
          size="compact"
        />
        <PromoterStatCard
          label="Pending review"
          value={formatUsd(totalPendingReview)}
          detail="New earnings waiting for a weekly payout batch."
          size="compact"
        />
        <PromoterStatCard
          label="Ready to send"
          value={formatUsd(totalApproved)}
          detail={
            hasWallet
              ? `Wallet ${walletPreview(promoter.walletAddress)}.`
              : "Set a payout wallet before approved weekly payouts are sent."
          }
          size="compact"
        />
        <PromoterStatCard
          label="Paid out"
          value={formatUsd(totalPaid)}
          detail="Completed weekly USDC payouts."
          size="compact"
        />
        <PromoterStatCard
          label="Rejected"
          value={formatUsd(totalRejected)}
          detail="Earnings removed from payout flow."
          size="compact"
        />
      </section>

      <PromoterPanel>
        <PromoterSectionHeader
          eyebrow="Weekly payouts"
          title="Settlement history"
          action={
            <Link
              href="/promoter/dashboard#payout-wallet"
              className={`inline-flex h-8 items-center justify-center gap-2 rounded-none border border-[#0B2E2F]/12 bg-[#FCFAF6] px-3 text-[11px] uppercase tracking-[0.14em] text-[#0B2E2F] hover:bg-white`}
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
              Current wallet
            </div>
            <p className="mt-2 font-mono text-xs font-semibold text-[#0B2E2F]">
              {walletPreview(promoter.walletAddress)}
            </p>
            <Link
              href="/promoter/dashboard#payout-wallet"
              className="mt-3 inline-flex items-center gap-2 text-[11px] font-semibold text-[#0B2E2F] underline underline-offset-4"
            >
              {hasWallet ? "Update payout wallet" : "Set payout wallet"}
              <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="border border-[#0B2E2F]/10 bg-[#FCFAF6] px-3 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0B2E2F]">
              <CheckCircle className="size-4" />
              Promoter status
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`${promoterStatusChipClass} ${getPromoterStatusClasses(promoter.status)}`}
              >
                {promoter.status}
              </span>
              <span className="text-xs font-semibold text-[#0B2E2F]">
                {promoter.code}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-[#0B2E2F]/58">
              Default commission rate{" "}
              {(Number(promoter.defaultCommissionRate) * 100).toFixed(1)}%.
            </p>
          </div>

          <div className="border border-[#0B2E2F]/10 bg-[#FCFAF6] px-3 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0B2E2F]">
              <Clock className="size-4" />
              Earning sources
            </div>
            {partnerEarningSummary.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                {partnerEarningSummary.map(([code, summary]) => (
                  <div
                    key={code}
                    className="flex items-center justify-between gap-3 text-[11px] text-[#0B2E2F]"
                  >
                    <span>
                      {partnerNameMap.get(code) || code}
                    </span>
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
                  Payout
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Status
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Transaction
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
                  <TableCell className="py-2 text-xs font-semibold text-[#0B2E2F]">
                    {formatUsd(batch.totalNormalizedCommissionAmount)}
                  </TableCell>
                  <TableCell className="py-2">
                    <span
                      className={`${promoterStatusChipClass} ${getPayoutStatusClasses(batch.status)}`}
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
                    ) : (
                      "-"
                    )}
                  </TableCell>
                </TableRow>
              ))}

              {weeklyBatches.length === 0 ? (
                <TableRow className="border-[#0B2E2F]/10">
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-[11px] text-[#0B2E2F]/58"
                  >
                    No weekly payout batches yet. New earnings accumulate through
                    the week and appear here once they are grouped for payout.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </PromoterPanel>

      <PromoterPanel>
        <PromoterSectionHeader
          eyebrow="Earnings"
          title="Per-sale earnings"
          description="Each earning represents your promoter commission from a recruited Growth Partner's referred sale."
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
                  Your commission
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Growth Partner
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Weekly batch
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Status
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
                      earning.normalizedCommissionAmount ??
                        earning.commissionAmount,
                    )}
                  </TableCell>
                  <TableCell className="py-2">
                    <div>
                      <p className="text-xs font-medium text-[#0B2E2F]">
                        {earning.affiliateCode
                          ? partnerNameMap.get(earning.affiliateCode) ||
                            earning.affiliateCode
                          : "-"}
                      </p>
                      {earning.affiliateCode &&
                      partnerNameMap.get(earning.affiliateCode) ? (
                        <p className="text-[10px] text-[#0B2E2F]/46">
                          {earning.affiliateCode}
                        </p>
                      ) : null}
                    </div>
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
                      className={`${promoterStatusChipClass} ${getPayoutStatusClasses(earning.status)}`}
                    >
                      {earning.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}

              {earnings.length === 0 ? (
                <TableRow className="border-[#0B2E2F]/10">
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-[11px] text-[#0B2E2F]/58"
                  >
                    No earnings yet. When your recruited Growth Partners generate
                    paid referred orders, your promoter commission will appear
                    here.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </PromoterPanel>
    </div>
  );
}
