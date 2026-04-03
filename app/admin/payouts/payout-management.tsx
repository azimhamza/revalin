"use client";

import { useState } from "react";

import { Loader2, MoreHorizontal } from "lucide-react";
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
  AdminFilterTabs,
  AdminPanel,
  AdminSectionHeader,
  AdminStatCard,
} from "../_components/admin-shell";

type PayoutRow = {
  id: string;
  orderId: string;
  affiliateId: string;
  affiliateCode: string;
  orderTotal: string;
  commissionMonthKey: string | null;
  commissionTierKey: string | null;
  commissionTierLabel: string | null;
  commissionRate: string;
  commissionAmount: string;
  currencyCode: string;
  paymentProvider: string;
  status: "pending" | "approved" | "paid" | "rejected";
  txHash: string | null;
  adminNotes: string | null;
  walletAddress: string;
  approvedAt: string | null;
  paidAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type PayoutPreview = {
  payoutId: string;
  affiliateId: string;
  affiliateCode: string;
  monthKey: string;
  summary: {
    recognizedRevenue: string;
    recognizedOrderCount: number;
    tierLabel: string;
    effectiveRate: string;
    hasOverride: boolean;
    overrideReason: string | null;
  };
  targetImpact: {
    oldCommissionRate: string;
    newCommissionRate: string;
    oldCommissionAmount: string;
    newCommissionAmount: string;
  } | null;
  siblingImpacts: Array<{
    payoutId: string;
    orderId: string;
    changed: boolean;
  }>;
  affectedCount: number;
};

type StatusFilter = "all" | "pending" | "approved" | "paid" | "rejected";

function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "paid") return "default";
  if (status === "approved") return "secondary";
  if (status === "rejected") return "destructive";
  return "outline";
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCommissionRate(value: string) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

