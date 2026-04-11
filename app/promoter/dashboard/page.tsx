import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Wallet } from "lucide-react";

import { PageLayout } from "@/components/layout/page-layout";
import { getServerSession } from "@/lib/auth-server";
import {
  getPromoterByUserIdentity,
  getPromoterTrackingInfo,
  listPromoterInvites,
} from "@/lib/checkout/promoter-service";
import { getPromoterEarningsForPromoter } from "@/lib/checkout/promoter-earnings-service";
import { getPromoterWeeklyPayoutBatchesForPromoter } from "@/lib/checkout/promoter-weekly-payout-service";
import { formatPayoutPeriodLabel } from "@/lib/checkout/payout-periods";

import {
  PromoterInviteForm,
  PromoterTrackingLinks,
  PromoterWalletForm,
} from "./promoter-dashboard-actions";

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

function formatRate(value: string | number) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function walletPreview(value: string) {
  const normalized = value.trim();
  if (!normalized) return "No wallet on file";
  if (normalized.length <= 14) return normalized;
  return `${normalized.slice(0, 8)}...${normalized.slice(-6)}`;
}

export default async function PromoterDashboardPage() {
  const session = await getServerSession();
  if (!session?.user) {
    redirect("/login?callbackUrl=/promoter/dashboard");
  }

  const promoter = await getPromoterByUserIdentity({
    userId: session.user.id,
    email: session.user.email,
  });

  if (!promoter || promoter.status !== "approved") {
    return (
      <PageLayout>
        <div className="px-sides pt-top-spacing pb-16">
          <div className="mx-auto max-w-3xl border border-[#0B2E2F]/12 bg-[#FCFAF6] px-5 py-5">
            <h1 className="text-2xl font-semibold tracking-tight text-[#0B2E2F]">
              Promoter access is not active.
            </h1>
            <p className="mt-2 text-sm text-[#0B2E2F]/64">
              Contact the admin team if this account should invite Growth Partners.
            </p>
            <Link
              href="/account"
              className="mt-4 inline-flex h-9 items-center gap-2 rounded-none border border-[#0B2E2F]/12 bg-white px-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]"
            >
              <ArrowLeft className="size-4" />
              Back to account
            </Link>
          </div>
        </div>
      </PageLayout>
    );
  }

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
    .reduce((sum, batch) => sum + Number(batch.totalNormalizedCommissionAmount), 0);
  const successfulInvites = inviteRows.filter(
    (row) => row.invite.status === "successful",
  ).length;

  return (
    <PageLayout>
      <div className="px-sides pt-top-spacing pb-16">
        <div className="mx-auto max-w-6xl space-y-4">
          <section className="border border-[#0B2E2F]/12 bg-[#0B2E2F] px-4 py-4 text-[#F4F1EA]">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#F4F1EA]/46">
                  Promoter
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                  Promoter dashboard
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-[#F4F1EA]/68">
                  Invite Growth Partners, track successful mappings, and manage the wallet used for promoter payouts.
                </p>
              </div>
              <Link
                href="/account"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-none border border-white/12 bg-white/8 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#F4F1EA]"
              >
                <ArrowLeft className="size-4" />
                Account
              </Link>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-4">
            {[
              ["Invites", inviteRows.length],
              ["Successful", successfulInvites],
              ["Total earned", formatUsd(totalEarned)],
              ["Paid out", formatUsd(totalPaid)],
            ].map(([label, value]) => (
              <div key={label} className="border border-[#0B2E2F]/10 bg-[#FCFAF6] px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  {label}
                </p>
                <p className="mt-2 text-lg font-semibold text-[#0B2E2F]">{value}</p>
              </div>
            ))}
          </section>

          <section className="border border-[#0B2E2F]/10 bg-white px-4 py-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#0B2E2F]">
                  Promoter tracking link
                </h2>
                <p className="mt-1 max-w-2xl text-xs text-[#0B2E2F]/58">
                  Send this to people applying for Growth Partner access. If you are also a Growth Partner, your Growth Partner code can be used here too.
                </p>
              </div>
              {trackingInfo.affiliateCode ? (
                <span className="border border-[#0B2E2F]/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/62">
                  Affiliate code supported
                </span>
              ) : null}
            </div>
            <div className="mt-4">
              <PromoterTrackingLinks {...trackingInfo} />
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="border border-[#0B2E2F]/10 bg-white px-4 py-4">
              <h2 className="text-lg font-semibold text-[#0B2E2F]">Invite Growth Partner</h2>
              <div className="mt-4">
                <PromoterInviteForm />
              </div>
            </div>

            <div className="border border-[#0B2E2F]/10 bg-white px-4 py-4">
              <div className="flex items-center gap-2">
                <Wallet className="size-4 text-[#0B2E2F]" />
                <h2 className="text-lg font-semibold text-[#0B2E2F]">Payout wallet</h2>
              </div>
              <p className="mt-2 text-xs text-[#0B2E2F]/58">
                Current wallet: <span className="font-mono">{walletPreview(promoter.walletAddress)}</span>
              </p>
              <div className="mt-4">
                <PromoterWalletForm currentWallet={promoter.walletAddress} />
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="border border-[#0B2E2F]/10 bg-white px-4 py-4">
              <h2 className="text-lg font-semibold text-[#0B2E2F]">Invites</h2>
              <div className="mt-3 space-y-2">
                {inviteRows.map((row) => (
                  <div key={row.invite.id} className="border border-[#0B2E2F]/10 bg-[#FCFAF6] px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#0B2E2F]">
                          {row.invite.invitedName || row.invite.invitedEmail}
                        </p>
                        <p className="text-xs text-[#0B2E2F]/58">{row.invite.invitedEmail}</p>
                      </div>
                      <span className="border border-[#0B2E2F]/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/70">
                        {row.invite.status}
                      </span>
                    </div>
                    {row.invite.commissionRate ? (
                      <p className="mt-2 text-xs text-[#0B2E2F]/58">
                        Promoter rate {formatRate(row.invite.commissionRate)}
                      </p>
                    ) : null}
                  </div>
                ))}
                {inviteRows.length === 0 ? (
                  <p className="text-xs text-[#0B2E2F]/58">No invites sent yet.</p>
                ) : null}
              </div>
            </div>

            <div className="border border-[#0B2E2F]/10 bg-white px-4 py-4">
              <h2 className="text-lg font-semibold text-[#0B2E2F]">Payouts</h2>
              <div className="mt-3 space-y-2">
                {weeklyBatches.map((batch) => (
                  <div key={batch.id} className="border border-[#0B2E2F]/10 bg-[#FCFAF6] px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#0B2E2F]">
                          {formatUsd(batch.totalNormalizedCommissionAmount)}
                        </p>
                        <p className="text-xs text-[#0B2E2F]/58">
                          {formatPayoutPeriodLabel({
                            start: batch.periodStart,
                            end: batch.periodEnd,
                            timezone: batch.periodTimezone,
                          })}
                        </p>
                      </div>
                      <span className="border border-[#0B2E2F]/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/70">
                        {batch.status}
                      </span>
                    </div>
                  </div>
                ))}
                {weeklyBatches.length === 0 ? (
                  <p className="text-xs text-[#0B2E2F]/58">
                    No weekly promoter payout batches yet.
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </div>
    </PageLayout>
  );
}
