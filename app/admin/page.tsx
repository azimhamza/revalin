import Link from "next/link";

import { ArrowUpRight } from "lucide-react";
import { and, eq, gte, inArray, sql } from "drizzle-orm";

import {
  getAdminAffiliateTelemetry,
  getInsightBreakdown,
  getLiveVisitors,
  getSiteMetrics,
  getTopPages,
  getReferrerData,
  getOpenPanelMissingConfig,
  hasOpenPanelCredentials,
} from "@/lib/analytics/openpanel";
import type {
  AdminAffiliateTelemetry,
  OpenPanelNamedValue,
} from "@/lib/analytics/openpanel";
import { db } from "@/lib/db";
import {
  affiliatePayouts,
  affiliates,
  checkoutOrders,
  user,
} from "@/lib/db/schema";
import { getAffiliateVisitReferrerBreakdown } from "@/lib/checkout/affiliate-visit-service";

import {
  AdminPanel,
  AdminStatCard,
} from "./_components/admin-shell";
import { OpenPanelAffiliateOverview } from "./_components/openpanel-affiliate-overview";
import { OpenPanelOverviewVisuals } from "./_components/openpanel-overview-visuals";

export const metadata = {
  title: "Admin Dashboard | Revalin",
};

type CountRow = { count: number | string | null };
type InsightListEntry = {
  name?: string | null;
  path?: string | null;
  referrer?: string | null;
  sessions?: number | string | null;
  count?: number | string | null;
  views?: number | string | null;
};
type AdminAnalyticsRange = "daily" | "monthly";
type AdminOverviewPageProps = {
  searchParams?: Promise<{
    analyticsRange?: string | string[];
  }>;
};

const ADMIN_ANALYTICS_RANGE_CONFIG: Record<
  AdminAnalyticsRange,
  { openPanelRange: string; label: string; startDate: () => Date }
> = {
  daily: {
    openPanelRange: "24h",
    label: "Last 24h",
    startDate: () => new Date(Date.now() - 24 * 60 * 60 * 1000),
  },
  monthly: {
    openPanelRange: "30d",
    label: "Last 30d",
    startDate: () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  },
};

function getCount(rows: CountRow[]) {
  return Number(rows[0]?.count ?? 0);
}

function getListCount(entry: InsightListEntry) {
  return Number(entry?.sessions ?? entry?.count ?? entry?.views ?? 0);
}

function normalizeAdminAnalyticsRange(
  value: string | string[] | undefined,
): AdminAnalyticsRange {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "daily" ? "daily" : "monthly";
}

function normalizeReferrerLabel(value: string | null | undefined) {
  if (!value) return "Direct";

  const normalizeKnownPlatform = (label: string) => {
    const normalized = label.trim();
    const lower = normalized.toLowerCase();

    if (lower.includes("tiktok") || lower === "tt") return "TikTok";
    if (lower.includes("instagram")) return "Instagram";
    if (lower.includes("facebook") || lower === "fb") return "Facebook";
    if (lower.includes("twitter") || lower === "x.com") return "X / Twitter";
    if (lower === "direct / unknown") return "Direct";

    return normalized;
  };

  try {
    return normalizeKnownPlatform(new URL(value).host.replace(/^www\./, ""));
  } catch {
    return normalizeKnownPlatform(value);
  }
}

function normalizeInsightRows(
  entries: InsightListEntry[],
  getName: (entry: InsightListEntry, index: number) => string,
): OpenPanelNamedValue[] {
  return entries
    .map((entry, index) => ({
      name: getName(entry, index),
      value: getListCount(entry),
    }))
    .filter((entry) => entry.name.trim().length > 0 && entry.value > 0)
    .slice(0, 5);
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

  const percentage = numericValue > 1 ? numericValue : numericValue * 100;
  return `${percentage.toFixed(1)}%`;
}

function formatDecimal(
  value: string | number | null | undefined,
  maximumFractionDigits = 1,
) {
  if (value === null || value === undefined || value === "") return "-";

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "-";

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(numericValue);
}

function formatDuration(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) return "-";

  const totalSeconds = Math.round(numericValue);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  return `${seconds}s`;
}

type ManualAffiliateTelemetryAdjustment = {
  affiliateCode: string;
  purchases: number;
  revenue: number;
};

