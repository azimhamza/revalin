"use client";

import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  OpenPanelNamedValue,
  OpenPanelSiteMetricPoint,
} from "@/lib/analytics/openpanel";

import { AdminPanel, AdminSectionHeader } from "./admin-shell";

function formatCompact(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
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

function BreakdownChart({
  title,
  items,
  emptyMessage,
  rangeLabel,
  metricLabel = "Count",
  barColor = "#0B2E2F",
  labelWidth = 104,
}: {
  title: string;
  items: OpenPanelNamedValue[];
  emptyMessage: string;
  rangeLabel: string;
  metricLabel?: string;
  barColor?: string;
  labelWidth?: number;
}) {
  const chartItems = items.slice(0, 5);

  return (
    <AdminPanel className="p-0">
      <div className="border-b border-border/70 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold tracking-[-0.03em] text-foreground">
            {title}
          </h3>
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {rangeLabel}
          </p>
        </div>
      </div>

      {chartItems.length > 0 ? (
        <div className="h-[168px] px-2.5 py-2.5">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartItems}
              layout="vertical"
              margin={{ top: 2, right: 20, bottom: 2, left: 2 }}
              barCategoryGap="22%"
            >
              <XAxis type="number" hide />
              <YAxis
                dataKey="name"
                type="category"
                width={labelWidth}
                interval={0}
                tickFormatter={(value) => truncateLabel(String(value), 22)}
                tick={{ fill: "#6B6A63", fontSize: 11 }}
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
                  fontSize={11}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="px-3 py-3">
          <div className="rounded-none border border-dashed border-border bg-background px-2.5 py-3 text-[11px] text-muted-foreground">
            {emptyMessage}
          </div>
        </div>
      )}
    </AdminPanel>
  );
}

export function OpenPanelOverviewVisuals({
  trend,
  liveVisitors,
  devices,
  countries,
  pages,
  referrers,
  activeRange,
  rangeLabel,
}: {
  trend: OpenPanelSiteMetricPoint[];
  liveVisitors: number | null;
  devices: OpenPanelNamedValue[];
  countries: OpenPanelNamedValue[];
  pages: OpenPanelNamedValue[];
  referrers: OpenPanelNamedValue[];
  activeRange: "daily" | "monthly";
  rangeLabel: string;
}) {
  const rangeOptions = [
    { key: "daily", label: "Daily", href: "/admin?analyticsRange=daily" },
    { key: "monthly", label: "Monthly", href: "/admin?analyticsRange=monthly" },
  ] as const;

  return (
    <section className="space-y-3">
      <AdminSectionHeader
        eyebrow="OpenPanel"
        title="Traffic trend"
        action={
          <div className="inline-flex overflow-hidden border border-border bg-background shadow-sm">
            {rangeOptions.map((option) => {
              const active = activeRange === option.key;

              return (
                <Link
                  key={option.key}
                  href={option.href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex h-7 items-center px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        }
      />

      <div className="grid gap-3">
        <AdminPanel className="p-0">
          <div className="flex flex-wrap items-start justify-between gap-2.5 border-b border-border/70 px-3 py-2.5">
            <div>
              <h3 className="text-sm font-semibold tracking-[-0.03em] text-foreground">
                Visitors, sessions, and page views
              </h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                OpenPanel metrics from the Insights API for {rangeLabel.toLowerCase()}.
              </p>
            </div>
            <div className="min-w-[80px] rounded-none border border-border bg-muted/60 px-2.5 py-2">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Live now
              </p>
              <p className="mt-1 text-lg font-semibold tracking-[-0.05em] text-foreground">
                {formatCompact(liveVisitors)}
              </p>
            </div>
          </div>

          {trend.length > 0 ? (
            <div className="h-[200px] px-2 py-2.5 md:px-2.5">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={trend}
                  margin={{ top: 6, right: 12, bottom: 0, left: 0 }}
                >
                  <CartesianGrid stroke="#D8CFBF" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDateLabel}
                    tick={{ fill: "#6B6A63", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    tickFormatter={(value) => formatCompact(Number(value))}
                    tick={{ fill: "#6B6A63", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                  />
                  <Tooltip
                    labelFormatter={(value) => formatDateLabel(String(value))}
                    formatter={(value: number, name: string) => [
                      formatCompact(Number(value)),
                      name === "pageViews"
                        ? "Page views"
                        : name === "visitors"
                          ? "Visitors"
                          : "Sessions",
                    ]}
                    contentStyle={{
                      borderRadius: 0,
                      borderColor: "rgba(11,46,47,0.12)",
                      backgroundColor: "#FCFAF6",
                    }}
                  />
                  <Legend
                    formatter={(value) =>
                      value === "pageViews"
                        ? "Page views"
                        : value === "visitors"
                          ? "Visitors"
                          : "Sessions"
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="pageViews"
                    name="pageViews"
                    stroke="#D3A34F"
                    fill="#D3A34F"
                    fillOpacity={0.18}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="visitors"
                    name="visitors"
                    stroke="#0B2E2F"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="sessions"
                    name="sessions"
                    stroke="#58706B"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="px-4 py-4">
              <div className="rounded-none border border-dashed border-border bg-background px-3 py-4 text-xs text-muted-foreground">
                OpenPanel did not return any daily trend data yet.
              </div>
            </div>
          )}
        </AdminPanel>

        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
          <BreakdownChart
            title="Devices"
            items={devices}
            emptyMessage="No device data returned yet."
            rangeLabel={rangeLabel}
            metricLabel="Sessions"
            barColor="#0B2E2F"
            labelWidth={92}
          />
          <BreakdownChart
            title="Countries"
            items={countries}
            emptyMessage="No country data returned yet."
            rangeLabel={rangeLabel}
            metricLabel="Sessions"
            barColor="#58706B"
            labelWidth={92}
          />
          <BreakdownChart
            title="Top pages"
            items={pages}
            emptyMessage="No page analytics available yet."
            rangeLabel={rangeLabel}
            metricLabel="Views"
            barColor="#D3A34F"
            labelWidth={126}
          />
          <BreakdownChart
            title="Referrers"
            items={referrers}
            emptyMessage="No referrer data available yet."
            rangeLabel={rangeLabel}
            metricLabel="Sessions"
            barColor="#826B44"
            labelWidth={126}
          />
        </div>
      </div>
    </section>
  );
}
