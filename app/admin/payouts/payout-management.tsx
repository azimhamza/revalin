"use client";

import { useMemo, useState } from "react";

import { Loader2, MoreHorizontal, RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  AdminFilterTabs,
  AdminSectionHeader,
  AdminStatCard,
} from "../_components/admin-shell";
import { getApiErrorMessage, readJsonSafely } from "@/lib/api/client";

type WeeklyPayoutRow = {
  id: string;
  batchType: "weekly" | "pay_now";
  partnerType: "affiliate" | "promoter";
  partnerId: string;
  partnerCode: string;
  affiliateId: string;
  affiliateCode: string;
  commissionMonthKey: string;
  periodStart: string;
  periodEnd: string;
  periodTimezone: string;
  earningCount: number;
  totalNormalizedCommissionAmount: string;
  payoutCurrencyCode: string;
  currentTierKey: string | null;
  currentTierLabel: string | null;
  nextTierKey: string | null;
  nextTierLabel: string | null;
  amountToNextTier: string | null;
  effectiveRate: string | null;
  walletAddress: string;
  txHash: string | null;
  adminNotes: string | null;
  status: "pending" | "approved" | "paid" | "rejected";
  approvedAt: string | null;
  paidAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type WeeklyPayoutEarningRow = {
  id: string;
  orderId: string;
  affiliateCode: string;
  orderTotal: string;
  normalizedOrderTotal: string | null;
  commissionRate: string;
  commissionAmount: string;
  normalizedCommissionAmount: string | null;
  payoutCurrencyCode: string;
  currencyCode: string;
  paymentProvider: string;
  earnedAt: string | null;
  status: WeeklyPayoutRow["status"];
  txHash: string | null;
  growthPartnerName?: string | null;
  growthPartnerEmail?: string | null;
};

type WeeklyPayoutBatchDetail = WeeklyPayoutRow & {
  affiliateName?: string;
  affiliateEmail?: string;
  promoterName?: string;
  promoterEmail?: string;
  earnings: WeeklyPayoutEarningRow[];
};

type SelectedBatchDetail = {
  partnerType: WeeklyPayoutRow["partnerType"];
  batch: WeeklyPayoutBatchDetail;
};

type SerializedWeeklyPayoutPeriod = {
  periodKey: string;
  timezone: string;
  start: string;
  end: string;
  startLocalDate: string;
  endLocalDate: string;
  label: string;
};

type StatusFilter =
  | "all"
  | "pending"
  | "approved"
  | "paid"
  | "rejected"
  | "affiliate"
  | "promoter"
  | "weekly"
  | "pay_now";

function statusBadgeVariant(
  status: WeeklyPayoutRow["status"],
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "paid") return "default";
  if (status === "approved") return "secondary";
  if (status === "rejected") return "destructive";
  return "outline";
}

