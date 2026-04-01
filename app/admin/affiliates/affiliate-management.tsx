"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Copy, Loader2, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  AdminPanel,
  AdminSectionHeader,
  AdminStatCard,
} from "../_components/admin-shell";

type AffiliateRow = {
  id: string;
  code: string;
  name: string;
  email: string;
  walletAddress: string;
  userId: string | null;
  swellCouponId: string | null;
  discountCode: string | null;
  discountPercent: string | null;
  commissionRate: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  createdAt: Date;
};

type AffiliateFilter =
  | "all"
  | "pending"
  | "approved"
  | "rejected"
  | "suspended";

type AssignmentFormState = {
  discountCode: string;
  discountPercent: string;
  commissionRate: string;
  sendApprovalEmail: boolean;
};

type AssignmentResult = {
  affiliateCode: string;
  discountCode: string | null;
  discountPercent: string | null;
  commissionRate: string;
  status: AffiliateRow["status"];
  referralLink: string;
  checkoutLink: string | null;
  emailSent: boolean;
  affiliateName: string;
  affiliateEmail: string;
};

function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "approved") return "default";
  if (status === "rejected" || status === "suspended") return "destructive";
  return "outline";
}

function formatDiscountSummary(entry: AffiliateRow) {
  if (!entry.discountCode && !entry.discountPercent) {
    return "Not assigned";
  }

  if (entry.discountCode && entry.discountPercent) {
    return `${entry.discountCode} • ${entry.discountPercent}% off`;
  }

  if (entry.discountCode) {
    return entry.discountCode;
  }

  return `${entry.discountPercent}% off`;
}

