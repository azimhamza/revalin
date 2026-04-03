"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  AffiliateTelemetryTrendPoint,
  OpenPanelNamedValue,
} from "@/lib/analytics/openpanel";

const affiliateChartCardClass =
  "rounded-none border border-[#0B2E2F]/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(244,241,234,0.92)_100%)] shadow-[0_10px_28px_rgba(11,46,47,0.06)]";

function formatCompact(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }

  return `${value.toFixed(1)}%`;
}

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function truncateLabel(value: string, maxLength = 18) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-3 pb-3">
      <div className="border border-dashed border-[#0B2E2F]/12 bg-[#FCFAF6] px-3.5 py-[18px] text-[12px] text-[#0B2E2F]/58">
        {message}
      </div>
    </div>
  );
}

function BreakdownChart({
  title,
  description,
  items,
  metricLabel,
  barColor,
  labelWidth = 110,
  emptyMessage,
}: {
  title: string;
  description: string;
  items: OpenPanelNamedValue[];
  metricLabel: string;
  barColor: string;
  labelWidth?: number;
  emptyMessage: string;
}) {
  const chartItems = items.slice(0, 6);

  return (
    <Card className={affiliateChartCardClass}>
      <CardHeader className="border-b border-[#0B2E2F]/10 px-3.5 py-3">
        <CardTitle className="text-[15px] tracking-[-0.03em] text-[#0B2E2F]">
          {title}
        </CardTitle>
        <CardDescription className="text-[12px] leading-5 text-[#0B2E2F]/58">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {chartItems.length > 0 ? (
          <div className="h-[198px] px-2.5 py-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartItems}
                layout="vertical"
                margin={{ top: 2, right: 24, bottom: 2, left: 0 }}
                barCategoryGap="24%"
              >
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={labelWidth}
                  interval={0}
                  tickFormatter={(value) => truncateLabel(String(value), 22)}
                  tick={{ fill: "#6B6A63", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  labelFormatter={(value) => String(value)}
                  formatter={(value: number) => [
                    formatCompact(Number(value)),
                    metricLabel,
                  ]}
                  contentStyle={{
                    borderRadius: 0,
                    borderColor: "rgba(11,46,47,0.12)",
                    backgroundColor: "#FCFAF6",
                  }}
                />
                <Bar
                  dataKey="value"
                  fill={barColor}
                  radius={[0, 0, 0, 0]}
                  maxBarSize={16}
                >
                  <LabelList
                    dataKey="value"
                    position="right"
                    offset={8}
                    formatter={(value: number) => formatCompact(Number(value))}
                    fill="#6B6A63"
                    fontSize={12}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState message={emptyMessage} />
        )}
      </CardContent>
    </Card>
  );
}

export function AffiliateAnalyticsVisuals({
  trend,
  referrers,
  landingPaths,
  devices,
  countries,
  sources,
  utmSources,
  utmMediums,
  utmCampaigns,
}: {
  trend: AffiliateTelemetryTrendPoint[];
  referrers: OpenPanelNamedValue[];
  landingPaths: OpenPanelNamedValue[];
  devices: OpenPanelNamedValue[];
  countries: OpenPanelNamedValue[];
  sources: OpenPanelNamedValue[];
  utmSources: OpenPanelNamedValue[];
  utmMediums: OpenPanelNamedValue[];
  utmCampaigns: OpenPanelNamedValue[];
}) {
  const conversionTrend = trend
    .map((point) => ({
      date: point.date,
      conversionRate:
        point.conversionRate === null
          ? null
          : Number((point.conversionRate * 100).toFixed(1)),
    }))
    .filter((point) => point.conversionRate !== null);

  return (
    <section className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-[1.45fr_0.9fr]">
        <Card className={affiliateChartCardClass}>
          <CardHeader className="border-b border-[#0B2E2F]/10 px-3.5 py-3">
            <CardTitle className="text-[15px] tracking-[-0.03em] text-[#0B2E2F]">
              Traffic, purchases, and revenue
            </CardTitle>
            <CardDescription className="text-[12px] leading-5 text-[#0B2E2F]/58">
              Daily activity linked to your Growth Partner code over the last 30 days.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {trend.length > 0 ? (
              <div className="h-[292px] px-2.5 py-3">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={trend}
                    margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid stroke="#D8CFBF" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDateLabel}
                      tick={{ fill: "#6B6A63", fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      yAxisId="count"
                      tickFormatter={(value) => formatCompact(Number(value))}
                      tick={{ fill: "#6B6A63", fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <YAxis
                      yAxisId="revenue"
                      orientation="right"
                      tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
                      tick={{ fill: "#6B6A63", fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      width={52}
                    />
                    <Tooltip
                      labelFormatter={(value) => formatDateLabel(String(value))}
                      formatter={(value: number, name: string) => {
                        if (name === "revenue") {
                          return [formatCurrency(Number(value)), "Revenue"];
                        }

                        return [
                          formatCompact(Number(value)),
                          name === "purchases" ? "Purchases" : "Visits",
                        ];
                      }}
                      contentStyle={{
                        borderRadius: 0,
                        borderColor: "rgba(11,46,47,0.12)",
                        backgroundColor: "#FCFAF6",
                      }}
                    />
                    <Bar
                      yAxisId="count"
                      dataKey="visits"
                      name="visits"
                      fill="#0B2E2F"
                      barSize={16}
                    />
                    <Line
                      yAxisId="count"
                      type="monotone"
                      dataKey="purchases"
                      name="purchases"
                      stroke="#58706B"
                      strokeWidth={2.5}
                      dot={false}
                    />
                    <Area
                      yAxisId="revenue"
                      type="monotone"
                      dataKey="revenue"
                      name="revenue"
                      stroke="#D3A34F"
                      fill="#D3A34F"
                      fillOpacity={0.14}
                      strokeWidth={2}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState message="Daily trend data is not available yet." />
            )}
          </CardContent>
        </Card>

        <Card className={affiliateChartCardClass}>
          <CardHeader className="border-b border-[#0B2E2F]/10 px-3.5 py-3">
            <CardTitle className="text-[15px] tracking-[-0.03em] text-[#0B2E2F]">
              Conversion trend
            </CardTitle>
            <CardDescription className="text-[12px] leading-5 text-[#0B2E2F]/58">
              Daily purchase rate from attributed visits.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {conversionTrend.length > 0 ? (
              <div className="h-[292px] px-2.5 py-3">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={conversionTrend}
                    margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid stroke="#D8CFBF" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDateLabel}
                      tick={{ fill: "#6B6A63", fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      tickFormatter={(value) => formatPercent(Number(value))}
                      tick={{ fill: "#6B6A63", fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      width={46}
                    />
                    <Tooltip
                      labelFormatter={(value) => formatDateLabel(String(value))}
                      formatter={(value: number) => [
                        formatPercent(Number(value)),
                        "Conversion rate",
                      ]}
                      contentStyle={{
                        borderRadius: 0,
                        borderColor: "rgba(11,46,47,0.12)",
                        backgroundColor: "#FCFAF6",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="conversionRate"
                      stroke="#0B2E2F"
                      fill="#0B2E2F"
                      fillOpacity={0.12}
                      strokeWidth={2.5}
                    />
                    <Line
                      type="monotone"
                      dataKey="conversionRate"
                      stroke="#D3A34F"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState message="There is not enough visit data yet to chart daily conversion." />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-3 2xl:grid-cols-4">
        <BreakdownChart
          title="Referrers"
          description="Hosts sending traffic into this referral link."
          items={referrers}
          metricLabel="Visits"
          barColor="#0B2E2F"
          labelWidth={112}
          emptyMessage="No referrer data has been captured yet."
        />
        <BreakdownChart
          title="Landing paths"
          description="Destination paths hit through this Growth Partner link."
          items={landingPaths}
          metricLabel="Visits"
          barColor="#58706B"
          labelWidth={120}
          emptyMessage="No landing path data has been captured yet."
        />
        <BreakdownChart
          title="Devices"
          description="Device mix across attributed visits and purchases."
          items={devices}
          metricLabel="Events"
          barColor="#826B44"
          labelWidth={104}
          emptyMessage="No device data has been returned yet."
        />
        <BreakdownChart
          title="Countries"
          description="Countries attached to attributed activity."
          items={countries}
          metricLabel="Events"
          barColor="#18494B"
          labelWidth={96}
          emptyMessage="No country data has been returned yet."
        />
        <BreakdownChart
          title="Sources"
          description="Source or channel labels attached to attributed activity."
          items={sources}
          metricLabel="Events"
          barColor="#A1793C"
          labelWidth={114}
          emptyMessage="No source data has been returned yet."
        />
        <BreakdownChart
          title="UTM source"
          description="Campaign source values captured on affiliate traffic."
          items={utmSources}
          metricLabel="Visits"
          barColor="#315B5D"
          labelWidth={114}
          emptyMessage="No UTM source values have been captured yet."
        />
        <BreakdownChart
          title="UTM medium"
          description="Campaign medium values captured on affiliate traffic."
          items={utmMediums}
          metricLabel="Visits"
          barColor="#96713A"
          labelWidth={114}
          emptyMessage="No UTM medium values have been captured yet."
        />
        <BreakdownChart
          title="UTM campaign"
          description="Campaign names carried by tracked affiliate traffic."
          items={utmCampaigns}
          metricLabel="Visits"
          barColor="#0F3638"
          labelWidth={122}
          emptyMessage="No UTM campaign values have been captured yet."
        />
      </div>
    </section>
  );
}