async function getManualAffiliateTelemetryAdjustments(
  startDate: Date,
): Promise<ManualAffiliateTelemetryAdjustment[]> {
  const rows = await db
    .select({
      affiliateCode: affiliatePayouts.affiliateCode,
      purchases: sql<number>`count(*)`,
      revenue: sql<number>`coalesce(sum(coalesce(nullif(${affiliatePayouts.normalizedOrderTotal}, '')::numeric, nullif(${affiliatePayouts.orderTotal}, '')::numeric, 0)), 0)`,
    })
    .from(affiliatePayouts)
    .where(
      and(
        eq(affiliatePayouts.paymentProvider, "manual_adjustment"),
        inArray(affiliatePayouts.status, ["pending", "approved", "paid"]),
        gte(affiliatePayouts.earnedAt, startDate),
      ),
    )
    .groupBy(affiliatePayouts.affiliateCode);

  return rows.map((row) => ({
    affiliateCode: row.affiliateCode,
    purchases: Number(row.purchases ?? 0),
    revenue: Number(row.revenue ?? 0),
  }));
}

function mergeManualAdjustmentsIntoAffiliateTelemetry(
  telemetry: AdminAffiliateTelemetry | null,
  manualAdjustments: ManualAffiliateTelemetryAdjustment[],
  firstPartyReferrers: OpenPanelNamedValue[],
): AdminAffiliateTelemetry | null {
  if (manualAdjustments.length === 0 && firstPartyReferrers.length === 0) {
    return telemetry;
  }

  const leaderboardMap = new Map(
    (telemetry?.leaderboard ?? []).map((entry) => [
      entry.affiliateCode,
      { ...entry },
    ]),
  );

  for (const adjustment of manualAdjustments) {
    const entry = leaderboardMap.get(adjustment.affiliateCode) ?? {
      affiliateCode: adjustment.affiliateCode,
      visits: 0,
      purchases: 0,
      revenue: 0,
      conversionRate: null,
      avgOrderValue: null,
    };

    entry.purchases += adjustment.purchases;
    entry.revenue += adjustment.revenue;
    entry.conversionRate =
      entry.visits > 0 ? entry.purchases / entry.visits : null;
    entry.avgOrderValue =
      entry.purchases > 0 ? entry.revenue / entry.purchases : null;
    leaderboardMap.set(adjustment.affiliateCode, entry);
  }

  return {
    trend: telemetry?.trend ?? [],
    devices: telemetry?.devices ?? [],
    referrers:
      firstPartyReferrers.length > 0
        ? firstPartyReferrers
        : telemetry?.referrers ?? [],
    countries: telemetry?.countries ?? [],
    leaderboard: Array.from(leaderboardMap.values()).sort(
      (a, b) =>
        b.revenue - a.revenue ||
        b.purchases - a.purchases ||
        b.visits - a.visits,
    ),
  };
}

function mergeSiteReferrersWithFirstPartyAffiliateReferrers(
  siteReferrers: OpenPanelNamedValue[],
  firstPartyAffiliateReferrers: OpenPanelNamedValue[],
) {
  if (firstPartyAffiliateReferrers.length === 0) {
    return siteReferrers;
  }

  const referrerMap = new Map(
    siteReferrers.map((referrer) => [
      normalizeReferrerLabel(referrer.name),
      referrer.value,
    ]),
  );

  for (const referrer of firstPartyAffiliateReferrers) {
    const name = normalizeReferrerLabel(referrer.name);
    if (name === "Direct") continue;

    referrerMap.set(name, Math.max(referrerMap.get(name) ?? 0, referrer.value));
  }

  return Array.from(referrerMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name))
    .slice(0, 5);
}

