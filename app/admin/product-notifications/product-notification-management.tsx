"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, Loader2, RefreshCw, Search, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import type {
  ProductNotificationAdminData,
  ProductNotificationAdminProduct,
  ProductNotificationAdminSubscriber,
  ProductNotificationAdminTarget,
} from "@/lib/back-in-stock/types";
import { getApiData, getApiErrorMessage, readJsonSafely } from "@/lib/api/client";
import { buildProductNotificationSelectionKey } from "@/lib/back-in-stock/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  adminFieldClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  AdminPanel,
  AdminSectionHeader,
  AdminStatCard,
} from "../_components/admin-shell";

function formatCompact(value: number) {
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

function formatDateTime(value: string | null) {
  if (!value) return "Never";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function truncateLabel(value: string, maxLength = 28) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function statusBadgeTone(target: ProductNotificationAdminTarget) {
  if (target.isReadyToSend) return "default";
  if (target.isBackorder) return "destructive";
  if (target.isLowStock) return "secondary";
  return "outline";
}

function subscriberStatusBadgeTone(
  status: ProductNotificationAdminSubscriber["status"],
) {
  return status === "pending" ? "outline" : "secondary";
}

function formatSubscriberActivity(subscriber: ProductNotificationAdminSubscriber) {
  if (subscriber.status === "notified") {
    return `Notified ${formatDateTime(subscriber.notifiedAt)}`;
  }

  if (subscriber.lastAttemptedAt) {
    return `Last tried ${formatDateTime(subscriber.lastAttemptedAt)}`;
  }

  return `Joined ${formatDateTime(subscriber.createdAt)}`;
}

function BreakdownChart({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: Array<{ name: string; value: number }>;
  emptyMessage: string;
}) {
  return (
    <AdminPanel className="p-0">
      <div className="border-b border-border/70 px-3 py-2.5">
        <h3 className="text-sm font-semibold tracking-[-0.03em] text-foreground">
          {title}
        </h3>
      </div>

      {items.length > 0 ? (
        <div className="h-[220px] px-2.5 py-2.5">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={items}
              layout="vertical"
              margin={{ top: 2, right: 20, bottom: 2, left: 2 }}
              barCategoryGap="22%"
            >
              <XAxis type="number" hide />
              <YAxis
                dataKey="name"
                type="category"
                width={132}
                tickFormatter={(value) => truncateLabel(String(value), 24)}
                tick={{ fill: "#6B6A63", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval={0}
              />
              <Tooltip
                labelFormatter={(value) => String(value)}
                formatter={(value: number) => [formatCompact(Number(value)), "Signups"]}
                contentStyle={{
                  borderRadius: 0,
                  borderColor: "rgba(11,46,47,0.12)",
                  backgroundColor: "#FCFAF6",
                }}
              />
              <Bar
                dataKey="value"
                fill="#0B2E2F"
                radius={[0, 0, 0, 0]}
                maxBarSize={16}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="px-3 py-3 text-[11px] text-muted-foreground">
          {emptyMessage}
        </div>
      )}
    </AdminPanel>
  );
}

function TrendChart({ items }: { items: Array<{ date: string; signupCount: number }> }) {
  return (
    <AdminPanel className="p-0">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2.5">
        <div>
          <h3 className="text-sm font-semibold tracking-[-0.03em] text-foreground">
            Notification signup trend
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Daily subscription volume across the last 30 days.
          </p>
        </div>
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Last 30d
        </p>
      </div>

      {items.length > 0 ? (
        <div className="h-[220px] px-2.5 py-2.5">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={items}
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
                formatter={(value: number) => [
                  formatCompact(Number(value)),
                  "Signups",
                ]}
                contentStyle={{
                  borderRadius: 0,
                  borderColor: "rgba(11,46,47,0.12)",
                  backgroundColor: "#FCFAF6",
                }}
              />
              <Area
                type="monotone"
                dataKey="signupCount"
                stroke="#0B2E2F"
                fill="#D3A34F"
                fillOpacity={0.18}
                strokeWidth={2.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="px-3 py-3 text-[11px] text-muted-foreground">
          No signup data available yet.
        </div>
      )}
    </AdminPanel>
  );
}

export function ProductNotificationManagement({
  data: initialData,
  initialQuery,
}: {
  data: ProductNotificationAdminData;
  initialQuery: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [data, setData] = useState(initialData);
  const [expandedHandles, setExpandedHandles] = useState<Set<string>>(
    () =>
      new Set(
        initialData.products
          .filter((product) => product.pendingSignupCount > 0)
          .slice(0, 6)
          .map((product) => product.productHandle),
      ),
  );
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSendKey, setActiveSendKey] = useState<string | null>(null);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const selectedTargets = useMemo(() => {
    const targets: ProductNotificationAdminTarget[] = [];

    for (const product of data.products) {
      for (const target of product.targets) {
        const selectionKey = buildProductNotificationSelectionKey({
          productHandle: target.productHandle,
          variantKey: target.variantKey,
        });

        if (selectedKeys.has(selectionKey)) {
          targets.push(target);
        }
      }
    }

    return targets;
  }, [data.products, selectedKeys]);

  function toggleExpanded(productHandle: string) {
    setExpandedHandles((current) => {
      const next = new Set(current);
      if (next.has(productHandle)) {
        next.delete(productHandle);
      } else {
        next.add(productHandle);
      }
      return next;
    });
  }

  function toggleSelected(target: ProductNotificationAdminTarget, checked: boolean) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      const selectionKey = buildProductNotificationSelectionKey({
        productHandle: target.productHandle,
        variantKey: target.variantKey,
      });

      if (checked) {
        next.add(selectionKey);
      } else {
        next.delete(selectionKey);
      }

      return next;
    });
  }

  function buildSelections(targets: ProductNotificationAdminTarget[]) {
    return targets.map((target) => ({
      productHandle: target.productHandle,
      variantId: target.variantId,
    }));
  }

  async function sendSelections(
    targets: ProductNotificationAdminTarget[],
    mode: "single" | "bulk",
  ) {
    if (targets.length === 0) return;

    if (mode === "bulk") {
      setBulkLoading(true);
    } else {
      const target = targets[0]!;
      setActiveSendKey(
        buildProductNotificationSelectionKey({
          productHandle: target.productHandle,
          variantKey: target.variantKey,
        }),
      );
    }

    try {
      const response = await fetch("/api/admin/product-notification-dispatches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selections: buildSelections(targets),
        }),
      });
      const payload = await readJsonSafely(response);
      const responseData =
        getApiData<{
          result?: {
            notifiedCount: number;
            failedCount: number;
            discountCode: string;
          };
        }>(payload) ??
        (payload as {
          result?: {
            notifiedCount: number;
            failedCount: number;
            discountCode: string;
          };
        });

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to send restock notifications."));
      }

      if (mode === "bulk") {
        setSelectedKeys(new Set());
      }

      const result = responseData.result;
      if (!result) {
        throw new Error("The notification dispatch response was missing a result.");
      }
      window.alert(
        `Batch sent. ${result.notifiedCount} customer email(s) delivered, ${result.failedCount} failed, code ${result.discountCode} expires in 48 hours.`,
      );
      router.refresh();
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Failed to send restock notifications.",
      );
    } finally {
      setBulkLoading(false);
      setActiveSendKey(null);
    }
  }

  async function refreshLatestProducts() {
    setRefreshing(true);

    try {
      const normalizedQuery = query.trim();
      const refreshUrl = normalizedQuery
        ? `/api/admin/product-notification-dispatches?q=${encodeURIComponent(normalizedQuery)}`
        : "/api/admin/product-notification-dispatches";
      const response = await fetch(refreshUrl, { cache: "no-store" });
      const payload = await readJsonSafely(response);
      const refreshedData =
        getApiData<ProductNotificationAdminData>(payload) ??
        (payload as ProductNotificationAdminData | null);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to refresh latest Swell products."));
      }

      if (!refreshedData?.products) {
        throw new Error("The refresh response was missing product notification data.");
      }

      setData(refreshedData);
      setSelectedKeys((current) => {
        const validKeys = new Set(
          refreshedData.products.flatMap((product) =>
            product.targets.map((target) =>
              buildProductNotificationSelectionKey({
                productHandle: target.productHandle,
                variantKey: target.variantKey,
              }),
            ),
          ),
        );
        return new Set(Array.from(current).filter((key) => validKeys.has(key)));
      });
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Failed to refresh latest Swell products.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuery = query.trim();
    router.push(
      normalizedQuery
        ? `/admin/product-notifications?q=${encodeURIComponent(normalizedQuery)}`
        : "/admin/product-notifications",
    );
  }

  return (
    <div className="space-y-4">
      <AdminSectionHeader
        eyebrow="Restock Ops"
        title="Product notifications"
        description="Track demand by product and dosage, review live stock against pending subscribers, then send one shared 48-hour discount code across the selected restock batch."
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <AdminStatCard
          label="Pending signups"
          value={formatCompact(data.stats.pendingSignups)}
          size="compact"
        />
        <AdminStatCard
          label="Notified"
          value={formatCompact(data.stats.notifiedSignups)}
          size="compact"
        />
        <AdminStatCard
          label="Unique emails"
          value={formatCompact(data.stats.uniqueEmails)}
          size="compact"
        />
        <AdminStatCard
          label="Products in demand"
          value={formatCompact(data.stats.productsWithPendingDemand)}
          size="compact"
        />
        <AdminStatCard
          label="Variants in demand"
          value={formatCompact(data.stats.variantsWithPendingDemand)}
          size="compact"
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr_1fr]">
        <TrendChart items={data.analytics.signupTrend} />
        <BreakdownChart
          title="Most requested products"
          items={data.analytics.topProducts}
          emptyMessage="No product request data available yet."
        />
        <BreakdownChart
          title="Most requested dosages"
          items={data.analytics.topVariants}
          emptyMessage="No dosage-level request data available yet."
        />
      </div>

      <AdminPanel className="space-y-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <form
            onSubmit={handleSearchSubmit}
            className="grid gap-2 xl:w-full xl:grid-cols-[minmax(0,340px)_auto]"
          >
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search product or dosage"
              className={adminFieldClass}
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className={adminSecondaryButtonClass}
            >
              <Search className="size-3.5" />
              Search
            </Button>
          </form>

          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">
              {selectedTargets.length} target
              {selectedTargets.length === 1 ? "" : "s"} selected
            </p>
            <Button
              type="button"
              size="sm"
              disabled={bulkLoading || selectedTargets.length === 0}
              onClick={() => sendSelections(selectedTargets, "bulk")}
              className={adminPrimaryButtonClass}
            >
              {bulkLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              Send Selected
            </Button>
          </div>
        </div>
      </AdminPanel>

      <AdminPanel className="overflow-hidden p-0">
        <div className="flex flex-col gap-2 border-b border-border/70 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold tracking-[-0.03em] text-foreground">
              Latest updated Swell products
            </h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Expand a product to review dosage-level demand and send readiness.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={refreshing}
            onClick={refreshLatestProducts}
            className={adminSecondaryButtonClass}
          >
            {refreshing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Refresh
          </Button>
        </div>

        <Table>
          <TableHeader className="bg-muted/60">
            <TableRow className="border-b-border hover:bg-transparent">
              <TableHead className="h-9 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Product
              </TableHead>
              <TableHead className="h-9 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Pending
              </TableHead>
              <TableHead className="h-9 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Ready Targets
              </TableHead>
              <TableHead className="h-9 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Last Dispatch
              </TableHead>
              <TableHead className="w-28 px-3" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.products.map((product: ProductNotificationAdminProduct) => {
              const expanded = expandedHandles.has(product.productHandle);

              return (
                <Fragment key={product.productHandle}>
                  <TableRow
                    className="border-b-border bg-background transition-colors hover:bg-muted/40"
                  >
                    <TableCell className="px-3 py-2.5 align-top">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(product.productHandle)}
                        className="flex items-start gap-2 text-left"
                      >
                        <ChevronDown
                          className={`mt-0.5 size-4 transition-transform ${
                            expanded ? "rotate-180" : ""
                          }`}
                        />
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-foreground">
                            {product.productTitle}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {product.productHandle}
                          </p>
                        </div>
                      </button>
                    </TableCell>
                    <TableCell className="px-3 py-2.5 align-top text-sm font-semibold text-foreground">
                      {formatCompact(product.pendingSignupCount)}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 align-top text-xs text-muted-foreground">
                      {product.readyTargetCount} / {product.totalTargetCount}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 align-top text-xs text-muted-foreground">
                      {formatDateTime(product.lastDispatchAt)}
                    </TableCell>
                    <TableCell className="px-3 py-2.5 align-top">
                      <Badge variant={product.pendingSignupCount > 0 ? "default" : "outline"}>
                        {product.pendingSignupCount > 0 ? "Demand" : "Quiet"}
                      </Badge>
                    </TableCell>
                  </TableRow>

                  {expanded ? (
                    <TableRow className="bg-muted/20">
                      <TableCell colSpan={5} className="px-0 py-0">
                        <div className="grid gap-px bg-border/60">
                          <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(110px,0.8fr)_88px_140px_120px_56px] gap-px bg-border/60">
                            <div className="bg-background px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              Dosage
                            </div>
                            <div className="bg-background px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              Stock
                            </div>
                            <div className="bg-background px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              Pending
                            </div>
                            <div className="bg-background px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              Last Dispatch
                            </div>
                            <div className="bg-background px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              Action
                            </div>
                            <div className="bg-background px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              Pick
                            </div>
                          </div>

                          {product.targets.map((target) => {
                            const selectionKey = buildProductNotificationSelectionKey({
                              productHandle: target.productHandle,
                              variantKey: target.variantKey,
                            });
                            const sending = activeSendKey === selectionKey;

                            return (
                              <Fragment key={selectionKey}>
                                <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(110px,0.8fr)_88px_140px_120px_56px] gap-px bg-border/60">
                                  <div className="bg-background px-3 py-2.5">
                                    <p className="text-sm font-medium text-foreground">
                                      {target.displayName}
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                      {target.stockMessage}
                                    </p>
                                  </div>
                                  <div className="flex items-center bg-background px-3 py-2.5">
                                    <Badge variant={statusBadgeTone(target)}>
                                      {target.stockLabel}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center bg-background px-3 py-2.5 text-sm font-semibold text-foreground">
                                    {target.pendingSignupCount}
                                  </div>
                                  <div className="flex items-center bg-background px-3 py-2.5 text-xs text-muted-foreground">
                                    {formatDateTime(target.lastDispatchAt)}
                                  </div>
                                  <div className="flex items-center bg-background px-3 py-2.5">
                                    <Button
                                      type="button"
                                      size="sm"
                                      disabled={!target.isReadyToSend || sending}
                                      onClick={() => sendSelections([target], "single")}
                                      className={adminPrimaryButtonClass}
                                    >
                                      {sending ? (
                                        <Loader2 className="size-3.5 animate-spin" />
                                      ) : (
                                        <Send className="size-3.5" />
                                      )}
                                      Send
                                    </Button>
                                  </div>
                                  <div className="flex items-center justify-center bg-background px-3 py-2.5">
                                    <input
                                      type="checkbox"
                                      checked={selectedKeys.has(selectionKey)}
                                      disabled={!target.isReadyToSend}
                                      onChange={(event) =>
                                        toggleSelected(target, event.target.checked)
                                      }
                                      className="size-4 accent-[#0B2E2F]"
                                    />
                                  </div>
                                </div>
                                {target.subscribers.length > 0 ? (
                                  <div className="bg-background px-3 py-3">
                                    <div className="mb-2 flex items-center justify-between gap-3">
                                      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                        Subscribers
                                      </p>
                                      <p className="text-[11px] text-muted-foreground">
                                        {target.subscribers.length} total
                                      </p>
                                    </div>
                                    <div className="overflow-hidden border border-border/70">
                                      {target.subscribers.map((subscriber) => (
                                        <div
                                          key={subscriber.id}
                                          className="grid gap-2 border-b border-border/60 px-3 py-2 last:border-b-0 md:grid-cols-[minmax(0,1.4fr)_100px_minmax(0,1fr)] md:items-center"
                                        >
                                          <div className="min-w-0">
                                            <p className="truncate text-xs font-semibold text-foreground">
                                              {subscriber.email}
                                            </p>
                                            {subscriber.lastError ? (
                                              <p className="mt-0.5 truncate text-[11px] text-destructive">
                                                {subscriber.lastError}
                                              </p>
                                            ) : null}
                                          </div>
                                          <div>
                                            <Badge
                                              variant={subscriberStatusBadgeTone(
                                                subscriber.status,
                                              )}
                                            >
                                              {subscriber.status}
                                            </Badge>
                                          </div>
                                          <p className="text-[11px] text-muted-foreground">
                                            {formatSubscriberActivity(subscriber)}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                              </Fragment>
                            );
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </AdminPanel>
    </div>
  );
}