export function PayoutManagement({ payouts }: { payouts: PayoutRow[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null);
  const [txHashInput, setTxHashInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [actionPreview, setActionPreview] = useState<PayoutPreview | null>(null);

  async function handleAction(
    id: string,
    action: string,
    extra?: Record<string, string>,
  ) {
    setLoadingId(id);
    try {
      const res = await fetch(`/api/admin/payouts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) {
        const data = await res.json();
        console.error("Failed to update payout:", data.error);
      }
      router.refresh();
    } catch (err) {
      console.error("Failed to update payout:", err);
    } finally {
      setLoadingId(null);
    }
  }

  async function loadPreview(
    id: string,
    action: "approve" | "mark_paid",
    openDialog = true,
  ) {
    setPreviewLoading(true);
    setSelectedPayoutId(id);
    setActionPreview(null);

    try {
      const response = await fetch(`/api/admin/payouts/${id}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to load payout preview.");
      }

      setActionPreview(data.preview ?? null);
      if (openDialog) {
        setPreviewOpen(true);
      }
    } catch (error) {
      console.error("Failed to load payout preview:", error);
    } finally {
      setPreviewLoading(false);
    }
  }

  function openApprove(id: string) {
    loadPreview(id, "approve");
  }

  function openMarkPaid(id: string) {
    setTxHashInput("");
    loadPreview(id, "mark_paid", false);
    setMarkPaidOpen(true);
  }

  function openReject(id: string) {
    setSelectedPayoutId(id);
    setNotesInput("");
    setRejectOpen(true);
  }

  const counts = {
    all: payouts.length,
    pending: payouts.filter((entry) => entry.status === "pending").length,
    approved: payouts.filter((entry) => entry.status === "approved").length,
    paid: payouts.filter((entry) => entry.status === "paid").length,
    rejected: payouts.filter((entry) => entry.status === "rejected").length,
  };

  const totals = payouts.reduce(
    (acc, entry) => {
      const amount = Number(entry.commissionAmount) || 0;

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
  );

  const filteredPayouts = payouts.filter((entry) => {
    if (filter !== "all" && entry.status !== filter) return false;

    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;

    return (
      entry.orderId.toLowerCase().includes(normalizedQuery) ||
      entry.affiliateCode.toLowerCase().includes(normalizedQuery) ||
      entry.paymentProvider.toLowerCase().includes(normalizedQuery) ||
      entry.walletAddress.toLowerCase().includes(normalizedQuery) ||
      (entry.txHash ?? "").toLowerCase().includes(normalizedQuery)
    );
  });

  const filterOptions: { key: StatusFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "pending", label: "Pending", count: counts.pending },
    { key: "approved", label: "Approved", count: counts.approved },
    { key: "paid", label: "Paid", count: counts.paid },
    { key: "rejected", label: "Rejected", count: counts.rejected },
  ];

  return (
    <div className="space-y-4">
      <AdminSectionHeader title="Payout queue" />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard label="Payout requests" value={counts.all} size="compact" />
        <AdminStatCard label="Pending review" value={counts.pending} size="compact" />
        <AdminStatCard label="Ready to send" value={counts.approved} size="compact" />
        <AdminStatCard
          label="Paid volume"
          value={formatUsd(totals.paid)}
          tone="muted"
          size="compact"
        />
      </div>

      <AdminPanel className="space-y-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid gap-2 xl:w-full xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search order ID, Growth Partner code, wallet, provider, or tx hash"
              className={adminFieldClass}
            />

            <AdminFilterTabs
              options={filterOptions}
              value={filter}
              onChange={setFilter}
            />
          </div>

          <div className="shrink-0 text-xs text-muted-foreground">
            Showing{" "}
            <span className="font-semibold text-foreground">
              {filteredPayouts.length}
            </span>{" "}
            of {payouts.length}
          </div>
        </div>
      </AdminPanel>

      <AdminPanel className="overflow-hidden p-0">
        <div className="border-b border-border/70 px-3 py-2.5">
          <h3 className="text-sm font-semibold tracking-[-0.03em] text-foreground">
            Approvals and payout state
          </h3>
        </div>

        <Table>
          <TableHeader className="bg-muted/60">
            <TableRow className="border-b-border hover:bg-transparent">
              <TableHead className="h-9 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Order
              </TableHead>
              <TableHead className="h-9 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Growth Partner
              </TableHead>
              <TableHead className="h-9 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Payout
              </TableHead>
              <TableHead className="h-9 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Month / tier
              </TableHead>
              <TableHead className="h-9 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="h-9 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Wallet
              </TableHead>
              <TableHead className="h-9 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Tx hash
              </TableHead>
              <TableHead className="h-9 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Updated
              </TableHead>
              <TableHead className="w-12 px-3" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPayouts.map((entry) => (
              <TableRow
                key={entry.id}
                className="border-b-border bg-background transition-colors hover:bg-muted/40"
              >
                <TableCell className="px-3 py-2.5 align-top">
                  <div className="space-y-1">
                    <p className="font-mono text-[11px] text-foreground">
                      {entry.orderId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(entry.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="px-3 py-2.5 align-top">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {entry.affiliateCode}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/80">
                      {entry.affiliateId}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="px-3 py-2.5 align-top text-xs text-muted-foreground">
                  <p className="text-sm font-semibold text-foreground">
                    ${entry.commissionAmount} {entry.currencyCode}
                  </p>
                  <p className="mt-1">
                    Order ${entry.orderTotal} at{" "}
                    {formatCommissionRate(entry.commissionRate)}
                  </p>
                  {entry.commissionTierLabel ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.commissionTierLabel}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="px-3 py-2.5 align-top text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  <p>{entry.commissionMonthKey || "-"}</p>
                  <p className="mt-1 text-[11px] normal-case tracking-normal text-muted-foreground">
                    {entry.paymentProvider}
                  </p>
                </TableCell>
                <TableCell className="px-3 py-2.5 align-top">
                  <Badge
                    variant={statusBadgeVariant(entry.status)}
                    className="capitalize"
                  >
                    {entry.status}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[180px] px-3 py-2.5 align-top font-mono text-[11px] text-muted-foreground">
                  <span className="block truncate">{entry.walletAddress}</span>
                </TableCell>
                <TableCell className="max-w-[180px] px-3 py-2.5 align-top font-mono text-[11px] text-muted-foreground">
                  <span className="block truncate">{entry.txHash || "-"}</span>
                  {entry.adminNotes ? (
                    <span className="mt-1.5 block text-[10px] leading-4 text-muted-foreground">
                      {entry.adminNotes}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="px-3 py-2.5 align-top text-xs text-muted-foreground">
                  {new Date(entry.updatedAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="px-3 py-2.5 align-top">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={loadingId === entry.id}
                        className="h-7 w-7 rounded-none border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        {loadingId === entry.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <MoreHorizontal className="size-4" />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="rounded-none border-border bg-popover p-0.5"
                    >
                      {entry.status === "pending" ? (
                        <DropdownMenuItem
                          onClick={() => openApprove(entry.id)}
                          className="rounded-none px-2.5 py-1.5 text-xs focus:bg-accent"
                        >
                          Approve
                        </DropdownMenuItem>
                      ) : null}
                      {entry.status === "approved" ? (
                        <DropdownMenuItem
                          onClick={() => openMarkPaid(entry.id)}
                          className="rounded-none px-2.5 py-1.5 text-xs focus:bg-accent"
                        >
                          Mark as paid
                        </DropdownMenuItem>
                      ) : null}
                      {entry.status === "pending" ||
                      entry.status === "approved" ? (
                        <DropdownMenuItem
                          onClick={() => openReject(entry.id)}
                          className="rounded-none px-2.5 py-1.5 text-xs text-red-600 focus:bg-red-50 focus:text-red-700"
                        >
                          Reject
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}

            {filteredPayouts.length === 0 ? (
              <TableRow className="border-b-0 bg-background hover:bg-background">
                <TableCell
                  colSpan={9}
                  className="px-3 py-8 text-center text-xs text-muted-foreground"
                >
                  No payouts match the current search and status filter.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </AdminPanel>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="rounded-none border-border bg-background p-0 shadow-[0_18px_56px_rgba(15,23,42,0.12)]">
          <DialogHeader className="border-b border-border px-3 py-2.5">
            <DialogTitle className="tracking-[-0.04em] text-foreground">
              Approval preview
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2.5 px-3 py-3">
            {previewLoading ? (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading month recalculation preview...
              </div>
            ) : actionPreview ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-none border border-border bg-muted/30 px-2.5 py-2">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Month
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {actionPreview.monthKey}
                    </p>
                  </div>
                  <div className="rounded-none border border-border bg-muted/30 px-2.5 py-2">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Revenue
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {formatUsd(Number(actionPreview.summary.recognizedRevenue))}
                    </p>
                  </div>
                  <div className="rounded-none border border-border bg-muted/30 px-2.5 py-2">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Tier
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {actionPreview.summary.tierLabel}
                    </p>
                  </div>
                  <div className="rounded-none border border-border bg-muted/30 px-2.5 py-2">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Effective rate
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {formatCommissionRate(actionPreview.summary.effectiveRate)}
                      </p>
                      {actionPreview.summary.hasOverride ? (
                        <Badge variant="secondary">
                          Override
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </div>

                {actionPreview.targetImpact ? (
                  <div className="rounded-none border border-border bg-muted/30 px-2.5 py-2.5">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Selected payout impact
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Rate {formatCommissionRate(actionPreview.targetImpact.oldCommissionRate)} →{" "}
                      {formatCommissionRate(actionPreview.targetImpact.newCommissionRate)}.
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Amount ${actionPreview.targetImpact.oldCommissionAmount} → $
                      {actionPreview.targetImpact.newCommissionAmount}.
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {actionPreview.affectedCount} open payout
                      {actionPreview.affectedCount === 1 ? "" : "s"} in this affiliate-month may be recalculated.
                    </p>
                  </div>
                ) : null}

                <div className="flex justify-end">
                  <Button
                    type="button"
                    className={adminPrimaryButtonClass}
                    disabled={!selectedPayoutId || loadingId === selectedPayoutId}
                    onClick={async () => {
                      if (!selectedPayoutId) return;
                      await handleAction(selectedPayoutId, "approve");
                      setPreviewOpen(false);
                    }}
                  >
                    {loadingId === selectedPayoutId ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    Confirm approval
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Preview unavailable for this payout.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={markPaidOpen} onOpenChange={setMarkPaidOpen}>
        <DialogContent className="rounded-none border-border bg-background p-0 shadow-[0_18px_56px_rgba(15,23,42,0.12)]">
          <DialogHeader className="border-b border-border px-3 py-2.5">
            <DialogTitle className="tracking-[-0.04em] text-foreground">
              Mark payout as paid
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (selectedPayoutId && txHashInput.trim()) {
                handleAction(selectedPayoutId, "mark_paid", {
                  txHash: txHashInput.trim(),
                });
                setMarkPaidOpen(false);
              }
            }}
            className="space-y-2.5 px-3 py-3"
          >
            {actionPreview ? (
              <div className="rounded-none border border-border bg-muted/30 px-2.5 py-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Commission snapshot
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {actionPreview.monthKey} • {actionPreview.summary.tierLabel} •{" "}
                  {formatCommissionRate(actionPreview.summary.effectiveRate)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {actionPreview.affectedCount} open payout
                  {actionPreview.affectedCount === 1 ? "" : "s"} may be recalculated before settlement.
                </p>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>Transaction hash</Label>
              <Input
                value={txHashInput}
                onChange={(event) => setTxHashInput(event.target.value)}
                placeholder="0x..."
                className={adminFieldClass}
                required
              />
            </div>
            <Button
              type="submit"
              className={`w-full ${adminPrimaryButtonClass}`}
            >
              Confirm payment
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="rounded-none border-border bg-background p-0 shadow-[0_18px_56px_rgba(15,23,42,0.12)]">
          <DialogHeader className="border-b border-border px-3 py-2.5">
            <DialogTitle className="tracking-[-0.04em] text-foreground">
              Reject payout
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (selectedPayoutId) {
                handleAction(selectedPayoutId, "reject", {
                  notes: notesInput.trim(),
                });
                setRejectOpen(false);
              }
            }}
            className="space-y-2.5 px-3 py-3"
          >
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input
                value={notesInput}
                onChange={(event) => setNotesInput(event.target.value)}
                placeholder="Reason for rejection..."
                className={adminFieldClass}
              />
            </div>
            <Button
              type="submit"
              variant="destructive"
              className="w-full rounded-none text-[10px] uppercase tracking-[0.14em]"
            >
              Reject payout
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