export default async function AdminOverviewPage({
  searchParams,
}: AdminOverviewPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const analyticsRange = normalizeAdminAnalyticsRange(
    resolvedSearchParams.analyticsRange,
  );
  const analyticsRangeConfig = ADMIN_ANALYTICS_RANGE_CONFIG[analyticsRange];
  const openPanelConfigured = hasOpenPanelCredentials();
  const openPanelMissingConfig = getOpenPanelMissingConfig();
  const selectedAnalyticsStartDate = analyticsRangeConfig.startDate();
  const [
    metrics,
    liveVisitors,
    deviceBreakdown,
    countryBreakdown,
    topPages,
    referrers,
    affiliateTelemetry,
    manualAffiliateTelemetryAdjustments,
    affiliateFirstPartyReferrers,
    siteFirstPartyReferrers,
    affiliateRows,
    userCount,
    orderCount,
    affiliateCount,
    bannedUserCount,
    pendingAffiliateCount,
    pendingPayoutCount,
    approvedPayoutCount,
  ] = await Promise.all([
    getSiteMetrics(analyticsRangeConfig.openPanelRange).catch(() => null),
    getLiveVisitors().catch(() => null),
    getInsightBreakdown("device", analyticsRangeConfig.openPanelRange, 6).catch(
      () => [],
    ),
    getInsightBreakdown(
      "country",
      analyticsRangeConfig.openPanelRange,
      6,
    ).catch(() => []),
    getTopPages(analyticsRangeConfig.openPanelRange, 8).catch(() => []),
    getReferrerData(analyticsRangeConfig.openPanelRange, 8).catch(() => []),
    openPanelConfigured
      ? getAdminAffiliateTelemetry(analyticsRangeConfig.openPanelRange).catch(
          () => null,
        )
      : Promise.resolve(null),
    getManualAffiliateTelemetryAdjustments(selectedAnalyticsStartDate).catch(
      () => [],
    ),
    getAffiliateVisitReferrerBreakdown({
      startDate: selectedAnalyticsStartDate,
      limit: 6,
    }).catch(() => []),
    getAffiliateVisitReferrerBreakdown({
      startDate: selectedAnalyticsStartDate,
      limit: 6,
    }).catch(() => []),
    db.select({ code: affiliates.code, name: affiliates.name }).from(affiliates),
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
  const mergedAffiliateTelemetry = mergeManualAdjustmentsIntoAffiliateTelemetry(
    affiliateTelemetry,
    manualAffiliateTelemetryAdjustments,
    affiliateFirstPartyReferrers,
  );
  const normalizedTopPages = normalizeInsightRows(
    topPages as InsightListEntry[],
    (page, index) =>
      page.path?.trim() || page.name?.trim() || `Page ${index + 1}`,
  );
  const affiliateNames = Object.fromEntries(
    affiliateRows.map((row) => [row.code, row.name]),
  );
  const normalizedReferrers = mergeSiteReferrersWithFirstPartyAffiliateReferrers(
    normalizeInsightRows(
      referrers as InsightListEntry[],
      (referrer) =>
        normalizeReferrerLabel(
          referrer.name?.trim() || referrer.referrer?.trim(),
        ),
    ),
    siteFirstPartyReferrers,
  );
  const topPage = normalizedTopPages[0];
  const topReferrer = normalizedReferrers[0];
  const hasTrafficSummary = Boolean(
    metrics || liveVisitors !== null || topPage || topReferrer,
  );
  const trafficSummaryCards = [
    {
      label: "Visitors",
      value: formatCompact(metrics?.visitors),
    },
    {
      label: "Sessions",
      value: formatCompact(metrics?.sessions),
    },
    {
      label: "Page views",
      value: formatCompact(metrics?.pageViews),
    },
    {
      label: "Bounce rate",
      value: formatPercent(metrics?.bounceRate),
    },
  ];
  const trafficHeaderChips = [
    {
      label: "Window",
      value: analyticsRangeConfig.label,
    },
    {
      label: "Live",
      value: formatCompact(liveVisitors),
    },
    {
      label: "Avg session",
      value: formatDuration(metrics?.avgSessionDuration),
    },
    {
      label: "Views / session",
      value: formatDecimal(metrics?.viewsPerSession),
    },
  ];
  const trafficFooterItems = [
    {
      label: "Top page",
      value: topPage?.name ?? "No page data yet",
    },
    {
      label: "Top referrer",
      value: topReferrer?.name ?? "No referrer data yet",
    },
  ];

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

  return (
    <div className="space-y-3">
      <AdminPanel tone="inverse" className="relative overflow-hidden p-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(211,163,79,0.18),rgba(211,163,79,0)_34%),linear-gradient(135deg,rgba(244,241,234,0.08)_0%,rgba(244,241,234,0)_58%)]" />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sidebar-border px-2.5 py-2 md:px-3">
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/52">
                OpenPanel
              </p>
              <h3 className="text-sm font-semibold leading-none tracking-[-0.04em]">
                Traffic pulse
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {trafficHeaderChips.map((item) => (
                <div
                  key={item.label}
                  className="rounded-none border border-sidebar-border bg-sidebar-accent/70 px-1.5 py-1"
                >
                  <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/50">
                    {item.label}
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold tracking-[-0.02em] text-sidebar-foreground">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {hasTrafficSummary ? (
            <>
              <div className="grid gap-px bg-sidebar-border sm:grid-cols-2 xl:grid-cols-4">
                {trafficSummaryCards.map((card) => (
                  <div key={card.label} className="bg-sidebar-accent px-2.5 py-2">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/50">
                      {card.label}
                    </p>
                    <p className="mt-1 text-[1.05rem] font-semibold leading-none tracking-[-0.04em] text-sidebar-foreground">
                      {card.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-x-2.5 gap-y-1 border-t border-sidebar-border bg-sidebar-accent/60 px-2.5 py-2 text-[10px] text-sidebar-foreground/72">
                {trafficFooterItems.map((item) => (
                  <div
                    key={item.label}
                    className="flex min-w-0 items-baseline gap-2"
                  >
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/42">
                      {item.label}
                    </span>
                      <span className="max-w-[13rem] truncate font-semibold tracking-[-0.02em] text-sidebar-foreground">
                        {item.value}
                      </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="p-3">
              <div className="rounded-none border border-dashed border-sidebar-border p-2.5 text-[11px] leading-4 text-sidebar-foreground/70">
                {openPanelConfigured ? (
                  <>
                    OpenPanel telemetry is configured, but the Insights API did
                    not return dashboard data. Check the server logs for the
                    exact OpenPanel response and confirm this client has{" "}
                    <span className="font-medium text-sidebar-foreground">read</span> or{" "}
                    <span className="font-medium text-sidebar-foreground">root</span>{" "}
                    access.
                  </>
                ) : (
                  <>
                    OpenPanel is receiving traffic, but dashboard reads are not
                    fully configured. Missing{" "}
                    <code className="rounded-none bg-white/8 px-1.5 py-1 font-mono text-xs text-sidebar-foreground">
                      {openPanelMissingConfig.join(", ")}
                    </code>
                    . OpenPanel Insights/Export calls also require a client with{" "}
                    <span className="font-medium text-sidebar-foreground">read</span> or{" "}
                    <span className="font-medium text-sidebar-foreground">root</span>{" "}
                    access.
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </AdminPanel>

      <AdminPanel className="p-0">
        <div className="border-b border-border/70 px-2.5 py-2">
          <h3 className="text-sm font-semibold tracking-[-0.03em] text-foreground">
            Active queues
          </h3>
        </div>
        <div className="grid gap-px bg-border/70 sm:grid-cols-2 xl:grid-cols-4">
          {queueCards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className="group flex min-w-0 items-center justify-between gap-2 bg-background px-2.5 py-2 transition-colors hover:bg-accent"
            >
              <p className="max-w-[9rem] text-[11px] font-semibold leading-4 text-foreground">
                {card.label}
              </p>
              <div className="flex items-center gap-3 text-foreground">
                <span className="text-base font-semibold leading-none tracking-[-0.04em]">
                  {card.value}
                </span>
                <ArrowUpRight className="size-4 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      </AdminPanel>

      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard label="Total users" value={userCount} size="compact" />
        <AdminStatCard label="Total orders" value={orderCount} size="compact" />
        <AdminStatCard
          label="Total Growth Partners"
          value={affiliateCount}
          size="compact"
        />
        <AdminStatCard
          label="Page views"
          value={metrics ? formatCompact(metrics.pageViews) : "-"}
          tone="muted"
          size="compact"
        />
      </div>

      <OpenPanelOverviewVisuals
        trend={metrics?.series ?? []}
        liveVisitors={liveVisitors}
        devices={deviceBreakdown}
        countries={countryBreakdown}
        pages={normalizedTopPages}
        referrers={normalizedReferrers}
        activeRange={analyticsRange}
        rangeLabel={analyticsRangeConfig.label}
      />

      <OpenPanelAffiliateOverview
        openPanelConfigured={openPanelConfigured}
        openPanelMissingConfig={openPanelMissingConfig}
        telemetry={mergedAffiliateTelemetry}
        affiliateNames={affiliateNames}
        rangeLabel={analyticsRangeConfig.label}
      />

      <AdminPanel className="p-0">
        <div className="border-b border-border/70 px-2.5 py-2">
          <h3 className="text-sm font-semibold tracking-[-0.03em] text-foreground">
            Fast paths
          </h3>
        </div>
        <div className="grid gap-px bg-border/70 sm:grid-cols-3">
          {commandLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-[60px] flex-col justify-between gap-3 bg-background px-2.5 py-2.5 transition-colors hover:bg-accent"
            >
              <p className="text-[11px] font-semibold text-foreground">
                {item.label}
              </p>
              <ArrowUpRight className="size-4 shrink-0 text-foreground" />
            </Link>
          ))}
        </div>
      </AdminPanel>
    </div>
  );
}
