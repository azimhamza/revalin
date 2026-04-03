import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getAffiliateOpenPanelTelemetry,
  hasOpenPanelCredentials,
  type OpenPanelEventRecord,
} from "@/lib/analytics/openpanel";
import { getServerSession } from "@/lib/auth-server";
import { getAffiliateByUserIdentity } from "@/lib/checkout/affiliate-service";
import {
  getAffiliateVisitSummary,
  getRecentAffiliateVisits,
} from "@/lib/checkout/affiliate-visit-service";
import { db } from "@/lib/db";
import { affiliatePayouts, checkoutOrders } from "@/lib/db/schema";

import { AffiliateAnalyticsVisuals } from "../_components/affiliate-analytics-visuals";
import {
  AffiliatePanel,
  AffiliateSectionHeader,
  AffiliateStatCard,
  affiliateChipClass,
} from "../_components/affiliate-shell";
import { AffiliateRecoveryState } from "../_components/affiliate-recovery-state";

export const metadata = {
  title: "Growth Partner Analytics | Revalin",
};

const analyticsCardClass =
  "rounded-none border border-[#0B2E2F]/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(244,241,234,0.92)_100%)] shadow-[0_10px_28px_rgba(11,46,47,0.06)]";

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

function getEventName(event: OpenPanelEventRecord): string {
  const candidates = [event?.name, event?.event, event?.event_name];
  const name = candidates.find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );

  return name ?? "event";
}

