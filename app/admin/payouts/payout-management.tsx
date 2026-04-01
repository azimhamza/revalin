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

  function openMarkPaid(id: string) {
    setSelectedPayoutId(id);
    setTxHashInput("");
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
    <div className="space-y-6">
      <AdminSectionHeader title="Payout queue" />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard label="Payout requests" value={counts.all} />
        <AdminStatCard label="Pending review" value={counts.pending} />
        <AdminStatCard label="Ready to send" value={counts.approved} />
        <AdminStatCard
          label="Paid volume"
          value={formatUsd(totals.paid)}
          tone="muted"
        />
      </div>

      <AdminPanel className="space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid gap-3 xl:w-full xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search order ID, Growth Partner code, wallet, provider, or tx hash"
              className={adminFieldClass}
            />

            <div className="grid gap-2 sm:grid-cols-5">
              {filterOptions.map((option) => {
                const active = filter === option.key;

                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setFilter(option.key)}
                    className={`flex h-10 items-center justify-between border px-3 text-left text-sm transition-colors ${
                      active
                        ? "border-[#0B2E2F] bg-[#0B2E2F] text-[#F4F1EA]"
                        : "border-[#0B2E2F]/12 bg-[#FCFAF6] text-[#0B2E2F] hover:bg-[#F1EADB]"
                    }`}
                  >
                    <span className="font-semibold">{option.label}</span>
                    <span
                      className={`text-xs ${active ? "text-[#F4F1EA]/62" : "text-[#0B2E2F]/48"}`}
                    >
                      {option.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="shrink-0 text-sm text-[#0B2E2F]/56">
            Showing{" "}
            <span className="font-semibold text-[#0B2E2F]">
              {filteredPayouts.length}
            </span>{" "}
            of {payouts.length}
          </div>
        </div>
      </AdminPanel>

      <AdminPanel className="overflow-hidden p-0">
        <div className="flex flex-col gap-2 border-b border-[#0B2E2F]/12 px-5 py-4 md:flex-row md:items-end md:justify-between">
          <h3 className="text-xl font-semibold tracking-[-0.05em] text-[#0B2E2F]">
            Approvals and payout state
          </h3>
        </div>

        <Table>
          <TableHeader className="bg-[#EFE7D8]">
            <TableRow className="border-b-[#0B2E2F]/10 hover:bg-transparent">
              <TableHead className="h-11 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0B2E2F]/48">
                Order
              </TableHead>
              <TableHead className="h-11 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0B2E2F]/48">
                Growth Partner
              </TableHead>
              <TableHead className="h-11 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0B2E2F]/48">
                Payout
              </TableHead>
              <TableHead className="h-11 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0B2E2F]/48">
                Provider
              </TableHead>
              <TableHead className="h-11 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0B2E2F]/48">
                Status
              </TableHead>
              <TableHead className="h-11 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0B2E2F]/48">
                Wallet
              </TableHead>
              <TableHead className="h-11 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0B2E2F]/48">
                Tx hash
              </TableHead>
              <TableHead className="h-11 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0B2E2F]/48">
                Updated
              </TableHead>
              <TableHead className="w-16 px-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPayouts.map((entry) => (
              <TableRow
                key={entry.id}
                className="border-b-[#0B2E2F]/10 bg-[#FCFAF6] transition-colors hover:bg-[#F1EADB]"
              >
                <TableCell className="px-5 py-4 align-top">
                  <div className="space-y-1">
                    <p className="font-mono text-xs text-[#0B2E2F]">
                      {entry.orderId}
                    </p>
                    <p className="text-sm text-[#0B2E2F]/56">
                      Created {new Date(entry.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="px-5 py-4 align-top">
                  <div className="space-y-1">
                    <p className="font-semibold text-[#0B2E2F]">
                      {entry.affiliateCode}
                    </p>
                    <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#0B2E2F]/34">
                      {entry.affiliateId}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="px-5 py-4 align-top text-sm text-[#0B2E2F]/62">
                  <p className="font-semibold text-[#0B2E2F]">
                    ${entry.commissionAmount} {entry.currencyCode}
                  </p>
                  <p className="mt-1">
                    Order ${entry.orderTotal} at{" "}
                    {(Number(entry.commissionRate) * 100).toFixed(1)}%
                  </p>
                </TableCell>
                <TableCell className="px-5 py-4 align-top text-xs uppercase tracking-[0.14em] text-[#0B2E2F]/48">
                  {entry.paymentProvider}
                </TableCell>
                <TableCell className="px-5 py-4 align-top">
                  <Badge
                    variant={statusBadgeVariant(entry.status)}
                    className="rounded-none capitalize"
                  >
                    {entry.status}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[180px] px-5 py-4 align-top font-mono text-xs text-[#0B2E2F]/48">
                  <span className="block truncate">{entry.walletAddress}</span>
                </TableCell>
                <TableCell className="max-w-[180px] px-5 py-4 align-top font-mono text-xs text-[#0B2E2F]/48">
                  <span className="block truncate">{entry.txHash || "-"}</span>
                  {entry.adminNotes ? (
                    <span className="mt-2 block text-[11px] leading-4 text-[#0B2E2F]/38">
                      {entry.adminNotes}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="px-5 py-4 align-top text-sm text-[#0B2E2F]/56">
                  {new Date(entry.updatedAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="px-5 py-4 align-top">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={loadingId === entry.id}
                        className="rounded-none border border-[#0B2E2F]/12 text-[#0B2E2F]/56 hover:bg-[#EFE7D8] hover:text-[#0B2E2F]"
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
                      className="rounded-none border-[#0B2E2F]/14 bg-[#FCFAF6] p-1"
                    >
                      {entry.status === "pending" ? (
                        <DropdownMenuItem
                          onClick={() => handleAction(entry.id, "approve")}
                          className="rounded-none px-3 py-2 focus:bg-[#EFE7D8]"
                        >
                          Approve
                        </DropdownMenuItem>
                      ) : null}
                      {entry.status === "approved" ? (
                        <DropdownMenuItem
                          onClick={() => openMarkPaid(entry.id)}
                          className="rounded-none px-3 py-2 focus:bg-[#EFE7D8]"
                        >
                          Mark as paid
                        </DropdownMenuItem>
                      ) : null}
                      {entry.status === "pending" ||
                      entry.status === "approved" ? (
                        <DropdownMenuItem
                          onClick={() => openReject(entry.id)}
                          className="rounded-none px-3 py-2 text-red-600 focus:bg-[#F6DDD8] focus:text-red-700"
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
              <TableRow className="border-b-0 bg-[#FCFAF6] hover:bg-[#FCFAF6]">
                <TableCell
                  colSpan={9}
                  className="px-5 py-10 text-center text-sm text-[#0B2E2F]/52"
                >
                  No payouts match the current search and status filter.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </AdminPanel>

      <Dialog open={markPaidOpen} onOpenChange={setMarkPaidOpen}>
        <DialogContent className="rounded-none border-[#0B2E2F]/16 bg-[#FCFAF6] p-0 shadow-[0_24px_80px_rgba(11,46,47,0.12)]">
          <DialogHeader className="border-b border-[#0B2E2F]/12 px-6 py-5">
            <DialogTitle className="tracking-[-0.04em] text-[#0B2E2F]">
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
            className="space-y-4 px-6 py-6"
          >
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
        <DialogContent className="rounded-none border-[#0B2E2F]/16 bg-[#FCFAF6] p-0 shadow-[0_24px_80px_rgba(11,46,47,0.12)]">
          <DialogHeader className="border-b border-[#0B2E2F]/12 px-6 py-5">
            <DialogTitle className="tracking-[-0.04em] text-[#0B2E2F]">
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
            className="space-y-4 px-6 py-6"
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
              className="w-full rounded-none"
            >
              Reject payout
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
