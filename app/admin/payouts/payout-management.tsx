"use client";

import { useMemo, useState } from "react";

import { Loader2, MoreHorizontal, RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";

import { getApiErrorMessage, readJsonSafely } from "@/lib/api/client";
import {
  ACH_PAYOUT_METHOD,
  CRYPTO_PAYOUT_METHOD,
  getPayoutMethodShortLabel,
  hasCompletePayoutDestination,
  type AdminPayoutDestinationDetail,
  type PayoutDestinationPreview,
  type PayoutMethod,
} from "@/lib/checkout/payout-methods";
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

type WeeklyPayoutRow = {
  id: string;
  batchType: "weekly" | "pay_now";
  payoutMethod: PayoutMethod;
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
  achAccountHolderName: string | null;
  achBankName: string | null;
  achAccountType: "checking" | "savings" | null;
  achRoutingNumberLast4: string | null;
  achAccountNumberLast4: string | null;
  destinationPreview: PayoutDestinationPreview;
  payoutFeeRate: string;
  payoutFeeAmount: string;
  netPayoutAmount: string;
  txHash: string | null;
  paymentReference: string | null;
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
  destinationDetail: AdminPayoutDestinationDetail;
  earnings: WeeklyPayoutEarningRow[];
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
  | "pay_now"
  | "ach"
  | "crypto";

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

function isBatchPayoutReady(batch: WeeklyPayoutRow) {
  return hasCompletePayoutDestination({
    payoutMethod: batch.payoutMethod,
    walletAddress: batch.walletAddress,
    achAccountHolderName: batch.achAccountHolderName,
    achBankName: batch.achBankName,
    achAccountType: batch.achAccountType,
    achRoutingNumberLast4: batch.achRoutingNumberLast4,
    achAccountNumberLast4: batch.achAccountNumberLast4,
  });
}

function formatBatchWindow(batch: WeeklyPayoutRow, fallbackPeriod: string) {
  if (batch.batchType === "weekly") {
    return fallbackPeriod;
  }

  return `${formatDate(batch.periodStart)} - ${formatDate(batch.periodEnd)}`;
}

function getReferenceLabel(method: PayoutMethod) {
  return method === ACH_PAYOUT_METHOD
    ? "ACH reference / trace number"
    : "Polygon tx hash";
}

function getReferencePlaceholder(method: PayoutMethod) {
  return method === ACH_PAYOUT_METHOD ? "ACH trace or confirmation number" : "0x...";
}

function getBatchReference(batch: Pick<WeeklyPayoutRow, "paymentReference" | "txHash">) {
  return batch.paymentReference ?? batch.txHash ?? null;
}

function formatAccountType(accountType: "checking" | "savings" | null) {
  if (!accountType) return "-";
  return accountType.charAt(0).toUpperCase() + accountType.slice(1);
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
    useState<WeeklyPayoutBatchDetail | null>(null);
  const [paymentReferenceInput, setPaymentReferenceInput] = useState("");
  const [notesInput, setNotesInput] = useState("");

  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.id === selectedBatchId) ?? null,
    [batches, selectedBatchId],
  );

  const counts = useMemo(
    () => ({
      all: batches.length,
      pending: batches.filter((entry) => entry.status === "pending").length,
      approved: batches.filter((entry) => entry.status === "approved").length,
      paid: batches.filter((entry) => entry.status === "paid").length,
      rejected: batches.filter((entry) => entry.status === "rejected").length,
      affiliate: batches.filter((entry) => entry.partnerType === "affiliate").length,
      promoter: batches.filter((entry) => entry.partnerType === "promoter").length,
      weekly: batches.filter((entry) => entry.batchType === "weekly").length,
      payNow: batches.filter((entry) => entry.batchType === "pay_now").length,
      ach: batches.filter((entry) => entry.payoutMethod === ACH_PAYOUT_METHOD).length,
      crypto: batches.filter((entry) => entry.payoutMethod === CRYPTO_PAYOUT_METHOD).length,
    }),
    [batches],
  );

  const totals = useMemo(() => {
    const summary = {
      openNet: 0,
      approvedNet: 0,
      paidNet: 0,
      achOpenCount: 0,
      achOpenGross: 0,
      achOpenFee: 0,
      achOpenNet: 0,
    };

    return batches.reduce((acc, entry) => {
      const grossAmount = Number(entry.totalNormalizedCommissionAmount) || 0;
      const feeAmount = Number(entry.payoutFeeAmount) || 0;
      const netAmount = Number(entry.netPayoutAmount) || 0;
      const isOpen = entry.status === "pending" || entry.status === "approved";

      if (isOpen) {
        acc.openNet += netAmount;
      }

      if (entry.status === "approved") {
        acc.approvedNet += netAmount;
      }

      if (entry.status === "paid") {
        acc.paidNet += netAmount;
      }

      if (entry.payoutMethod === ACH_PAYOUT_METHOD && isOpen) {
        acc.achOpenCount += 1;
        acc.achOpenGross += grossAmount;
        acc.achOpenFee += feeAmount;
        acc.achOpenNet += netAmount;
      }

      return acc;
    }, summary);
  }, [batches]);

  const filteredBatches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return batches.filter((entry) => {
      if (filter === "affiliate" && entry.partnerType !== "affiliate") return false;
      if (filter === "promoter" && entry.partnerType !== "promoter") return false;
      if (filter === "weekly" && entry.batchType !== "weekly") return false;
      if (filter === "pay_now" && entry.batchType !== "pay_now") return false;
      if (filter === "ach" && entry.payoutMethod !== ACH_PAYOUT_METHOD) return false;
      if (filter === "crypto" && entry.payoutMethod !== CRYPTO_PAYOUT_METHOD) return false;
      if (
        filter !== "all" &&
        filter !== "affiliate" &&
        filter !== "promoter" &&
        filter !== "weekly" &&
        filter !== "pay_now" &&
        filter !== "ach" &&
        filter !== "crypto" &&
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
        getPayoutMethodShortLabel(entry.payoutMethod)
          .toLowerCase()
          .includes(normalizedQuery) ||
        entry.destinationPreview.title.toLowerCase().includes(normalizedQuery) ||
        (entry.destinationPreview.subtitle ?? "")
          .toLowerCase()
          .includes(normalizedQuery) ||
        entry.walletAddress.toLowerCase().includes(normalizedQuery) ||
        (entry.achBankName ?? "").toLowerCase().includes(normalizedQuery) ||
        (entry.achAccountNumberLast4 ?? "").toLowerCase().includes(normalizedQuery) ||
        (entry.paymentReference ?? "").toLowerCase().includes(normalizedQuery) ||
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
    { key: "ach", label: "ACH", count: counts.ach },
    { key: "crypto", label: "Crypto", count: counts.crypto },
    { key: "affiliate", label: "Growth Partners", count: counts.affiliate },
    { key: "promoter", label: "Promoters", count: counts.promoter },
    { key: "weekly", label: "Weekly", count: counts.weekly },
    { key: "pay_now", label: "Pay now", count: counts.payNow },
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
        throw new Error(
          getApiErrorMessage(payload, "Failed to generate weekly payout batches."),
        );
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
        throw new Error(
          getApiErrorMessage(payload, "Failed to create pay-now payout batches."),
        );
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
        throw new Error(
          getApiErrorMessage(payload, "Failed to update weekly payout batch."),
        );
      }

      setMarkPaidOpen(false);
      setRejectOpen(false);
      setSelectedBatchId(null);
      setPaymentReferenceInput("");
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
        ...batch,
        ...detail.data.batch,
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

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <AdminStatCard
          label="Payout batches"
          value={counts.all}
          detail={`${counts.affiliate} Growth Partners • ${counts.promoter} promoters`}
          size="compact"
        />
        <AdminStatCard
          label="Ready to send"
          value={counts.approved}
          detail={`${formatUsd(totals.approvedNet)} net approved`}
          size="compact"
        />
        <AdminStatCard
          label="Pay-now batches"
          value={counts.payNow}
          detail={`${counts.weekly} weekly batches`}
          tone="muted"
          size="compact"
        />
        <AdminStatCard
          label="Open net payouts"
          value={formatUsd(totals.openNet)}
          detail="Pending + approved batches"
          size="compact"
        />
        <AdminStatCard
          label="Paid out net"
          value={formatUsd(totals.paidNet)}
          detail="Net marked paid in this loaded view"
          tone="muted"
          size="compact"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard
          label="ACH batches to fund"
          value={totals.achOpenCount}
          detail="Open ACH batches that still need bank transfer funding"
          tone="muted"
          size="compact"
        />
        <AdminStatCard
          label="ACH gross queued"
          value={formatUsd(totals.achOpenGross)}
          detail="Gross before ACH fee"
          tone="muted"
          size="compact"
        />
        <AdminStatCard
          label="ACH fee total"
          value={formatUsd(totals.achOpenFee)}
          detail="5% fee from withdrawal and bank transfer costs"
          tone="muted"
          size="compact"
        />
        <AdminStatCard
          label="ACH net to withdraw"
          value={formatUsd(totals.achOpenNet)}
          detail="Net amount finance needs to fund for ACH payouts"
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
              placeholder="Partner, method, bank, last4, reference"
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
              <TableHead>Method</TableHead>
              <TableHead>Gross / fee / net</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="w-[56px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBatches.map((batch) => {
              const payoutReady = isBatchPayoutReady(batch);
              const reference = getBatchReference(batch);

              return (
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
                    <div className="space-y-1">
                      <Badge variant={batch.batchType === "pay_now" ? "secondary" : "outline"}>
                        {formatBatchType(batch.batchType)}
                      </Badge>
                      <p className="text-[11px] text-muted-foreground">
                        {batch.batchType === "pay_now" ? "Manual pull-forward" : period.label}
                      </p>
                    </div>
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
                      <Badge variant="outline">{getPayoutMethodShortLabel(batch.payoutMethod)}</Badge>
                      <p className="text-[11px] text-muted-foreground">
                        {batch.payoutCurrencyCode}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-foreground">
                        {formatUsd(batch.totalNormalizedCommissionAmount)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Fee {formatUsd(batch.payoutFeeAmount)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Net {formatUsd(batch.netPayoutAmount)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[220px] space-y-1">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {batch.destinationPreview.title}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {batch.destinationPreview.subtitle || "No payout details on file"}
                      </p>
                      {!payoutReady ? (
                        <p className="text-[11px] text-destructive">Missing payout details</p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Badge variant={statusBadgeVariant(batch.status)}>
                        {batch.status}
                      </Badge>
                      {batch.adminNotes ? (
                        <p className="max-w-[180px] truncate text-[11px] text-muted-foreground">
                          {batch.adminNotes}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[180px]">
                    {reference ? (
                      batch.payoutMethod === CRYPTO_PAYOUT_METHOD ? (
                        <a
                          href={`https://polygonscan.com/tx/${reference}`}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate font-mono text-[11px] text-foreground underline underline-offset-4"
                        >
                          {reference}
                        </a>
                      ) : (
                        <span className="truncate font-mono text-[11px] text-foreground">
                          {reference}
                        </span>
                      )
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Pending</span>
                    )}
                    {batch.paidAt ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Paid {formatDateTime(batch.paidAt)}
                      </p>
                    ) : null}
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
                            disabled={!payoutReady}
                            onClick={() => {
                              if (!payoutReady) return;
                              setSelectedBatchId(batch.id);
                              setPaymentReferenceInput("");
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
              );
            })}

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

      <Dialog
        open={markPaidOpen}
        onOpenChange={(open) => {
          setMarkPaidOpen(open);
          if (!open) {
            setPaymentReferenceInput("");
          }
        }}
      >
        <DialogContent className="rounded-none">
          <DialogHeader>
            <DialogTitle>Mark payout batch paid</DialogTitle>
          </DialogHeader>
          {selectedBatch ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Partner
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {selectedBatch.partnerCode}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {selectedBatch.partnerType === "promoter" ? "Promoter" : "Growth Partner"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Method
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {getPayoutMethodShortLabel(selectedBatch.payoutMethod)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {selectedBatch.destinationPreview.title}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Settlement
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    Net {formatUsd(selectedBatch.netPayoutAmount)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Gross {formatUsd(selectedBatch.totalNormalizedCommissionAmount)} • Fee{" "}
                    {formatUsd(selectedBatch.payoutFeeAmount)}
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Destination preview
                </p>
                <p className="text-sm text-foreground">{selectedBatch.destinationPreview.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {selectedBatch.destinationPreview.subtitle || "No payout details on file"}
                </p>
              </div>

              {!isBatchPayoutReady(selectedBatch) ? (
                <p className="text-sm text-destructive">
                  This batch cannot be marked paid until the payout destination is complete.
                </p>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="paymentReference">
                  {getReferenceLabel(selectedBatch.payoutMethod)}
                </Label>
                <Input
                  id="paymentReference"
                  value={paymentReferenceInput}
                  onChange={(event) => setPaymentReferenceInput(event.target.value)}
                  placeholder={getReferencePlaceholder(selectedBatch.payoutMethod)}
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
                  disabled={
                    !selectedBatchId ||
                    !paymentReferenceInput.trim() ||
                    loading ||
                    !isBatchPayoutReady(selectedBatch)
                  }
                  onClick={() =>
                    selectedBatchId
                      ? handleBatchAction(selectedBatchId, "mark_paid", {
                          paymentReference: paymentReferenceInput.trim(),
                          partnerType: selectedBatch.partnerType,
                        })
                      : undefined
                  }
                >
                  {loading ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : null}
                  Confirm payout sent
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) {
            setSelectedBatchDetail(null);
            setDetailError("");
          }
        }}
      >
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
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <AdminStatCard
                  label="Partner"
                  value={
                    selectedBatchDetail.partnerType === "promoter"
                      ? selectedBatchDetail.promoterName || selectedBatchDetail.partnerCode
                      : selectedBatchDetail.affiliateName || selectedBatchDetail.partnerCode
                  }
                  size="compact"
                />
                <AdminStatCard
                  label="Method"
                  value={getPayoutMethodShortLabel(selectedBatchDetail.payoutMethod)}
                  size="compact"
                />
                <AdminStatCard
                  label="Gross"
                  value={formatUsd(selectedBatchDetail.totalNormalizedCommissionAmount)}
                  size="compact"
                />
                <AdminStatCard
                  label="ACH fee"
                  value={formatUsd(selectedBatchDetail.payoutFeeAmount)}
                  size="compact"
                />
                <AdminStatCard
                  label="Net"
                  value={formatUsd(selectedBatchDetail.netPayoutAmount)}
                  size="compact"
                />
                <AdminStatCard
                  label="Status"
                  value={selectedBatchDetail.status}
                  size="compact"
                />
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                <div className="space-y-3 border border-border/70 p-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Batch snapshot
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Batch type</p>
                      <p className="font-semibold text-foreground">
                        {formatBatchType(selectedBatchDetail.batchType)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Period</p>
                      <p className="font-semibold text-foreground">
                        {formatBatchWindow(selectedBatchDetail, period.label)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Commission month</p>
                      <p className="font-semibold text-foreground">
                        {selectedBatchDetail.commissionMonthKey}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Earnings</p>
                      <p className="font-semibold text-foreground">
                        {selectedBatchDetail.earnings.length}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Effective rate</p>
                      <p className="font-semibold text-foreground">
                        {selectedBatchDetail.effectiveRate
                          ? formatRate(selectedBatchDetail.effectiveRate)
                          : "Promoter commission"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Tier snapshot</p>
                      <p className="font-semibold text-foreground">
                        {selectedBatchDetail.currentTierLabel ||
                          selectedBatchDetail.currentTierKey ||
                          "No tier"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {selectedBatchDetail.nextTierLabel
                          ? `${formatUsd(selectedBatchDetail.amountToNextTier || "0")} to ${selectedBatchDetail.nextTierLabel}`
                          : selectedBatchDetail.partnerType === "promoter"
                            ? "Flat promoter rate"
                            : "Top tier reached"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 border border-border/70 p-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Payout destination
                  </h3>
                  {selectedBatchDetail.destinationDetail.method === CRYPTO_PAYOUT_METHOD ? (
                    <div className="space-y-2 text-xs">
                      <div>
                        <p className="text-[11px] text-muted-foreground">Wallet address</p>
                        <p className="break-all font-mono text-foreground">
                          {selectedBatchDetail.destinationDetail.walletAddress || "-"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 text-xs">
                      <div>
                        <p className="text-[11px] text-muted-foreground">Account holder</p>
                        <p className="font-semibold text-foreground">
                          {selectedBatchDetail.destinationDetail.accountHolderName || "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">Bank</p>
                        <p className="font-semibold text-foreground">
                          {selectedBatchDetail.destinationDetail.bankName || "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">Account type</p>
                        <p className="font-semibold text-foreground">
                          {formatAccountType(selectedBatchDetail.destinationDetail.accountType)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">Routing number</p>
                        <p className="font-mono text-foreground">
                          {selectedBatchDetail.destinationDetail.routingNumber ||
                            selectedBatchDetail.destinationDetail.maskedRoutingNumber ||
                            "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">Account number</p>
                        <p className="font-mono text-foreground">
                          {selectedBatchDetail.destinationDetail.accountNumber ||
                            selectedBatchDetail.destinationDetail.maskedAccountNumber ||
                            "-"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3 border border-border/70 p-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Transfer record
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Reference</p>
                      <p className="break-all font-mono text-foreground">
                        {getBatchReference(selectedBatchDetail) || "Pending"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Approved at</p>
                      <p className="font-semibold text-foreground">
                        {formatDateTime(selectedBatchDetail.approvedAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Paid at</p>
                      <p className="font-semibold text-foreground">
                        {formatDateTime(selectedBatchDetail.paidAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Admin notes</p>
                      <p className="font-semibold text-foreground">
                        {selectedBatchDetail.adminNotes || "-"}
                      </p>
                    </div>
                  </div>
                </div>
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
                    {selectedBatchDetail.earnings.map((earning) => (
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
                                selectedBatchDetail.affiliateName ||
                                earning.affiliateCode}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {earning.growthPartnerEmail ||
                                selectedBatchDetail.affiliateEmail ||
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

                    {selectedBatchDetail.earnings.length === 0 ? (
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

      <Dialog
        open={rejectOpen}
        onOpenChange={(open) => {
          setRejectOpen(open);
          if (!open) {
            setNotesInput("");
          }
        }}
      >
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
                disabled={!selectedBatchId || !selectedBatch || loading}
                onClick={() =>
                  selectedBatchId && selectedBatch
                    ? handleBatchAction(selectedBatchId, "reject", {
                        notes: notesInput.trim(),
                        partnerType: selectedBatch.partnerType,
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
