import { ArrowRight, Wallet } from "lucide-react";
import Link from "next/link";

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
  getPromoterTrackingInfo,
  listPromoterInvites,
} from "@/lib/checkout/promoter-service";
import { getPromoterEarningsForPromoter } from "@/lib/checkout/promoter-earnings-service";
import {
  buildPayoutDestinationPreview,
  getPayoutMethodLabel,
  hasCompletePayoutDestination,
} from "@/lib/checkout/payout-methods";
import { getPromoterWeeklyPayoutBatchesForPromoter } from "@/lib/checkout/promoter-weekly-payout-service";
import { DEFAULT_PROMOTER_COMMISSION_RATE } from "@/lib/checkout/promoter-math";

import {
  PromoterTrackingLinks,
  PromoterWalletForm,
} from "./promoter-dashboard-actions";
import {
  PromoterPanel,
  PromoterSectionHeader,
  PromoterStatCard,
  promoterStatusChipClass,
  promoterSecondaryButtonClass,
  promoterChipClass,
  getPromoterStatusClasses,
} from "./_components/promoter-shell";

export const metadata = {
  title: "Promoter Dashboard | Revalin",
};

function formatUsd(value: string | number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "-";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export default async function PromoterDashboardPage() {
  const session = await getServerSession();
  if (!session?.user) return null;

  const promoter = await getPromoterByUserIdentity({
    userId: session.user.id,
    email: session.user.email,
  });

  if (!promoter || promoter.status !== "approved") return null;

  const [inviteRows, earnings, weeklyBatches, trackingInfo] = await Promise.all([
    listPromoterInvites({ promoterId: promoter.id }),
    getPromoterEarningsForPromoter(promoter.id),
    getPromoterWeeklyPayoutBatchesForPromoter(promoter.id),
    getPromoterTrackingInfo(promoter),
  ]);

  const totalEarned = earnings.reduce(
    (sum, earning) =>
      sum + Number(earning.normalizedCommissionAmount ?? earning.commissionAmount),
    0,
  );
  const totalPaid = weeklyBatches
    .filter((batch) => batch.status === "paid")
    .reduce((sum, batch) => sum + Number(batch.netPayoutAmount), 0);
  const successfulInvites = inviteRows.filter(
    (row) => row.invite.status === "successful",
  ).length;
  const payoutReady = hasCompletePayoutDestination({
    payoutMethod: promoter.payoutMethod,
    walletAddress: promoter.walletAddress,
    achAccountHolderName: promoter.achAccountHolderName,
    achBankName: promoter.achBankName,
    achAccountType: promoter.achAccountType,
    achRoutingNumberLast4: promoter.achRoutingNumberLast4,
    achAccountNumberLast4: promoter.achAccountNumberLast4,
  });
  const payoutDestinationPreview = buildPayoutDestinationPreview({
    payoutMethod: promoter.payoutMethod,
    walletAddress: promoter.walletAddress,
    achAccountHolderName: promoter.achAccountHolderName,
    achBankName: promoter.achBankName,
    achAccountType: promoter.achAccountType,
    achRoutingNumberLast4: promoter.achRoutingNumberLast4,
    achAccountNumberLast4: promoter.achAccountNumberLast4,
  });
  const payoutMethodLabel = getPayoutMethodLabel(promoter.payoutMethod);

  const earningsByCode = new Map<string, number>();
  for (const earning of earnings) {
    const code = earning.affiliateCode;
    if (code) {
      earningsByCode.set(
        code,
        (earningsByCode.get(code) ?? 0) +
          Number(earning.normalizedCommissionAmount ?? earning.commissionAmount),
      );
    }
  }

  return (
    <div className="space-y-3">
      <section className="grid gap-3 md:grid-cols-3">
        <PromoterStatCard
          label="Active partners"
          value={successfulInvites}
          detail={`${inviteRows.length} total invite${inviteRows.length === 1 ? "" : "s"} sent.`}
          tone="inverse"
          size="compact"
        />
        <PromoterStatCard
          label="Total earned"
          value={formatUsd(totalEarned)}
          detail={`${earnings.length} earned ${earnings.length === 1 ? "entry" : "entries"}.`}
          size="compact"
        />
        <PromoterStatCard
          label="Paid out"
          value={formatUsd(totalPaid)}
          detail="Completed net payouts after any ACH fee."
          size="compact"
        />
      </section>

      <PromoterPanel>
        <PromoterSectionHeader
          eyebrow="Tracking"
          title="Promoter tracking link"
          description="Send this to people applying for Growth Partner access. If you are also a Growth Partner, your Growth Partner code can be used here too."
          action={
            trackingInfo.affiliateCode ? (
              <span className={promoterChipClass}>
                Affiliate code supported
              </span>
            ) : null
          }
        />
        <div className="mt-3">
          <PromoterTrackingLinks {...trackingInfo} />
        </div>
      </PromoterPanel>

      <PromoterPanel id="payout-settings">
        <PromoterSectionHeader
          eyebrow="Payout"
          title="Payout settings"
          description={`${payoutReady ? payoutMethodLabel : "Payout details needed"}. ${payoutDestinationPreview.subtitle || payoutDestinationPreview.title}`}
        />
        <div className="mt-3">
          <PromoterWalletForm
            currentMethod={promoter.payoutMethod}
            currentWallet={promoter.walletAddress}
            achAccountHolderName={promoter.achAccountHolderName}
            achBankName={promoter.achBankName}
            achAccountType={promoter.achAccountType}
            achRoutingNumberLast4={promoter.achRoutingNumberLast4}
            achAccountNumberLast4={promoter.achAccountNumberLast4}
          />
        </div>
      </PromoterPanel>

      <PromoterPanel>
        <PromoterSectionHeader
          eyebrow="Partners"
          title="Recruited Growth Partners"
          description="All invites sent through your promoter link. Successful partners generate promoter commission on their referred sales."
          action={
            <Link
              href="/promoter/dashboard/payouts"
              className={`inline-flex items-center justify-center gap-2 ${promoterSecondaryButtonClass}`}
            >
              View payouts
              <ArrowRight className="size-4" />
            </Link>
          }
        />

        <div className="mt-3 overflow-hidden border border-[#0B2E2F]/10 bg-white/72">
          <Table>
            <TableHeader>
              <TableRow className="border-[#0B2E2F]/10">
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Partner
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Code
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Partner Status
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Invite Status
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Commission Rate
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Commission Earned
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Joined
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inviteRows.map((row) => {
                const commissionRate =
                  row.invite.commissionRate ||
                  promoter.defaultCommissionRate ||
                  DEFAULT_PROMOTER_COMMISSION_RATE;
                const earned = row.affiliateCode
                  ? earningsByCode.get(row.affiliateCode) ?? 0
                  : 0;

                return (
                  <TableRow key={row.invite.id} className="border-[#0B2E2F]/10">
                    <TableCell className="py-2">
                      <div>
                        <p className="text-xs font-semibold text-[#0B2E2F]">
                          {row.affiliateName || row.invite.invitedName || "-"}
                        </p>
                        <p className="text-[11px] text-[#0B2E2F]/58">
                          {row.affiliateEmail || row.invite.invitedEmail}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 font-mono text-[11px] text-[#0B2E2F]">
                      {row.affiliateCode || "-"}
                    </TableCell>
                    <TableCell className="py-2">
                      {row.affiliateStatus ? (
                        <span
                          className={`${promoterStatusChipClass} ${getPromoterStatusClasses(row.affiliateStatus)}`}
                        >
                          {row.affiliateStatus}
                        </span>
                      ) : (
                        <span className="text-[11px] text-[#0B2E2F]/46">-</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <span
                        className={`${promoterStatusChipClass} ${getPromoterStatusClasses(
                          row.invite.status === "successful"
                            ? "approved"
                            : row.invite.status === "applied"
                              ? "pending"
                              : row.invite.status === "cancelled"
                                ? "suspended"
                                : row.invite.status,
                        )}`}
                      >
                        {row.invite.status}
                      </span>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-[#0B2E2F]/72">
                      {(Number(commissionRate) * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className="py-2 text-xs font-semibold text-[#0B2E2F]">
                      {earned > 0 ? formatUsd(earned) : "-"}
                    </TableCell>
                    <TableCell className="py-2 text-[11px] text-[#0B2E2F]/62">
                      {formatDate(row.invite.successfulAt)}
                    </TableCell>
                  </TableRow>
                );
              })}

              {inviteRows.length === 0 ? (
                <TableRow className="border-[#0B2E2F]/10">
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-[11px] text-[#0B2E2F]/58"
                  >
                    No partner invites yet. Share your promoter tracking link to
                    start recruiting Growth Partners.
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
