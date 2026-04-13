import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getPromoterOpenPanelTelemetry,
  hasOpenPanelCredentials,
} from "@/lib/analytics/openpanel";
import { getServerSession } from "@/lib/auth-server";
import {
  getPromoterByUserIdentity,
  getSuccessfulAffiliateCodesForPromoter,
  listPromoterInvites,
} from "@/lib/checkout/promoter-service";

import { PromoterAnalyticsVisuals } from "../_components/promoter-analytics-visuals";
import {
  PromoterPanel,
  PromoterSectionHeader,
  PromoterStatCard,
  promoterChipClass,
} from "../_components/promoter-shell";

export const metadata = {
  title: "Promoter Analytics | Revalin",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

export default async function PromoterAnalyticsPage() {
  const session = await getServerSession();
  if (!session?.user) return null;

  const promoter = await getPromoterByUserIdentity({
    userId: session.user.id,
    email: session.user.email,
  });

  if (!promoter || promoter.status !== "approved") return null;

  const openPanelConfigured = hasOpenPanelCredentials();
  const [partnerCodes, inviteRows] = await Promise.all([
    getSuccessfulAffiliateCodesForPromoter(promoter.id),
    listPromoterInvites({ promoterId: promoter.id }),
  ]);

  const telemetry = openPanelConfigured
    ? await getPromoterOpenPanelTelemetry(partnerCodes, "30d").catch(() => null)
    : null;

  const telemetryTrend = telemetry?.trend ?? [];
  const trackedVisits = telemetryTrend.reduce(
    (sum, point) => sum + point.visits,
    0,
  );
  const trackedPurchases = telemetryTrend.reduce(
    (sum, point) => sum + point.purchases,
    0,
  );
  const trackedRevenue = telemetryTrend.reduce(
    (sum, point) => sum + point.revenue,
    0,
  );
  const partnerBreakdown = telemetry?.partnerBreakdown ?? [];

  const partnerNameMap = new Map<string, string>();
  for (const row of inviteRows) {
    if (row.affiliateCode && (row.affiliateName || row.invite.invitedName)) {
      partnerNameMap.set(
        row.affiliateCode,
        row.affiliateName || row.invite.invitedName || "",
      );
    }
  }

  return (
    <div className="space-y-3">
      <section className="space-y-3">
        <PromoterSectionHeader
          eyebrow="Analytics"
          title="Aggregate partner performance"
          description="Traffic, conversion, and attribution data aggregated across all your recruited Growth Partners."
        />

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <PromoterStatCard
            label="Active partners"
            value={partnerCodes.length}
            detail={`${partnerCodes.length} approved Growth Partner${partnerCodes.length === 1 ? "" : "s"} linked.`}
            tone="inverse"
            size="compact"
          />
          <PromoterStatCard
            label="Tracked visits 30d"
            value={openPanelConfigured ? formatNumber(trackedVisits) : "-"}
            detail="Aggregate visits across all partner codes."
            size="compact"
          />
          <PromoterStatCard
            label="Tracked purchases 30d"
            value={openPanelConfigured ? formatNumber(trackedPurchases) : "-"}
            detail="Purchases linked to recruited partners."
            size="compact"
          />
          <PromoterStatCard
            label="Tracked revenue 30d"
            value={
              openPanelConfigured ? `$${trackedRevenue.toFixed(2)}` : "-"
            }
            detail="Revenue tied to attributed purchases."
            size="compact"
          />
        </div>
      </section>

      {!openPanelConfigured ? (
        <PromoterPanel tone="muted">
          <p className="text-[11px] leading-4 text-[#0B2E2F]/58">
            Additional attribution data is not available yet.
          </p>
        </PromoterPanel>
      ) : null}

      <PromoterAnalyticsVisuals
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

      <PromoterPanel>
        <PromoterSectionHeader
          eyebrow="Per-partner"
          title="Partner performance breakdown"
          description="Individual performance metrics for each recruited Growth Partner based on attributed activity."
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
                  Visits
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Purchases
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Revenue
                </TableHead>
                <TableHead className="h-9 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Conversion
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {partnerBreakdown.map((partner) => (
                <TableRow
                  key={partner.affiliateCode}
                  className="border-[#0B2E2F]/10"
                >
                  <TableCell className="py-2 text-xs font-semibold text-[#0B2E2F]">
                    {partnerNameMap.get(partner.affiliateCode) || "-"}
                  </TableCell>
                  <TableCell className="py-2">
                    <span className={promoterChipClass}>
                      {partner.affiliateCode}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-xs text-[#0B2E2F]/72">
                    {formatNumber(partner.visits)}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-[#0B2E2F]/72">
                    {formatNumber(partner.purchases)}
                  </TableCell>
                  <TableCell className="py-2 text-xs font-semibold text-[#0B2E2F]">
                    ${partner.revenue.toFixed(2)}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-[#0B2E2F]/72">
                    {formatPercent(partner.conversionRate)}
                  </TableCell>
                </TableRow>
              ))}

              {partnerBreakdown.length === 0 ? (
                <TableRow className="border-[#0B2E2F]/10">
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-[11px] text-[#0B2E2F]/58"
                  >
                    {partnerCodes.length === 0
                      ? "No active partners yet. Recruit Growth Partners to see their performance here."
                      : "No attributed activity has been returned for your partners yet."}
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