function getEventTimestamp(event: OpenPanelEventRecord) {
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

function getDeviceLabel(userAgent: string | null | undefined) {
  if (!userAgent) return "Unknown device";
  return /mobile|android|iphone|ipad/i.test(userAgent)
    ? "Mobile"
    : "Desktop";
}

function getEventProperties(event: OpenPanelEventRecord) {
  return event?.properties && typeof event.properties === "object"
    ? (event.properties as Record<string, unknown>)
    : {};
}

function getEventPath(event: OpenPanelEventRecord) {
  const properties = getEventProperties(event);
  const raw =
    typeof properties.referral_path === "string"
      ? properties.referral_path
      : typeof properties.path === "string"
        ? properties.path
        : typeof properties.pathname === "string"
          ? properties.pathname
          : typeof properties.url === "string"
            ? properties.url
            : null;

  if (!raw) return "/unknown";

  try {
    const parsed = new URL(raw);
    return `${parsed.pathname}${parsed.search}` || "/unknown";
  } catch {
    return raw.startsWith("/") ? raw : `/${raw}`;
  }
}

export default async function AffiliateAnalyticsPage() {
  const session = await getServerSession();
  if (!session?.user) redirect("/login");

  const affiliate = await getAffiliateByUserIdentity({
    userId: session.user.id,
    email: session.user.email,
  });

  if (!affiliate) {
    return <AffiliateRecoveryState email={session.user.email} />;
  }

  const openPanelConfigured = hasOpenPanelCredentials();

  const [telemetry, visitSummary, recentVisits, referredOrderRows] =
    await Promise.all([
      openPanelConfigured
        ? getAffiliateOpenPanelTelemetry(affiliate.code, "30d").catch(() => null)
        : Promise.resolve(null),
      getAffiliateVisitSummary(affiliate.id),
      getRecentAffiliateVisits(affiliate.id, 12),
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
        .limit(60),
    ]);

  const last30Start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sales30dRows = referredOrderRows.filter(({ order }) => {
    const createdAt =
      order.createdAt instanceof Date
        ? order.createdAt
        : new Date(order.createdAt);

    return createdAt >= last30Start;
  });
  const revenue30d = sales30dRows.reduce(
    (sum, { payout }) => sum + Number(payout.orderTotal),
    0,
  );
  const averageOrderValue =
    referredOrderRows.length > 0
      ? referredOrderRows.reduce(
          (sum, { payout }) => sum + Number(payout.orderTotal),
          0,
        ) / referredOrderRows.length
      : 0;
  const conversionRate30d =
    visitSummary.uniqueVisitors30d > 0
      ? sales30dRows.length / visitSummary.uniqueVisitors30d
      : null;
  const telemetryTrend = telemetry?.trend ?? [];
  const trackedVisits = telemetryTrend.reduce((sum, point) => sum + point.visits, 0);
  const trackedPurchases = telemetryTrend.reduce(
    (sum, point) => sum + point.purchases,
    0,
  );
  const trackedRevenue = telemetryTrend.reduce((sum, point) => sum + point.revenue, 0);
  const telemetryEvents = telemetry?.events ?? [];

  return (
    <div className="space-y-3">
      <section className="space-y-3">
        <AffiliateSectionHeader
          eyebrow="Analytics"
          title="Traffic and conversion"
          description="A dedicated view for referral traffic, conversion, and attribution flowing through your Growth Partner code."
        />

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <AffiliateStatCard
            label="People 30d"
            value={formatNumber(visitSummary.uniqueVisitors30d)}
            detail={`${formatNumber(visitSummary.totalUniqueVisitors)} lifetime unique visitors.`}
            tone="inverse"
            size="compact"
          />
          <AffiliateStatCard
            label="Link clicks 30d"
            value={formatNumber(visitSummary.visits30d)}
            detail={`${formatNumber(visitSummary.totalVisits)} lifetime clicks recorded in first-party tracking.`}
            size="compact"
          />
          <AffiliateStatCard
            label="Sales 30d"
            value={formatNumber(sales30dRows.length)}
            detail={`${formatNumber(referredOrderRows.length)} lifetime paid sale${referredOrderRows.length === 1 ? "" : "s"}.`}
            size="compact"
          />
          <AffiliateStatCard
            label="Conversion 30d"
            value={formatPercent(conversionRate30d)}
            detail={
              visitSummary.uniqueVisitors30d > 0
                ? `${formatNumber(sales30dRows.length)} paid sale${sales30dRows.length === 1 ? "" : "s"} from ${formatNumber(visitSummary.uniqueVisitors30d)} unique people.`
                : "No first-party visitor history for the last 30 days yet."
            }
            size="compact"
          />
          <AffiliateStatCard
            label="Revenue 30d"
            value={`$${revenue30d.toFixed(2)}`}
            detail={`Average order value $${averageOrderValue.toFixed(2)}.`}
            size="compact"
          />
        </div>
      </section>

      <section className="space-y-3">
        <AffiliateSectionHeader
          eyebrow="Attribution"
          title="Additional analytics"
          description="Supplemental attribution and campaign breakdowns linked to your referral traffic."
        />

        {!openPanelConfigured ? (
          <AffiliatePanel tone="muted">
            <p className="text-[11px] leading-4 text-[#0B2E2F]/58">
              Additional attribution data is not available yet.
            </p>
          </AffiliatePanel>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <AffiliateStatCard
            label="Tracked visits 30d"
            value={openPanelConfigured ? formatNumber(trackedVisits) : "-"}
            detail="Additional tracked visits linked to your code."
            size="compact"
          />
          <AffiliateStatCard
            label="Tracked purchases 30d"
            value={openPanelConfigured ? formatNumber(trackedPurchases) : "-"}
            detail="Tracked purchases linked to this code."
            size="compact"
          />
          <AffiliateStatCard
            label="Tracked revenue 30d"
            value={openPanelConfigured ? `$${trackedRevenue.toFixed(2)}` : "-"}
            detail="Revenue tied to attributed purchases."
            size="compact"
          />
          <AffiliateStatCard
            label="Tracked events"
            value={openPanelConfigured ? formatNumber(telemetryEvents.length) : "-"}
            detail="Combined attributed visits and purchases."
            size="compact"
          />
        </div>
      </section>

      <AffiliateAnalyticsVisuals
        trend={telemetry?.trend ?? []}
        referrers={telemetry?.referrers ?? []}
        landingPaths={telemetry?.landingPaths ?? []}
        devices={telemetry?.devices ?? []}
        countries={telemetry?.countries ?? []}
        sources={telemetry?.sources ?? []}
        utmSources={telemetry?.utmSources ?? []}
        utmMediums={telemetry?.utmMediums ?? []}
        utmCampaigns={telemetry?.utmCampaigns ?? []}
      />

      <section className="grid gap-3 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className={analyticsCardClass}>
          <CardHeader className="border-b border-[#0B2E2F]/10 px-3 py-2.5">
            <CardTitle className="text-sm tracking-[-0.03em] text-[#0B2E2F]">
              First-party visit log
            </CardTitle>
            <CardDescription className="text-[11px] leading-4 text-[#0B2E2F]/58">
              Direct click records captured by Revalin when this referral link
              is opened.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {recentVisits.length === 0 ? (
              <div className="px-3 py-3">
                <div className="border border-dashed border-[#0B2E2F]/12 bg-[#FCFAF6] px-3 py-4 text-[11px] text-[#0B2E2F]/58">
                  No first-party referral clicks have been recorded yet.
                </div>
              </div>
            ) : (
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="border-b border-[#0B2E2F]/10 hover:bg-transparent">
                    <TableHead className="h-8 px-3 text-[9px] uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                      Time
                    </TableHead>
                    <TableHead className="h-8 px-3 text-[9px] uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                      Referrer
                    </TableHead>
                    <TableHead className="h-8 px-3 text-[9px] uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                      Route
                    </TableHead>
                    <TableHead className="h-8 px-3 text-[9px] uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                      Device
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentVisits.map((visit) => (
                    <TableRow
                      key={visit.id}
                      className="border-b border-[#0B2E2F]/8 hover:bg-[#0B2E2F]/[0.02]"
                    >
                      <TableCell className="px-3 py-2.5 text-[11px] text-[#0B2E2F]/62">
                        {formatEventTime(visit.createdAt)}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-xs font-medium text-[#0B2E2F]">
                        {getReferrerLabel(visit.referrer)}
                      </TableCell>
                      <TableCell className="px-3 py-2.5">
                        <span className={affiliateChipClass}>
                          {visit.referralPath || `/${affiliate.code}`}
                        </span>
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-[11px] text-[#0B2E2F]/62">
                        {getDeviceLabel(visit.userAgent)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className={analyticsCardClass}>
          <CardHeader className="border-b border-[#0B2E2F]/10 px-3 py-2.5">
            <CardTitle className="text-sm tracking-[-0.03em] text-[#0B2E2F]">
              Attributed activity
            </CardTitle>
            <CardDescription className="text-[11px] leading-4 text-[#0B2E2F]/58">
              Recent attributed visits and purchases linked to your referral traffic.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {telemetryEvents.length === 0 ? (
              <div className="px-3 py-3">
                <div className="border border-dashed border-[#0B2E2F]/12 bg-[#FCFAF6] px-3 py-4 text-[11px] text-[#0B2E2F]/58">
                  No attributed activity has been returned yet.
                </div>
              </div>
            ) : (
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="border-b border-[#0B2E2F]/10 hover:bg-transparent">
                    <TableHead className="h-8 px-3 text-[9px] uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                      Time
                    </TableHead>
                    <TableHead className="h-8 px-3 text-[9px] uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                      Event
                    </TableHead>
                    <TableHead className="h-8 px-3 text-[9px] uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                      Attribution
                    </TableHead>
                    <TableHead className="h-8 px-3 text-[9px] uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                      Value
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {telemetryEvents.slice(0, 12).map((event, index) => {
                    const properties = getEventProperties(event);
                    const discountCode =
                      typeof properties.discount_code === "string"
                        ? properties.discount_code
                        : null;
                    const orderTotal = Number(properties.orderTotal ?? 0);

                    return (
                      <TableRow
                        key={`${getEventName(event)}-${getEventTimestamp(event) || index}`}
                        className="border-b border-[#0B2E2F]/8 hover:bg-[#0B2E2F]/[0.02]"
                      >
                        <TableCell className="px-3 py-2.5 text-[11px] text-[#0B2E2F]/62">
                          {formatEventTime(getEventTimestamp(event))}
                        </TableCell>
                        <TableCell className="px-3 py-2.5">
                          <div className="space-y-1">
                            <p className="text-xs font-semibold capitalize text-[#0B2E2F]">
                              {getEventName(event).replace(/_/g, " ")}
                            </p>
                            <p className="text-[11px] text-[#0B2E2F]/58">
                              {typeof event.country === "string" && event.country
                                ? event.country
                                : "Unknown country"}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1.5">
                            <span className={affiliateChipClass}>
                              {getEventPath(event)}
                            </span>
                            <span className={affiliateChipClass}>
                              {typeof event.referrerName === "string" &&
                              event.referrerName
                                ? event.referrerName
                                : getReferrerLabel(
                                    typeof event.referrer === "string"
                                      ? event.referrer
                                      : null,
                                  )}
                            </span>
                            {discountCode ? (
                              <span className={affiliateChipClass}>
                                Discount {discountCode}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="px-3 py-2.5 text-xs font-semibold text-[#0B2E2F]">
                          {orderTotal > 0 ? `$${orderTotal.toFixed(2)}` : "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
