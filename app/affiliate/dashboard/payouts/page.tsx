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
import { getPayoutsForAffiliate } from "@/lib/checkout/payout-service";

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
import { formatWalletPreview, getConfiguredWallet } from "../wallet-utils";

export const metadata = {
  title: "Payouts | Growth Partner Dashboard | Revalin",
};

function formatProviderLabel(provider?: string | null) {
  if (!provider) return "Manual";

  return provider
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
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

  const [payouts, commissionOverview] = await Promise.all([
    getPayoutsForAffiliate(affiliate.id),
    getAffiliateCommissionOverview({ affiliateId: affiliate.id }).catch(
      () => null,
    ),
  ]);
  const currentCommissionSummary = commissionOverview?.summary ?? null;
  const totalEarned = payouts.reduce(
    (sum, payout) => sum + Number(payout.commissionAmount),
    0,
  );
  const totalPaid = payouts
    .filter((payout) => payout.status === "paid")
    .reduce((sum, payout) => sum + Number(payout.commissionAmount), 0);
  const totalPendingReview = payouts
    .filter((payout) => payout.status === "pending")
    .reduce((sum, payout) => sum + Number(payout.commissionAmount), 0);
  const totalApproved = payouts
    .filter((payout) => payout.status === "approved")
    .reduce((sum, payout) => sum + Number(payout.commissionAmount), 0);
  const totalRejected = payouts
    .filter((payout) => payout.status === "rejected")
    .reduce((sum, payout) => sum + Number(payout.commissionAmount), 0);
  const nextToSettle = payouts.find(
    (payout) => payout.status === "approved" || payout.status === "pending",
  );
  const configuredWallet = getConfiguredWallet(affiliate.walletAddress);
  const walletPreview = formatWalletPreview(affiliate.walletAddress);
  const hasWallet = Boolean(configuredWallet);
  const providerSummary = Array.from(
    payouts.reduce((summary, payout) => {
      const key = payout.paymentProvider || "manual";
      const entry = summary.get(key) || { count: 0, amount: 0 };

      entry.count += 1;
      entry.amount += Number(payout.commissionAmount);
      summary.set(key, entry);

      return summary;
    }, new Map<string, { count: number; amount: number }>()),
  );

  return (
    <div className="space-y-3">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <AffiliateStatCard
          label="Total earned"
          value={`$${totalEarned.toFixed(2)}`}
          detail={`${payouts.length} ledger ${payouts.length === 1 ? "entry" : "entries"}.`}
          tone="inverse"
          size="compact"
        />
        <AffiliateStatCard
          label="Pending review"
          value={`$${totalPendingReview.toFixed(2)}`}
          detail="Waiting for approval."
          size="compact"
        />
        <AffiliateStatCard
          label="Ready to send"
          value={`$${totalApproved.toFixed(2)}`}
          detail={
            hasWallet
              ? `Wallet ${walletPreview}.`
              : "Set a payout wallet before approved payouts are sent."
          }
          size="compact"
        />
        <AffiliateStatCard
          label="Paid out"
          value={`$${totalPaid.toFixed(2)}`}
          detail="Completed USDC payouts."
          size="compact"
        />
        <AffiliateStatCard
          label="Rejected"
          value={`$${totalRejected.toFixed(2)}`}
          detail="Entries removed from payout flow."
          size="compact"
        />
      </section>

      <AffiliatePanel>
        <AffiliateSectionHeader
          eyebrow="Payouts"
          title="Payout ledger"
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
              Current wallet
            </div>
            <p className="mt-2 font-mono text-xs font-semibold text-[#0B2E2F]">
              {walletPreview}
            </p>
            <Link
              href="/affiliate/dashboard#payout-settings"
              className="mt-3 inline-flex items-center gap-2 text-[11px] font-semibold text-[#0B2E2F] underline underline-offset-4"
            >
              {hasWallet ? "Update payout wallet" : "Set payout wallet"}
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
              %.
            </p>
          </div>

          <div className="border border-[#0B2E2F]/10 bg-[#FCFAF6] px-3 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0B2E2F]">
              <Clock className="size-4" />
              Transaction sources
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
                      {summary.count} / ${summary.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-[#0B2E2F]/58">
                No payouts recorded yet.
              </p>
            )}
            {nextToSettle ? (
              <p className="mt-3 text-[11px] text-[#0B2E2F]/58">
                Next in flow: order {nextToSettle.orderId}.
              </p>
            ) : null}
          </div>
        </div>

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
                  Commission
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Status
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Source
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Transaction
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Date
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payouts.map((payout) => (
                <TableRow key={payout.id} className="border-[#0B2E2F]/10">
                  <TableCell className="py-2 font-mono text-[11px] text-[#0B2E2F]">
                    {payout.orderId}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-[#0B2E2F]/72">
                    ${payout.orderTotal} {payout.currencyCode}
                  </TableCell>
                  <TableCell className="py-2 text-xs font-semibold text-[#0B2E2F]">
                    ${payout.commissionAmount}
                  </TableCell>
                  <TableCell className="py-2">
                    <span
                      className={`${affiliateStatusChipClass} ${getPayoutStatusClasses(payout.status)}`}
                    >
                      {payout.status}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-xs text-[#0B2E2F]/58">
                    {formatProviderLabel(payout.paymentProvider)}
                  </TableCell>
                  <TableCell className="max-w-[140px] truncate py-2 text-[11px] font-mono text-[#0B2E2F]/46">
                    {payout.txHash ? (
                      <a
                        href={`https://polygonscan.com/tx/${payout.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-[#0B2E2F]"
                      >
                        {payout.txHash.slice(0, 10)}...
                        <ArrowRight className="size-3" />
                      </a>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-[#0B2E2F]/46">
                    {new Date(payout.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}

              {payouts.length === 0 ? (
                <TableRow className="border-[#0B2E2F]/10">
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-[11px] text-[#0B2E2F]/58"
                  >
                    No payouts yet. Referred paid orders will populate this
                    ledger automatically.
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
