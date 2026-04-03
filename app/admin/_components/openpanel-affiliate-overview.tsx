"use client";

import type {
  AdminAffiliateTelemetry,
  OpenPanelNamedValue,
} from "@/lib/analytics/openpanel";

import {
  AdminPanel,
  AdminSectionHeader,
  AdminStatCard,
} from "./admin-shell";

function formatCompact(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "$0.00";
  return `$${value.toFixed(2)}`;
}

function CompactBreakdownCard({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: OpenPanelNamedValue[];
  emptyMessage: string;
}) {
  const chartItems = items.slice(0, 4);
  const max = Math.max(1, ...chartItems.map((item) => item.value));

  return (
    <AdminPanel className="p-0">
      <div className="border-b border-border/70 px-2.5 py-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold tracking-[-0.03em] text-foreground">
            {title}
          </h3>
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Last 30d
          </p>
        </div>
      </div>

      {chartItems.length > 0 ? (
        <div className="space-y-2 px-2.5 py-2.5">
          {chartItems.map((item) => {
            const width = `${Math.max(12, (item.value / max) * 100)}%`;

            return (
              <div key={item.name} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-muted-foreground">{item.name}</span>
                  <span className="shrink-0 font-semibold text-foreground">
                    {formatCompact(item.value)}
                  </span>
                </div>
                <div className="h-1 rounded-none bg-muted">
                  <div className="h-full rounded-none bg-primary" style={{ width }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-2.5 py-2.5">
          <div className="rounded-none border border-dashed border-border bg-background px-2.5 py-2.5 text-[11px] text-muted-foreground">
            {emptyMessage}
          </div>
        </div>
      )}
    </AdminPanel>
  );
}

function TopAffiliatesCard({
  affiliateNames,
  telemetry,
}: {
  affiliateNames: Record<string, string>;
  telemetry: AdminAffiliateTelemetry;
}) {
  const leaderboard = telemetry.leaderboard.slice(0, 4).map((entry) => ({
    ...entry,
    affiliateName: affiliateNames[entry.affiliateCode] ?? null,
  }));
  const leaderboardMax = Math.max(
    1,
    ...leaderboard.map((entry) =>
      entry.revenue > 0
        ? entry.revenue
        : Math.max(entry.visits, entry.purchases),
    ),
  );

  return (
    <AdminPanel className="p-0">
      <div className="border-b border-border/70 px-2.5 py-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold tracking-[-0.03em] text-foreground">
            Top affiliates
          </h3>
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Last 30d
          </p>
        </div>
      </div>

      {leaderboard.length > 0 ? (
        <div className="space-y-2 px-2.5 py-2.5">
          {leaderboard.map((entry) => {
            const weight =
              entry.revenue > 0
                ? entry.revenue
                : Math.max(entry.visits, entry.purchases);
            const width = `${Math.max(12, (weight / leaderboardMax) * 100)}%`;

            return (
              <div key={entry.affiliateCode} className="space-y-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {entry.affiliateName || entry.affiliateCode}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatCompact(entry.visits)} visits /{" "}
                      {formatCompact(entry.purchases)} purchases
                    </p>
                  </div>
                  <p className="shrink-0 text-xs font-semibold text-foreground">
                    {formatCurrency(entry.revenue)}
                  </p>
                </div>
                <div className="h-1 rounded-none bg-muted">
                  <div className="h-full rounded-none bg-[#D3A34F]" style={{ width }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-2.5 py-2.5">
          <div className="rounded-none border border-dashed border-border bg-background px-2.5 py-2.5 text-[11px] text-muted-foreground">
            No affiliate data.
          </div>
        </div>
      )}
    </AdminPanel>
  );
}

export function OpenPanelAffiliateOverview({
  openPanelConfigured,
  openPanelMissingConfig,
  telemetry,
  affiliateNames,
}: {
  openPanelConfigured: boolean;
  openPanelMissingConfig: string[];
  telemetry: AdminAffiliateTelemetry | null;
  affiliateNames: Record<string, string>;
}) {
  const leaderboard = telemetry?.leaderboard ?? [];
  const totalVisits = leaderboard.reduce((sum, entry) => sum + entry.visits, 0);
  const totalPurchases = leaderboard.reduce(
    (sum, entry) => sum + entry.purchases,
    0,
  );
  const totalRevenue = leaderboard.reduce(
    (sum, entry) => sum + entry.revenue,
    0,
  );
  const activeAffiliates = leaderboard.length;

  return (
    <section className="space-y-3">
      <AdminSectionHeader
        eyebrow="OpenPanel"
        title="Affiliate overview"
      />

      {!openPanelConfigured ? (
        <AdminPanel className="border-dashed text-xs leading-5 text-muted-foreground">
          OpenPanel not configured. Missing{" "}
          <code className="rounded-none bg-muted px-1.5 py-1 font-mono text-xs text-foreground">
            {openPanelMissingConfig.join(", ")}
          </code>
          .
        </AdminPanel>
      ) : null}

      {openPanelConfigured && !telemetry ? (
        <AdminPanel className="border-dashed text-xs leading-5 text-muted-foreground">
          No affiliate telemetry for this range.
        </AdminPanel>
      ) : null}

      {openPanelConfigured && telemetry ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AdminStatCard
              label="Visits (30d)"
              value={formatCompact(totalVisits)}
              size="compact"
            />
            <AdminStatCard
              label="Purchases (30d)"
              value={formatCompact(totalPurchases)}
              tone="inverse"
              size="compact"
            />
            <AdminStatCard
              label="Revenue (30d)"
              value={formatCurrency(totalRevenue)}
              size="compact"
            />
            <AdminStatCard
              label="Active affiliates"
              value={formatCompact(activeAffiliates)}
              size="compact"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
            <TopAffiliatesCard
              affiliateNames={affiliateNames}
              telemetry={telemetry}
            />
            <CompactBreakdownCard
              title="Device mix"
              items={telemetry.devices}
              emptyMessage="No device data."
            />
            <CompactBreakdownCard
              title="Referrer mix"
              items={telemetry.referrers}
              emptyMessage="No referrer data."
            />
            <CompactBreakdownCard
              title="Country mix"
              items={telemetry.countries}
              emptyMessage="No country data."
            />
          </div>
        </>
      ) : null}
    </section>
  );
}
