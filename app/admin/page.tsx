import Link from "next/link";

import { ArrowUpRight } from "lucide-react";
import { eq, sql } from "drizzle-orm";

import {
  getSiteMetrics,
  getTopPages,
  getReferrerData,
  hasOpenPanelCredentials,
} from "@/lib/analytics/openpanel";
import { db } from "@/lib/db";
import {
  affiliatePayouts,
  affiliates,
  checkoutOrders,
  user,
} from "@/lib/db/schema";

import {
  AdminPanel,
  AdminSectionHeader,
  AdminStatCard,
} from "./_components/admin-shell";

export const metadata = {
  title: "Admin Dashboard | Revalin",
};

type CountRow = { count: number | string | null };

function getCount(rows: CountRow[]) {
  return Number(rows[0]?.count ?? 0);
}

function getListCount(entry: any) {
  return Number(entry?.count ?? entry?.views ?? 0);
}

function formatCompact(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";

  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(numericValue);
  }

  return String(value);
}

function formatPercent(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "-";

  return `${(numericValue * 100).toFixed(1)}%`;
}

export default async function AdminOverviewPage() {
  const openPanelConfigured = hasOpenPanelCredentials();
  const [
    metrics,
    topPages,
    referrers,
    userCount,
    orderCount,
    affiliateCount,
    bannedUserCount,
    pendingAffiliateCount,
    pendingPayoutCount,
    approvedPayoutCount,
  ] = await Promise.all([
    getSiteMetrics("30d").catch(() => null),
    getTopPages("30d").catch(() => []),
    getReferrerData("30d").catch(() => []),
    db
      .select({ count: sql<number>`count(*)` })
      .from(user)
      .then(getCount),
    db
      .select({ count: sql<number>`count(*)` })
      .from(checkoutOrders)
      .then(getCount),
    db
      .select({ count: sql<number>`count(*)` })
      .from(affiliates)
      .then(getCount),
    db
      .select({ count: sql<number>`count(*)` })
      .from(user)
      .where(eq(user.banned, true))
      .then(getCount),
    db
      .select({ count: sql<number>`count(*)` })
      .from(affiliates)
      .where(eq(affiliates.status, "pending"))
      .then(getCount),
    db
      .select({ count: sql<number>`count(*)` })
      .from(affiliatePayouts)
      .where(eq(affiliatePayouts.status, "pending"))
      .then(getCount),
    db
      .select({ count: sql<number>`count(*)` })
      .from(affiliatePayouts)
      .where(eq(affiliatePayouts.status, "approved"))
      .then(getCount),
  ]);

  const queueCards = [
    {
      label: "Growth Partner approvals",
      value: pendingAffiliateCount,
      href: "/admin/affiliates",
    },
    {
      label: "Payout approvals",
      value: pendingPayoutCount,
      href: "/admin/payouts",
    },
    {
      label: "Ready to settle",
      value: approvedPayoutCount,
      href: "/admin/payouts",
    },
    {
      label: "Restricted accounts",
      value: bannedUserCount,
      href: "/admin/users",
    },
  ];

  const commandLinks = [
    {
      label: "Review new Growth Partners",
      href: "/admin/affiliates",
    },
    {
      label: "Clear payout queue",
      href: "/admin/payouts",
    },
    {
      label: "Manage account access",
      href: "/admin/users",
    },
  ];

  const topPagesMax = Math.max(
    1,
    ...topPages.map((page: any) => getListCount(page)),
  );
  const referrersMax = Math.max(
    1,
    ...referrers.map((ref: any) => getListCount(ref)),
  );

  return (
    <div className="space-y-6">
      <AdminSectionHeader title="Operational snapshot" />

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.85fr]">
        <AdminPanel tone="inverse" className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(244,241,234,0.12)_0%,rgba(244,241,234,0)_60%)]" />
          <div className="relative space-y-8">
            <h3 className="max-w-3xl text-[2.35rem] font-semibold leading-none tracking-[-0.08em] text-balance">
              Traffic, approvals, and payout movement.
            </h3>

            {metrics ? (
              <div className="grid gap-px border border-[#F4F1EA]/12 bg-[#F4F1EA]/12 sm:grid-cols-3">
                <div className="bg-[#0E3435] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#F4F1EA]/48">
                    Visitors
                  </p>
                  <p className="mt-3 text-2xl font-semibold tracking-[-0.05em]">
                    {formatCompact(
                      metrics.visitors ?? metrics.current_visitors,
                    )}
                  </p>
                </div>
                <div className="bg-[#0E3435] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#F4F1EA]/48">
                    Sessions
                  </p>
                  <p className="mt-3 text-2xl font-semibold tracking-[-0.05em]">
                    {formatCompact(metrics.sessions)}
                  </p>
                </div>
                <div className="bg-[#0E3435] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#F4F1EA]/48">
                    Bounce rate
                  </p>
                  <p className="mt-3 text-2xl font-semibold tracking-[-0.05em]">
                    {formatPercent(metrics.bounce_rate)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-[#F4F1EA]/20 p-4 text-sm leading-6 text-[#F4F1EA]/68">
                {openPanelConfigured ? (
                  <>
                    OpenPanel telemetry is configured, but the Insights API did
                    not return dashboard data. Check the server logs for the
                    exact OpenPanel response and confirm this client has{" "}
                    <span className="font-medium text-[#F4F1EA]">read</span> or{" "}
                    <span className="font-medium text-[#F4F1EA]">root</span>{" "}
                    access.
                  </>
                ) : (
                  <>
                    OpenPanel analytics are not configured yet. Set{" "}
                    <code className="bg-[#F4F1EA]/8 px-1.5 py-1 font-mono text-xs text-[#F4F1EA]">
                      NEXT_PUBLIC_OPENPANEL_CLIENT_ID
                    </code>{" "}
                    and{" "}
                    <code className="bg-[#F4F1EA]/8 px-1.5 py-1 font-mono text-xs text-[#F4F1EA]">
                      OPENPANEL_CLIENT_SECRET
                    </code>{" "}
                    to unlock traffic telemetry here.
                  </>
                )}
              </div>
            )}
          </div>
        </AdminPanel>

        <AdminPanel className="p-0">
          <div className="border-b border-[#0B2E2F]/12 px-5 py-4">
            <h3 className="text-xl font-semibold tracking-[-0.05em] text-[#0B2E2F]">
              Active queues
            </h3>
          </div>
          <div className="grid gap-px bg-[#0B2E2F]/10">
            {queueCards.map((card) => (
              <Link
                key={card.label}
                href={card.href}
                className="flex items-start justify-between gap-4 bg-[#FCFAF6] px-5 py-4 transition-colors hover:bg-[#F1EADB]"
              >
                <p className="text-sm font-semibold text-[#0B2E2F]">
                  {card.label}
                </p>
                <div className="flex items-center gap-3 text-[#0B2E2F]">
                  <span className="text-2xl font-semibold tracking-[-0.05em]">
                    {card.value}
                  </span>
                  <ArrowUpRight className="size-4" />
                </div>
              </Link>
            ))}
          </div>
        </AdminPanel>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard label="Total users" value={userCount} />
        <AdminStatCard label="Total orders" value={orderCount} />
        <AdminStatCard label="Total Growth Partners" value={affiliateCount} />
        <AdminStatCard
          label="Page views"
          value={
            metrics
              ? formatCompact(metrics.pageviews ?? metrics.page_views)
              : "-"
          }
          tone="muted"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <AdminPanel className="p-0">
          <div className="border-b border-[#0B2E2F]/12 px-5 py-4">
            <h3 className="text-xl font-semibold tracking-[-0.05em] text-[#0B2E2F]">
              Top pages
            </h3>
          </div>

          {topPages.length > 0 ? (
            <div className="space-y-3 px-5 py-5">
              {topPages.slice(0, 8).map((page: any, index: number) => {
                const count = getListCount(page);
                const width = `${Math.max(10, (count / topPagesMax) * 100)}%`;

                return (
                  <div
                    key={`${page.path ?? page.name}-${index}`}
                    className="space-y-2"
                  >
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <span className="truncate text-[#0B2E2F]/68">
                        {page.path || page.name}
                      </span>
                      <span className="shrink-0 font-semibold text-[#0B2E2F]">
                        {count}
                      </span>
                    </div>
                    <div className="h-2 bg-[#E7E0D2]">
                      <div className="h-full bg-[#0B2E2F]" style={{ width }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-10 text-sm text-[#0B2E2F]/52">
              No page analytics available yet.
            </div>
          )}
        </AdminPanel>

        <div className="grid gap-4">
          <AdminPanel className="p-0">
            <div className="border-b border-[#0B2E2F]/12 px-5 py-4">
              <h3 className="text-xl font-semibold tracking-[-0.05em] text-[#0B2E2F]">
                Top referrers
              </h3>
            </div>

            {referrers.length > 0 ? (
              <div className="space-y-3 px-5 py-5">
                {referrers.slice(0, 8).map((ref: any, index: number) => {
                  const count = getListCount(ref);
                  const width = `${Math.max(10, (count / referrersMax) * 100)}%`;

                  return (
                    <div
                      key={`${ref.name ?? ref.referrer}-${index}`}
                      className="space-y-2"
                    >
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <span className="truncate text-[#0B2E2F]/68">
                          {ref.name || ref.referrer || "Direct"}
                        </span>
                        <span className="shrink-0 font-semibold text-[#0B2E2F]">
                          {count}
                        </span>
                      </div>
                      <div className="h-2 bg-[#E7E0D2]">
                        <div
                          className="h-full bg-[#826B44]"
                          style={{ width }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-5 py-10 text-sm text-[#0B2E2F]/52">
                No referrer data available yet.
              </div>
            )}
          </AdminPanel>

          <AdminPanel className="p-0">
            <div className="border-b border-[#0B2E2F]/12 px-5 py-4">
              <h3 className="text-xl font-semibold tracking-[-0.05em] text-[#0B2E2F]">
                Fast paths
              </h3>
            </div>
            <div className="grid gap-px bg-[#0B2E2F]/10">
              {commandLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-start justify-between gap-4 bg-[#FCFAF6] px-5 py-4 transition-colors hover:bg-[#F1EADB]"
                >
                  <p className="text-sm font-semibold text-[#0B2E2F]">
                    {item.label}
                  </p>
                  <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-[#0B2E2F]" />
                </Link>
              ))}
            </div>
          </AdminPanel>
        </div>
      </div>
    </div>
  );
}
