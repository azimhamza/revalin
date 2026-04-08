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

type WeeklyPayoutRow = {
  id: string;
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

type SerializedWeeklyPayoutPeriod = {
  periodKey: string;
  timezone: string;
  start: string;
  end: string;
  startLocalDate: string;
  endLocalDate: string;
  label: string;
};

type StatusFilter = "all" | "pending" | "approved" | "paid" | "rejected";

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
      if (filter !== "all" && entry.status !== filter) return false;
      if (!normalizedQuery) return true;

      return (
        entry.affiliateCode.toLowerCase().includes(normalizedQuery) ||
        entry.commissionMonthKey.toLowerCase().includes(normalizedQuery) ||
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
  ];

  async function refreshWithPeriod(nextPeriodDate = selectedPeriodDate) {
    router.push(`/admin/payouts?periodDate=${encodeURIComponent(nextPeriodDate)}`);
    router.refresh();
  }

  async function handleGenerate() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          periodDate: selectedPeriodDate,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate weekly payout batches.");
      }

      await refreshWithPeriod(selectedPeriodDate);
    } catch (error) {
      console.error("[ADMIN-WEEKLY-PAYOUTS-GENERATE]", error);
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
      const response = await fetch(`/api/admin/payouts/${batchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update weekly payout batch.");
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

  return (
    <div className="space-y-4">
      <AdminSectionHeader
        title="Weekly payout queue"
        description={`Weekly batches for ${period.label} (${period.timezone}). Generate this window manually, then mark each batch paid once the transfer has been sent.`}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard label="Weekly batches" value={counts.all} size="compact" />
        <AdminStatCard label="Ready to send" value={counts.approved} size="compact" />
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
            Generate / refresh batches
          </Button>
        </div>
      </div>

      <AdminFilterTabs options={filterOptions} value={filter} onChange={setFilter} />

      <div className="overflow-hidden border border-border/70 bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Affiliate</TableHead>
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
                      {batch.affiliateCode}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDate(batch.approvedAt || batch.createdAt)}
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
                    <p className="text-[11px] text-muted-foreground">{period.label}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-foreground">
                      {formatUsd(batch.totalNormalizedCommissionAmount)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Rate {formatRate(batch.effectiveRate)}
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
                      {batch.status !== "paid" && batch.status !== "rejected" ? (
                        <DropdownMenuItem
                          onClick={() => {
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
                  colSpan={9}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No weekly payout batches for this period yet. Generate the period to batch
                  eligible affiliate earnings.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog open={markPaidOpen} onOpenChange={setMarkPaidOpen}>
        <DialogContent className="rounded-none">
          <DialogHeader>
            <DialogTitle>Mark weekly payout batch paid</DialogTitle>
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

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="rounded-none">
          <DialogHeader>
            <DialogTitle>Reject weekly payout batch</DialogTitle>
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