function formatUsd(value: string | number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatRate(value: string | null) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatBatchType(batchType: WeeklyPayoutRow["batchType"]) {
  return batchType === "pay_now" ? "Pay now" : "Weekly";
}

function formatBatchWindow(batch: WeeklyPayoutRow, fallbackPeriod: string) {
  if (batch.batchType === "weekly") {
    return fallbackPeriod;
  }

  return `${formatDate(batch.periodStart)} - ${formatDate(batch.periodEnd)}`;
}

export function PayoutManagement({
  periodDate,
  period,
  batches,
}: {
  periodDate: string;
  period: SerializedWeeklyPayoutPeriod;
  batches: WeeklyPayoutRow[];
}) {
  const router = useRouter();
  const [selectedPeriodDate, setSelectedPeriodDate] = useState(periodDate);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [selectedBatchDetail, setSelectedBatchDetail] =
    useState<SelectedBatchDetail | null>(null);
  const [txHashInput, setTxHashInput] = useState("");
  const [notesInput, setNotesInput] = useState("");

  const counts = useMemo(
    () => ({
      all: batches.length,
      pending: batches.filter((entry) => entry.status === "pending").length,
      approved: batches.filter((entry) => entry.status === "approved").length,
      paid: batches.filter((entry) => entry.status === "paid").length,
      rejected: batches.filter((entry) => entry.status === "rejected").length,
    }),
    [batches],
  );

  const totals = useMemo(
    () =>
      batches.reduce(
        (acc, entry) => {
          const amount = Number(entry.totalNormalizedCommissionAmount) || 0;
          acc.all += amount;
          acc[entry.status] += amount;
          return acc;
        },
        {
          all: 0,
          pending: 0,
          approved: 0,
          paid: 0,
          rejected: 0,
        },
      ),
    [batches],
  );

  const filteredBatches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return batches.filter((entry) => {
      if (filter === "affiliate" && entry.partnerType !== "affiliate") return false;
      if (filter === "promoter" && entry.partnerType !== "promoter") return false;
      if (filter === "weekly" && entry.batchType !== "weekly") return false;
      if (filter === "pay_now" && entry.batchType !== "pay_now") return false;
      if (
        filter !== "all" &&
        filter !== "affiliate" &&
        filter !== "promoter" &&
        filter !== "weekly" &&
        filter !== "pay_now" &&
        entry.status !== filter
      ) {
        return false;
      }
      if (!normalizedQuery) return true;

      return (
        entry.partnerCode.toLowerCase().includes(normalizedQuery) ||
        entry.affiliateCode.toLowerCase().includes(normalizedQuery) ||
        entry.commissionMonthKey.toLowerCase().includes(normalizedQuery) ||
        formatBatchType(entry.batchType).toLowerCase().includes(normalizedQuery) ||
        entry.walletAddress.toLowerCase().includes(normalizedQuery) ||
        (entry.txHash ?? "").toLowerCase().includes(normalizedQuery) ||
        (entry.currentTierLabel ?? entry.currentTierKey ?? "")
          .toLowerCase()
          .includes(normalizedQuery)
      );
    });
  }, [batches, filter, query]);

  const filterOptions: { key: StatusFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "pending", label: "Pending", count: counts.pending },
    { key: "approved", label: "Ready", count: counts.approved },
    { key: "paid", label: "Paid", count: counts.paid },
    { key: "rejected", label: "Rejected", count: counts.rejected },
    {
      key: "affiliate",
      label: "Growth Partners",
      count: batches.filter((entry) => entry.partnerType === "affiliate").length,
    },
    {
      key: "promoter",
      label: "Promoters",
      count: batches.filter((entry) => entry.partnerType === "promoter").length,
    },
    {
      key: "weekly",
      label: "Weekly",
      count: batches.filter((entry) => entry.batchType === "weekly").length,
    },
    {
      key: "pay_now",
      label: "Pay now",
      count: batches.filter((entry) => entry.batchType === "pay_now").length,
    },
  ];

  async function refreshWithPeriod(nextPeriodDate = selectedPeriodDate) {
    router.push(`/admin/payouts?periodDate=${encodeURIComponent(nextPeriodDate)}`);
    router.refresh();
  }

  async function handleGenerate() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/payout-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          periodDate: selectedPeriodDate,
        }),
      });
      const payload = await readJsonSafely(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to generate weekly payout batches."));
      }

      await refreshWithPeriod(selectedPeriodDate);
    } catch (error) {
      console.error("[ADMIN-WEEKLY-PAYOUTS-GENERATE]", error);
    } finally {
      setLoading(false);
    }
  }

  async function handlePayNowGenerate() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/payout-batches/pay-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerType: "all",
        }),
      });
      const payload = await readJsonSafely(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to create pay-now payout batches."));
      }

      await refreshWithPeriod(selectedPeriodDate);
    } catch (error) {
      console.error("[ADMIN-PAY-NOW-PAYOUTS-GENERATE]", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleBatchAction(
    batchId: string,
    action: "mark_paid" | "reject",
    extra?: Record<string, string>,
  ) {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/payout-batches/${batchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const payload = await readJsonSafely(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to update weekly payout batch."));
      }

      setMarkPaidOpen(false);
      setRejectOpen(false);
      setSelectedBatchId(null);
      setTxHashInput("");
      setNotesInput("");
      await refreshWithPeriod(selectedPeriodDate);
    } catch (error) {
      console.error("[ADMIN-WEEKLY-PAYOUTS-ACTION]", error);
    } finally {
      setLoading(false);
    }
  }

  async function openBatchDetail(batch: WeeklyPayoutRow) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError("");
    setSelectedBatchDetail(null);

    try {
      const response = await fetch(`/api/admin/payout-batches/${batch.id}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await readJsonSafely(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to load payout earnings."));
      }

      const detail = payload as {
        data?: {
          batch?: WeeklyPayoutBatchDetail;
        };
      };

      if (!detail.data?.batch) {
        throw new Error("Payout batch details were not returned.");
      }

      setSelectedBatchDetail({
        partnerType: batch.partnerType,
        batch: {
          ...batch,
          ...detail.data.batch,
        },
      });
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : "Failed to load payout earnings.",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <AdminSectionHeader
        title="Payout queue"
        description={`Weekly batches for ${period.label} (${period.timezone}) plus recent pay-now batches. Create batches here, then mark each one paid after the transfer is sent.`}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard label="Payout batches" value={counts.all} size="compact" />
        <AdminStatCard label="Ready to send" value={counts.approved} size="compact" />
        <AdminStatCard
          label="Pay-now batches"
          value={batches.filter((entry) => entry.batchType === "pay_now").length}
          tone="muted"
          size="compact"
        />
        <AdminStatCard
          label="Current batch value"
          value={formatUsd(totals.approved + totals.pending)}
          size="compact"
        />
        <AdminStatCard
          label="Paid this period"
          value={formatUsd(totals.paid)}
          tone="muted"
          size="compact"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Weekly period
            </Label>
            <Input
              type="date"
              value={selectedPeriodDate}
              onChange={(event) => setSelectedPeriodDate(event.target.value)}
              className={adminFieldClass}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Search
            </Label>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Affiliate code, tier, wallet, tx hash"
              className={adminFieldClass}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => refreshWithPeriod(selectedPeriodDate)}
            className={adminSecondaryButtonClass}
          >
            <RefreshCcw className="mr-2 size-3.5" />
            Load period
          </Button>
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className={adminPrimaryButtonClass}
          >
            {loading ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : null}
            Generate / refresh weekly
          </Button>
          <Button
            type="button"
            onClick={handlePayNowGenerate}
            disabled={loading}
            className={adminPrimaryButtonClass}
          >
            {loading ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : null}
            Create pay-now batches
          </Button>
        </div>
      </div>

      <AdminFilterTabs options={filterOptions} value={filter} onChange={setFilter} />

      <div className="overflow-hidden border border-border/70 bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Partner</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Commission month</TableHead>
              <TableHead>Earnings</TableHead>
              <TableHead>Payout</TableHead>
              <TableHead>Tier snapshot</TableHead>
              <TableHead>Wallet</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Transfer</TableHead>
              <TableHead className="w-[56px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBatches.map((batch) => (
              <TableRow key={batch.id}>
                <TableCell>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-foreground">
                      {batch.partnerCode}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {batch.partnerType === "promoter" ? "Promoter" : "Growth Partner"} •{" "}
                      {formatDate(batch.approvedAt || batch.createdAt)}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={batch.batchType === "pay_now" ? "secondary" : "outline"}>
                    {formatBatchType(batch.batchType)}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {batch.commissionMonthKey}
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-foreground">
                      {batch.earningCount} {batch.earningCount === 1 ? "earning" : "earnings"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatBatchWindow(batch, period.label)}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-foreground">
                      {formatUsd(batch.totalNormalizedCommissionAmount)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {batch.effectiveRate ? `Rate ${formatRate(batch.effectiveRate)}` : "Promoter commission"}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-foreground">
                      {batch.currentTierLabel || batch.currentTierKey || "No tier"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {batch.nextTierLabel
                        ? `${formatUsd(batch.amountToNextTier || "0")} to ${batch.nextTierLabel}`
                        : batch.partnerType === "promoter"
                          ? "Flat promoter rate"
                          : "Top tier reached"}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="max-w-[180px] space-y-1">
                    <p className="truncate font-mono text-[11px] text-foreground">
                      {batch.walletAddress || "No wallet on file"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {batch.payoutCurrencyCode}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={statusBadgeVariant(batch.status)}>
                    {batch.status}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[160px]">
                  {batch.txHash ? (
                    <a
                      href={`https://polygonscan.com/tx/${batch.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate font-mono text-[11px] text-foreground underline underline-offset-4"
                    >
                      {batch.txHash}
                    </a>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Pending</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8 rounded-none">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-none">
                      <DropdownMenuItem onClick={() => openBatchDetail(batch)}>
                        View earnings
                      </DropdownMenuItem>
                      {batch.status !== "paid" && batch.status !== "rejected" ? (
                        <DropdownMenuItem
                          disabled={batch.partnerType === "promoter" && !batch.walletAddress}
                          onClick={() => {
                            if (batch.partnerType === "promoter" && !batch.walletAddress) return;
                            setSelectedBatchId(batch.id);
                            setTxHashInput("");
                            setMarkPaidOpen(true);
                          }}
                        >
                          Mark paid
                        </DropdownMenuItem>
                      ) : null}
                      {batch.status !== "paid" && batch.status !== "rejected" ? (
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedBatchId(batch.id);
                            setNotesInput(batch.adminNotes || "");
                            setRejectOpen(true);
                          }}
                        >
                          Reject batch
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}

            {filteredBatches.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No payout batches match this view yet. Generate the weekly period or create
                  pay-now batches to queue eligible partner earnings.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog open={markPaidOpen} onOpenChange={setMarkPaidOpen}>
        <DialogContent className="rounded-none">
          <DialogHeader>
            <DialogTitle>Mark payout batch paid</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="txHash">Polygon tx hash</Label>
              <Input
                id="txHash"
                value={txHashInput}
                onChange={(event) => setTxHashInput(event.target.value)}
                placeholder="0x..."
                className={adminFieldClass}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className={adminSecondaryButtonClass}
                onClick={() => setMarkPaidOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className={adminPrimaryButtonClass}
                disabled={!selectedBatchId || !txHashInput.trim() || loading}
                onClick={() =>
                  selectedBatchId
                    ? handleBatchAction(selectedBatchId, "mark_paid", {
                        txHash: txHashInput.trim(),
                        partnerType:
                          batches.find((batch) => batch.id === selectedBatchId)
                            ?.partnerType || "affiliate",
                      })
                    : undefined
                }
              >
                {loading ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : null}
                Confirm payout sent
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-5xl rounded-none">
          <DialogHeader>
            <DialogTitle>Payout earnings</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading payout earnings...
            </div>
          ) : detailError ? (
            <p className="py-8 text-sm text-destructive">{detailError}</p>
          ) : selectedBatchDetail ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <AdminStatCard
                  label="Partner"
                  value={
                    selectedBatchDetail.partnerType === "promoter"
                      ? selectedBatchDetail.batch.promoterName ||
                        selectedBatchDetail.batch.partnerCode
                      : selectedBatchDetail.batch.affiliateName ||
                        selectedBatchDetail.batch.partnerCode
                  }
                  size="compact"
                />
                <AdminStatCard
                  label="Payout amount"
                  value={formatUsd(
                    selectedBatchDetail.batch.totalNormalizedCommissionAmount,
                  )}
                  size="compact"
                />
                <AdminStatCard
                  label="Earnings"
                  value={selectedBatchDetail.batch.earnings.length}
                  size="compact"
                />
                <AdminStatCard
                  label="Status"
                  value={selectedBatchDetail.batch.status}
                  size="compact"
                />
              </div>

              <div className="overflow-auto border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sale</TableHead>
                      <TableHead>Growth Partner</TableHead>
                      <TableHead>Order total</TableHead>
                      <TableHead>Commission</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedBatchDetail.batch.earnings.map((earning) => (
                      <TableRow key={earning.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <a
                              href={`/order/${earning.orderId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-xs font-semibold text-foreground underline underline-offset-4"
                            >
                              {earning.orderId}
                            </a>
                            <p className="text-[11px] text-muted-foreground">
                              {formatDateTime(earning.earnedAt)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-foreground">
                              {earning.growthPartnerName ||
                                selectedBatchDetail.batch.affiliateName ||
                                earning.affiliateCode}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {earning.growthPartnerEmail ||
                                selectedBatchDetail.batch.affiliateEmail ||
                                earning.affiliateCode}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-foreground">
                              {formatUsd(earning.normalizedOrderTotal || earning.orderTotal)}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Paid order total
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-foreground">
                              {formatUsd(
                                earning.normalizedCommissionAmount ||
                                  earning.commissionAmount,
                              )}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Rate {formatRate(earning.commissionRate)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-foreground">
                              {earning.paymentProvider}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {earning.payoutCurrencyCode}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(earning.status)}>
                            {earning.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}

                    {selectedBatchDetail.batch.earnings.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-8 text-center text-sm text-muted-foreground"
                        >
                          No earnings are attached to this payout batch.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="rounded-none">
          <DialogHeader>
            <DialogTitle>Reject payout batch</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={notesInput}
                onChange={(event) => setNotesInput(event.target.value)}
                placeholder="Why this batch was rejected"
                className={adminFieldClass}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className={adminSecondaryButtonClass}
                onClick={() => setRejectOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className={adminPrimaryButtonClass}
                disabled={!selectedBatchId || loading}
                onClick={() =>
                  selectedBatchId
                    ? handleBatchAction(selectedBatchId, "reject", {
                        notes: notesInput.trim(),
                        partnerType:
                          batches.find((batch) => batch.id === selectedBatchId)
                            ?.partnerType || "affiliate",
                      })
                    : undefined
                }
              >
                {loading ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : null}
                Reject batch
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