export function AffiliateManagement({
  affiliates,
}: {
  affiliates: AffiliateRow[];
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AffiliateFilter>("all");
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [selectedAffiliate, setSelectedAffiliate] =
    useState<AffiliateRow | null>(null);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentFormState>({
    discountCode: "",
    discountPercent: "",
    commissionRate: "0.05",
    sendApprovalEmail: true,
  });
  const [assignmentResult, setAssignmentResult] =
    useState<AssignmentResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      all: affiliates.length,
      pending: affiliates.filter((entry) => entry.status === "pending").length,
      approved: affiliates.filter((entry) => entry.status === "approved")
        .length,
      rejected: affiliates.filter((entry) => entry.status === "rejected")
        .length,
      suspended: affiliates.filter((entry) => entry.status === "suspended")
        .length,
      assignedCodes: affiliates.filter((entry) => Boolean(entry.discountCode))
        .length,
      linked: affiliates.filter((entry) => Boolean(entry.userId)).length,
    }),
    [affiliates],
  );

  const filteredAffiliates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return affiliates.filter((entry) => {
      if (filter !== "all" && entry.status !== filter) return false;
      if (!normalizedQuery) return true;

      return (
        entry.code.toLowerCase().includes(normalizedQuery) ||
        entry.name.toLowerCase().includes(normalizedQuery) ||
        entry.email.toLowerCase().includes(normalizedQuery) ||
        (entry.discountCode || "").toLowerCase().includes(normalizedQuery) ||
        entry.walletAddress.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [affiliates, filter, query]);

  const filterOptions: {
    key: AffiliateFilter;
    label: string;
    count: number;
  }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "pending", label: "Pending", count: counts.pending },
    { key: "approved", label: "Approved", count: counts.approved },
    { key: "suspended", label: "Suspended", count: counts.suspended },
    { key: "rejected", label: "Rejected", count: counts.rejected },
  ];

  function openAssignmentDialog(entry: AffiliateRow) {
    setSelectedAffiliate(entry);
    setAssignmentError(null);
    setAssignmentForm({
      discountCode: entry.discountCode || "",
      discountPercent: entry.discountPercent || "",
      commissionRate: entry.commissionRate,
      sendApprovalEmail: entry.status !== "approved",
    });
    setAssignmentOpen(true);
  }

  async function handleStatusChange(
    id: string,
    status: "pending" | "approved" | "rejected" | "suspended",
  ) {
    setLoadingId(id);

    try {
      const res = await fetch(`/api/admin/affiliates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to update Growth Partner.");
      }

      router.refresh();
    } catch (error) {
      console.error("Failed to update Growth Partner:", error);
    } finally {
      setLoadingId(null);
    }
  }

  async function handleAssignmentSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedAffiliate) return;

    setAssignmentLoading(true);
    setAssignmentError(null);

    try {
      const res = await fetch(`/api/admin/affiliates/${selectedAffiliate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "approved",
          discountCode: assignmentForm.discountCode,
          discountPercent: assignmentForm.discountPercent,
          commissionRate: assignmentForm.commissionRate,
          sendApprovalEmail: assignmentForm.sendApprovalEmail,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save affiliate assignment.");
      }

      setAssignmentOpen(false);
      setAssignmentResult({
        affiliateCode: data.assignment.affiliateCode,
        discountCode: data.assignment.discountCode,
        discountPercent: data.assignment.discountPercent,
        commissionRate: data.assignment.commissionRate,
        status: data.assignment.status,
        referralLink: data.assignment.referralLink,
        checkoutLink: data.assignment.checkoutLink,
        emailSent: Boolean(data.assignment.emailSent),
        affiliateName: selectedAffiliate.name,
        affiliateEmail: selectedAffiliate.email,
      });
      setResultOpen(true);
      router.refresh();
    } catch (error) {
      setAssignmentError(
        error instanceof Error ? error.message : "Failed to save assignment.",
      );
    } finally {
      setAssignmentLoading(false);
    }
  }

  async function copyValue(field: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => {
        setCopiedField((current) => (current === field ? null : current));
      }, 1600);
    } catch (error) {
      console.error(`Failed to copy ${field}:`, error);
    }
  }

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        eyebrow="Growth Partners"
        title="Approval and code assignment"
        description="Applicants become active only after an admin assigns a Swell discount code, sets the customer discount, and approves the record. The branded subroute keeps attribution tied to the referral slug."
      />

      <Dialog open={assignmentOpen} onOpenChange={setAssignmentOpen}>
        <DialogContent className="rounded-none border-[#0B2E2F]/16 bg-[#FCFAF6] p-0 shadow-[0_24px_80px_rgba(11,46,47,0.12)]">
          <DialogHeader className="border-b border-[#0B2E2F]/12 px-6 py-5">
            <DialogTitle className="tracking-[-0.04em] text-[#0B2E2F]">
              {selectedAffiliate?.status === "approved"
                ? "Update Swell code assignment"
                : "Approve and assign Swell code"}
            </DialogTitle>
            <DialogDescription className="pt-2 text-[#0B2E2F]/68">
              Assign or update the Swell discount code, customer discount
              percent, and notification email from one place.
            </DialogDescription>
          </DialogHeader>

          {selectedAffiliate ? (
            <form
              onSubmit={handleAssignmentSubmit}
              className="space-y-4 px-6 py-6"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Affiliate</Label>
                  <Input
                    value={selectedAffiliate.name}
                    disabled
                    className={adminFieldClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    value={selectedAffiliate.email}
                    disabled
                    className={adminFieldClass}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Referral slug</Label>
                  <Input
                    value={selectedAffiliate.code}
                    disabled
                    className={adminFieldClass}
                  />
                  <p className="text-xs text-[#0B2E2F]/56">
                    This powers the branded subroute:{" "}
                    <span className="font-mono">
                      revalin.ca/{selectedAffiliate.code}
                    </span>
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Swell discount code</Label>
                  <Input
                    value={assignmentForm.discountCode}
                    onChange={(event) =>
                      setAssignmentForm((current) => ({
                        ...current,
                        discountCode: event.target.value.toUpperCase(),
                      }))
                    }
                    className={adminFieldClass}
                    placeholder="e.g. AZIM10"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Customer discount (%)</Label>
                  <Input
                    value={assignmentForm.discountPercent}
                    onChange={(event) =>
                      setAssignmentForm((current) => ({
                        ...current,
                        discountPercent: event.target.value,
                      }))
                    }
                    className={adminFieldClass}
                    placeholder="10"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Commission rate</Label>
                  <Input
                    value={assignmentForm.commissionRate}
                    onChange={(event) =>
                      setAssignmentForm((current) => ({
                        ...current,
                        commissionRate: event.target.value,
                      }))
                    }
                    className={adminFieldClass}
                    placeholder="0.05"
                    required
                  />
                </div>
              </div>

              <label className="flex items-start gap-3 rounded-none border border-[#0B2E2F]/12 bg-white/70 px-4 py-3 text-sm text-[#0B2E2F]/72">
                <input
                  type="checkbox"
                  checked={assignmentForm.sendApprovalEmail}
                  onChange={(event) =>
                    setAssignmentForm((current) => ({
                      ...current,
                      sendApprovalEmail: event.target.checked,
                    }))
                  }
                  className="mt-1 size-4 rounded-none border-[#0B2E2F]/30 text-[#0B2E2F] focus:ring-0"
                />
                <span>
                  Send the affiliate approval email with the Swell code, branded
                  referral link, and checkout link.
                </span>
              </label>

              {assignmentError ? (
                <p className="text-sm text-red-600">{assignmentError}</p>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className={adminSecondaryButtonClass}
                  onClick={() => setAssignmentOpen(false)}
                  disabled={assignmentLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className={adminPrimaryButtonClass}
                  disabled={assignmentLoading}
                >
                  {assignmentLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : selectedAffiliate.status === "approved" ? (
                    "Save code changes"
                  ) : (
                    "Approve and assign"
                  )}
                </Button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="rounded-none border-[#0B2E2F]/16 bg-[#FCFAF6] p-0 shadow-[0_24px_80px_rgba(11,46,47,0.12)]">
          <DialogHeader className="border-b border-[#0B2E2F]/12 px-6 py-5">
            <DialogTitle className="tracking-[-0.04em] text-[#0B2E2F]">
              Growth Partner assignment saved
            </DialogTitle>
            <DialogDescription className="pt-2 text-[#0B2E2F]/68">
              The branded route and Swell code are now connected.
            </DialogDescription>
          </DialogHeader>

          {assignmentResult ? (
            <div className="space-y-4 px-6 py-6">
              <div className="rounded-[20px] border border-[#0B2E2F]/10 bg-white/85 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/45">
                  Growth Partner
                </p>
                <p className="mt-1 font-semibold text-[#0B2E2F]">
                  {assignmentResult.affiliateName}
                </p>
                <p className="text-sm text-[#0B2E2F]/55">
                  {assignmentResult.affiliateEmail}
                </p>
              </div>

              <div className="space-y-3">
                <div className="rounded-[20px] border border-[#0B2E2F]/10 bg-white/85 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/45">
                        Swell discount code
                      </p>
                      <p className="mt-1 font-mono text-sm font-semibold text-[#0B2E2F]">
                        {assignmentResult.discountCode}
                      </p>
                      <p className="mt-1 text-xs text-[#0B2E2F]/58">
                        {assignmentResult.discountPercent || "0"}% customer
                        discount
                      </p>
                    </div>
                    {assignmentResult.discountCode ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          copyValue(
                            "discount-code",
                            assignmentResult.discountCode!,
                          )
                        }
                      >
                        {copiedField === "discount-code" ? (
                          <CheckCircle2 className="size-4" />
                        ) : (
                          <Copy className="size-4" />
                        )}
                        {copiedField === "discount-code" ? "Copied" : "Copy"}
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-[20px] border border-[#0B2E2F]/10 bg-white/85 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/45">
                        Branded referral link
                      </p>
                      <p className="mt-1 break-all font-mono text-sm font-semibold text-[#0B2E2F]">
                        {assignmentResult.referralLink}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        copyValue(
                          "referral-link",
                          assignmentResult.referralLink,
                        )
                      }
                    >
                      {copiedField === "referral-link" ? (
                        <CheckCircle2 className="size-4" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                      {copiedField === "referral-link" ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>

                {assignmentResult.checkoutLink ? (
                  <div className="rounded-[20px] border border-[#0B2E2F]/10 bg-white/85 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/45">
                          Direct checkout link
                        </p>
                        <p className="mt-1 break-all font-mono text-sm font-semibold text-[#0B2E2F]">
                          {assignmentResult.checkoutLink}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          copyValue(
                            "checkout-link",
                            assignmentResult.checkoutLink!,
                          )
                        }
                      >
                        {copiedField === "checkout-link" ? (
                          <CheckCircle2 className="size-4" />
                        ) : (
                          <Copy className="size-4" />
                        )}
                        {copiedField === "checkout-link" ? "Copied" : "Copy"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              <p className="text-sm leading-6 text-[#0B2E2F]/62">
                {assignmentResult.emailSent
                  ? "The approval email was sent with the current Swell code and links."
                  : "No email was sent for this save. The assignment is still active and the subroute will track incoming traffic."}
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard
          label="Applicants"
          value={counts.all}
          detail="All Growth Partner records currently in the system."
        />
        <AdminStatCard
          label="Pending approval"
          value={counts.pending}
          detail="Applicants waiting for a Swell code assignment and approval."
        />
        <AdminStatCard
          label="Approved"
          value={counts.approved}
          detail="Approved partners whose codes are active for tracking."
        />
        <AdminStatCard
          label="Codes assigned"
          value={counts.assignedCodes}
          detail="Affiliate records already connected to a Swell discount code."
        />
      </div>

      <AdminPanel className="space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid gap-3 xl:w-full xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search slug, name, email, Swell code, or wallet"
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
                    className={[
                      "rounded-none border px-3 py-2 text-left transition-colors",
                      active
                        ? "border-[#0B2E2F] bg-[#0B2E2F] text-[#F4F1EA]"
                        : "border-[#0B2E2F]/12 bg-[#FCFAF6] text-[#0B2E2F]/64 hover:bg-[#EFE7D8]",
                    ].join(" ")}
                  >
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.16em]">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-sm font-semibold">
                      {option.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="overflow-hidden border border-[#0B2E2F]/12 bg-[#FCFAF6]">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-[#0B2E2F]/10 hover:bg-transparent">
                <TableHead className="px-5 py-3 text-[10px] uppercase tracking-[0.16em] text-[#0B2E2F]/46">
                  Slug
                </TableHead>
                <TableHead className="px-5 py-3 text-[10px] uppercase tracking-[0.16em] text-[#0B2E2F]/46">
                  Applicant
                </TableHead>
                <TableHead className="px-5 py-3 text-[10px] uppercase tracking-[0.16em] text-[#0B2E2F]/46">
                  Status
                </TableHead>
                <TableHead className="px-5 py-3 text-[10px] uppercase tracking-[0.16em] text-[#0B2E2F]/46">
                  Swell code
                </TableHead>
                <TableHead className="px-5 py-3 text-[10px] uppercase tracking-[0.16em] text-[#0B2E2F]/46">
                  Commission
                </TableHead>
                <TableHead className="px-5 py-3 text-[10px] uppercase tracking-[0.16em] text-[#0B2E2F]/46">
                  Wallet
                </TableHead>
                <TableHead className="px-5 py-3 text-[10px] uppercase tracking-[0.16em] text-[#0B2E2F]/46">
                  Linked
                </TableHead>
                <TableHead className="px-5 py-3 text-[10px] uppercase tracking-[0.16em] text-[#0B2E2F]/46">
                  Created
                </TableHead>
                <TableHead className="w-16 px-5 py-3" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredAffiliates.map((entry) => (
                <TableRow
                  key={entry.id}
                  className="border-b border-[#0B2E2F]/8 bg-[#FCFAF6] hover:bg-[#F5EFE4]"
                >
                  <TableCell className="px-5 py-4 align-top">
                    <p className="font-mono text-sm font-semibold text-[#0B2E2F]">
                      {entry.code}
                    </p>
                  </TableCell>
                  <TableCell className="px-5 py-4 align-top">
                    <p className="text-sm font-semibold text-[#0B2E2F]">
                      {entry.name}
                    </p>
                    <p className="mt-1 text-sm text-[#0B2E2F]/58">
                      {entry.email}
                    </p>
                  </TableCell>
                  <TableCell className="px-5 py-4 align-top">
                    <Badge
                      variant={statusBadgeVariant(entry.status)}
                      className="rounded-none px-2.5 py-1 text-[10px] uppercase tracking-[0.14em]"
                    >
                      {entry.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-5 py-4 align-top">
                    <p className="text-sm font-semibold text-[#0B2E2F]">
                      {formatDiscountSummary(entry)}
                    </p>
                    {entry.swellCouponId ? (
                      <p className="mt-1 font-mono text-[11px] text-[#0B2E2F]/42">
                        Coupon {entry.swellCouponId}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="px-5 py-4 align-top text-sm text-[#0B2E2F]/58">
                    {(Number(entry.commissionRate) * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell className="max-w-[180px] px-5 py-4 align-top font-mono text-xs text-[#0B2E2F]/48">
                    <span className="block truncate">
                      {entry.walletAddress}
                    </span>
                  </TableCell>
                  <TableCell className="px-5 py-4 align-top text-sm text-[#0B2E2F]/56">
                    {entry.userId ? "Connected" : "Not linked"}
                  </TableCell>
                  <TableCell className="px-5 py-4 align-top text-sm text-[#0B2E2F]/56">
                    {new Date(entry.createdAt).toLocaleDateString()}
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
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="rounded-none border-[#0B2E2F]/14 bg-[#FCFAF6] p-1"
                      >
                        <DropdownMenuItem
                          onClick={() => openAssignmentDialog(entry)}
                          className="rounded-none px-3 py-2 focus:bg-[#EFE7D8]"
                        >
                          {entry.status === "approved"
                            ? "Manage code"
                            : "Approve and assign code"}
                        </DropdownMenuItem>
                        {entry.status !== "suspended" ? (
                          <DropdownMenuItem
                            onClick={() =>
                              handleStatusChange(entry.id, "suspended")
                            }
                            className="rounded-none px-3 py-2 focus:bg-[#EFE7D8]"
                          >
                            Suspend
                          </DropdownMenuItem>
                        ) : null}
                        {entry.status !== "rejected" ? (
                          <DropdownMenuItem
                            onClick={() =>
                              handleStatusChange(entry.id, "rejected")
                            }
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

              {filteredAffiliates.length === 0 ? (
                <TableRow className="border-b-0 bg-[#FCFAF6] hover:bg-[#FCFAF6]">
                  <TableCell
                    colSpan={9}
                    className="px-5 py-10 text-center text-sm text-[#0B2E2F]/52"
                  >
                    No Growth Partners match the current search and status
                    filter.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </AdminPanel>
    </div>
  );
}
