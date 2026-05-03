"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { getApiData, getApiErrorMessage, readJsonSafely } from "@/lib/api/client";
import type { PromoterOpenPanelTelemetry } from "@/lib/analytics/openpanel";
import {
  buildPayoutDestinationPreview,
  getPayoutMethodShortLabel,
  hasCompletePayoutDestination,
} from "@/lib/checkout/payout-methods";
import type {
  PromoterAffiliateCandidate,
  PromoterRecord,
} from "@/lib/checkout/promoter-service";
import type { AffiliateSocialProfile } from "@/lib/checkout/affiliate-social-profiles";
import {
  adminFieldClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  AdminPanel,
  AdminSectionHeader,
  AdminStatCard,
} from "../_components/admin-shell";

type AdminInviteRow = {
  invite: {
    id: string;
    promoterId: string;
    invitedAffiliateId: string | null;
    invitedName: string | null;
    invitedEmail: string;
    normalizedInvitedEmail: string;
    socialProfiles: AffiliateSocialProfile[];
    notes: string | null;
    referralCode: string | null;
    commissionRate: string | null;
    status: "invited" | "applied" | "successful" | "rejected" | "cancelled";
    inviteEmailSentAt: Date | string | null;
    inviteEmailError: string | null;
    createdAt: Date | string;
  };
  promoterName: string;
  promoterEmail: string;
  promoterCode: string;
  affiliateCode: string | null;
  affiliateName: string | null;
  affiliateEmail: string | null;
  affiliateStatus: "pending" | "approved" | "rejected" | "suspended" | null;
};

type DetailRange = "24h" | "7d" | "30d" | "all";

type PromoterPerformance = {
  range: DetailRange;
  rangeLabel: string;
  openPanelConfigured: boolean;
  salesSummary: {
    orderCount: number;
    revenue: number;
    commission: number;
    currentMonthCommission: number;
    currentYearCommission: number;
    currentMonthKey: string;
    currentYearKey: string;
    activePartners: number;
    invites: number;
    trackedVisits: number;
    trackedPurchases: number;
    trackedRevenue: number;
    trackedEvents: number;
  };
  sales: Array<{
    payoutId: string;
    orderId: string;
    affiliateCode: string;
    affiliateName: string;
    saleDate: string | Date;
    revenue: string;
    commission: string;
    commissionRate: string;
    status: string;
    currencyCode: string;
    paymentStatus: string | null;
    customerEmail: string | null;
    fulfillmentStatus: string | null;
  }>;
  partnerNames: Record<string, string>;
  telemetry: PromoterOpenPanelTelemetry | null;
};

function formatRate(value: string | null | undefined) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "-";
  return `${Number((numeric * 100).toFixed(2))}%`;
}

function formatRateForInput(value: string | null | undefined) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "2.5";
  return String(Number((numeric * 100).toFixed(2)));
}

function formatCurrency(value: string | number) {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusVariant(
  status: AdminInviteRow["invite"]["status"],
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "successful") return "default";
  if (status === "rejected" || status === "cancelled") return "destructive";
  if (status === "applied") return "secondary";
  return "outline";
}

function promoterStatusVariant(
  status: PromoterRecord["status"],
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "approved") return "default";
  if (status === "rejected" || status === "suspended") return "destructive";
  if (status === "pending") return "secondary";
  return "outline";
}

function formatSocialProfiles(profiles: AffiliateSocialProfile[]) {
  return profiles
    .filter((profile) => profile.platform.trim() && profile.url.trim())
    .map((profile) => `${profile.platform}: ${profile.url}`)
    .join(" | ");
}

// ── Review dialog for a single promoter ──────────────────────────

type ReviewDialogState = {
  promoter: PromoterRecord;
  code: string;
  rate: string;
  codeAvailability: "idle" | "checking" | "available" | "unavailable";
  sendApprovalEmail: boolean;
  sendLinkUpdateEmail: boolean;
  reinstatementReason: string;
  sendReinstatementEmail: boolean;
  removalReason: string;
  removalStatus: "suspended" | "rejected";
};

export function PromoterManagement({
  promoters,
  invites,
  initialOpenUserId,
  initialOpenPromoterId,
  canDelete = false,
}: {
  promoters: PromoterRecord[];
  invites: AdminInviteRow[];
  initialOpenUserId: string | null;
  initialOpenPromoterId: string | null;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [mappingInvite, setMappingInvite] = useState<AdminInviteRow | null>(null);
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidates, setCandidates] = useState<PromoterAffiliateCandidate[]>([]);
  const [selectedAffiliateId, setSelectedAffiliateId] = useState("");
  const [mappingRate, setMappingRate] = useState("2.5");
  const [mappingNotes, setMappingNotes] = useState("");
  const [mappingLoading, setMappingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [promoterSearch, setPromoterSearch] = useState("");
  const [promoterStatusFilter, setPromoterStatusFilter] = useState<"all" | "pending" | "approved" | "suspended" | "rejected">("all");
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteStatusFilter, setInviteStatusFilter] = useState<"all" | "invited" | "applied" | "successful" | "rejected" | "cancelled">("all");

  // ── Review dialog state ──
  const [reviewDialog, setReviewDialog] = useState<ReviewDialogState | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [detailRange, setDetailRange] = useState<DetailRange>("30d");
  const [detailLoading, setDetailLoading] = useState(false);
  const [promoterPerformance, setPromoterPerformance] =
    useState<PromoterPerformance | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const counts = useMemo(
    () => ({
      promoters: promoters.length,
      invites: invites.length,
      successful: invites.filter((entry) => entry.invite.status === "successful").length,
      payoutReady: promoters.filter((entry) =>
        hasCompletePayoutDestination({
          payoutMethod: entry.payoutMethod,
          walletAddress: entry.walletAddress,
          achAccountHolderName: entry.achAccountHolderName,
          achBankName: entry.achBankName,
          achAccountType: entry.achAccountType,
          achRoutingNumberLast4: entry.achRoutingNumberLast4,
          achAccountNumberLast4: entry.achAccountNumberLast4,
        }),
      ).length,
    }),
    [invites, promoters],
  );

  const filteredPromoters = useMemo(() => {
    let result = promoters;
    if (promoterStatusFilter !== "all") {
      result = result.filter((p) => p.status === promoterStatusFilter);
    }
    if (promoterSearch.trim()) {
      const q = promoterSearch.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          getPayoutMethodShortLabel(p.payoutMethod).toLowerCase().includes(q) ||
          (p.achBankName || "").toLowerCase().includes(q) ||
          (p.achAccountNumberLast4 || "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [promoters, promoterStatusFilter, promoterSearch]);

  const filteredInvites = useMemo(() => {
    let result = invites;
    if (inviteStatusFilter !== "all") {
      result = result.filter((entry) => entry.invite.status === inviteStatusFilter);
    }
    if (inviteSearch.trim()) {
      const q = inviteSearch.toLowerCase();
      result = result.filter(
        (entry) =>
          entry.invite.invitedEmail.toLowerCase().includes(q) ||
          (entry.invite.invitedName || "").toLowerCase().includes(q) ||
          entry.promoterName.toLowerCase().includes(q) ||
          entry.promoterEmail.toLowerCase().includes(q) ||
          (entry.affiliateCode || "").toLowerCase().includes(q) ||
          (entry.affiliateName || "").toLowerCase().includes(q) ||
          (entry.affiliateEmail || "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [invites, inviteStatusFilter, inviteSearch]);

  const selectedMappingCandidate = candidates.find(
    (candidate) => candidate.id === selectedAffiliateId,
  );
  const canActivatePromoterCommission =
    Boolean(selectedAffiliateId) && selectedMappingCandidate?.status === "approved";

  // ── Handle openUser query param ──
  useEffect(() => {
    if (!initialOpenUserId) return;

    let cancelled = false;
    setLoading(true);
    fetch("/api/admin/promoters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ensure_for_user",
        userId: initialOpenUserId,
        defaultCommissionRate: "2.5",
      }),
    })
      .then(async (response) => {
        const payload = await readJsonSafely(response);
        if (!response.ok) {
          throw new Error(getApiErrorMessage(payload, "Failed to create promoter."));
        }
        const data = getApiData<{ promoter: PromoterRecord | null }>(payload);
        if (!cancelled && data?.promoter) {
          router.refresh();
          // Auto-open the review dialog for the newly created promoter
          openReviewDialog(data.promoter);
        } else if (!cancelled) {
          router.refresh();
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Failed to create promoter.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenUserId]);

  // ── Handle openPromoter query param ──
  useEffect(() => {
    if (!initialOpenPromoterId) return;
    const found = promoters.find((p) => p.id === initialOpenPromoterId);
    if (found) {
      openReviewDialog(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenPromoterId]);

  function openReviewDialog(promoter: PromoterRecord) {
    setReviewDialog({
      promoter,
      code: promoter.code,
      rate: formatRateForInput(promoter.defaultCommissionRate),
      codeAvailability: "idle",
      sendApprovalEmail: true,
      sendLinkUpdateEmail: false,
      reinstatementReason: "",
      sendReinstatementEmail: true,
      removalReason: "",
      removalStatus: "suspended",
    });
    setReviewError(null);
    setDetailRange("30d");
    setPromoterPerformance(null);
  }

  function closeReviewDialog() {
    setReviewDialog(null);
    setReviewError(null);
    setPromoterPerformance(null);
    setShowDeleteConfirm(false);
  }

  useEffect(() => {
    if (!reviewDialog) return;

    let cancelled = false;
    setDetailLoading(true);
    fetch(
      `/api/admin/promoters/${reviewDialog.promoter.id}?range=${encodeURIComponent(
        detailRange,
      )}`,
    )
      .then(async (response) => {
        const payload = await readJsonSafely(response);
        const data = getApiData<{ performance?: PromoterPerformance | null }>(
          payload,
        );
        if (!response.ok) {
          throw new Error(
            getApiErrorMessage(payload, "Failed to load promoter detail."),
          );
        }
        if (!cancelled) {
          setPromoterPerformance(data?.performance ?? null);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setReviewError(
            caught instanceof Error
              ? caught.message
              : "Failed to load promoter detail.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detailRange, reviewDialog?.promoter.id]);

  async function handleDeletePromoter() {
    if (!reviewDialog) return;
    setReviewLoading(true);
    setReviewError(null);
    try {
      const response = await fetch(`/api/admin/promoters/${reviewDialog.promoter.id}`, {
        method: "DELETE",
      });
      const payload = await readJsonSafely(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to delete promoter."));
      }
      closeReviewDialog();
      router.refresh();
    } catch (caught) {
      setReviewError(caught instanceof Error ? caught.message : "Failed to delete promoter.");
    } finally {
      setReviewLoading(false);
    }
  }

  async function checkCodeAvailability() {
    if (!reviewDialog) return;
    setReviewDialog((s) => s ? { ...s, codeAvailability: "checking" } : s);
    try {
      const response = await fetch("/api/admin/promoters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "check_code_availability",
          code: reviewDialog.code,
          promoterId: reviewDialog.promoter.id,
        }),
      });
      const payload = await readJsonSafely(response);
      const data = getApiData<{ codeAvailable?: boolean }>(payload);
      setReviewDialog((s) =>
        s
          ? {
              ...s,
              codeAvailability: data?.codeAvailable ? "available" : "unavailable",
            }
          : s,
      );
    } catch {
      setReviewDialog((s) => s ? { ...s, codeAvailability: "unavailable" } : s);
    }
  }

  async function handleReviewApprove() {
    if (!reviewDialog) return;
    setReviewLoading(true);
    setReviewError(null);
    try {
      const response = await fetch("/api/admin/promoters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_status",
          promoterId: reviewDialog.promoter.id,
          status: "approved",
          code: reviewDialog.code !== reviewDialog.promoter.code ? reviewDialog.code : undefined,
          defaultCommissionRate: reviewDialog.rate,
          sendApprovalEmail: reviewDialog.sendApprovalEmail,
          sendReinstatementEmail: false,
        }),
      });
      const payload = await readJsonSafely(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to approve promoter."));
      }
      closeReviewDialog();
      router.refresh();
    } catch (caught) {
      setReviewError(caught instanceof Error ? caught.message : "Failed to approve promoter.");
    } finally {
      setReviewLoading(false);
    }
  }

  async function handleReviewSaveChanges() {
    if (!reviewDialog) return;
    setReviewLoading(true);
    setReviewError(null);
    try {
      const codeChanged = reviewDialog.code !== reviewDialog.promoter.code;
      const response = await fetch("/api/admin/promoters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_promoter",
          promoterId: reviewDialog.promoter.id,
          code: codeChanged ? reviewDialog.code : undefined,
          defaultCommissionRate: reviewDialog.rate,
          sendLinkUpdateEmail: codeChanged && reviewDialog.sendLinkUpdateEmail,
        }),
      });
      const payload = await readJsonSafely(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to update promoter."));
      }
      closeReviewDialog();
      router.refresh();
    } catch (caught) {
      setReviewError(caught instanceof Error ? caught.message : "Failed to update promoter.");
    } finally {
      setReviewLoading(false);
    }
  }

  async function handleReviewReject() {
    if (!reviewDialog) return;
    setReviewLoading(true);
    setReviewError(null);
    try {
      const response = await fetch("/api/admin/promoters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_status",
          promoterId: reviewDialog.promoter.id,
          status: reviewDialog.removalStatus,
          removalReason: reviewDialog.removalReason,
          sendRemovalEmail: true,
        }),
      });
      const payload = await readJsonSafely(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to update promoter."));
      }
      closeReviewDialog();
      router.refresh();
    } catch (caught) {
      setReviewError(caught instanceof Error ? caught.message : "Failed to update promoter.");
    } finally {
      setReviewLoading(false);
    }
  }

  async function handleReviewReinstate() {
    if (!reviewDialog) return;
    setReviewLoading(true);
    setReviewError(null);
    try {
      const response = await fetch("/api/admin/promoters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_status",
          promoterId: reviewDialog.promoter.id,
          status: "approved",
          reinstatementReason: reviewDialog.reinstatementReason,
          sendReinstatementEmail: reviewDialog.sendReinstatementEmail,
        }),
      });
      const payload = await readJsonSafely(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to reinstate promoter."));
      }
      closeReviewDialog();
      router.refresh();
    } catch (caught) {
      setReviewError(caught instanceof Error ? caught.message : "Failed to reinstate promoter.");
    } finally {
      setReviewLoading(false);
    }
  }

  async function openMapping(entry: AdminInviteRow) {
    setMappingInvite(entry);
    setCandidateQuery(entry.invite.invitedEmail);
    setSelectedAffiliateId(entry.invite.invitedAffiliateId || "");
    setMappingRate(entry.invite.commissionRate ? formatRate(entry.invite.commissionRate).replace("%", "") : "2.5");
    setMappingNotes(entry.invite.notes || "");
    await loadCandidates(entry.invite.id, entry.invite.invitedEmail);
  }

  async function loadCandidates(inviteId = mappingInvite?.invite.id, q = candidateQuery) {
    if (!inviteId) return;
    setMappingLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/promoter-invites/${inviteId}?q=${encodeURIComponent(q)}`,
      );
      const payload = await readJsonSafely(response);
      const data = getApiData<{
        candidates: PromoterAffiliateCandidate[];
      }>(payload);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to search Growth Partners."));
      }
      setCandidates(data?.candidates ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to search Growth Partners.");
    } finally {
      setMappingLoading(false);
    }
  }

  async function markSuccessful() {
    if (!mappingInvite || !selectedAffiliateId) return;
    const selectedCandidate = candidates.find(
      (candidate) => candidate.id === selectedAffiliateId,
    );
    if (selectedCandidate?.status !== "approved") {
      setError("Approve the Growth Partner before activating promoter commission.");
      return;
    }
    setMappingLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/admin/promoter-invites/${mappingInvite.invite.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "mark_successful",
            affiliateId: selectedAffiliateId,
            commissionRate: mappingRate,
            notes: mappingNotes,
          }),
        },
      );
      const payload = await readJsonSafely(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to mark invite successful."));
      }
      setMappingInvite(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to mark invite successful.");
    } finally {
      setMappingLoading(false);
    }
  }

  async function resendInvite(inviteId: string) {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/promoter-invites/${inviteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend_email" }),
      });
      const payload = await readJsonSafely(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to resend invite."));
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to resend invite.");
    } finally {
      setLoading(false);
    }
  }

  const codeChanged = reviewDialog ? reviewDialog.code !== reviewDialog.promoter.code : false;

  return (
    <div className="space-y-4">
      <AdminSectionHeader
        title="Promoter management"
        description="Invite Growth Partners through promoters, track application attribution, and activate promoter commission after the Growth Partner is approved."
      />

      <div className="grid gap-3 md:grid-cols-4">
        <AdminStatCard label="Promoters" value={counts.promoters} size="compact" />
        <AdminStatCard label="Invites" value={counts.invites} size="compact" />
        <AdminStatCard label="Active commissions" value={counts.successful} size="compact" />
        <AdminStatCard label="Payouts ready" value={counts.payoutReady} size="compact" />
      </div>

      {error ? (
        <AdminPanel tone="muted">
          <p className="text-xs text-red-700">{error}</p>
        </AdminPanel>
      ) : null}
      {notice ? (
        <AdminPanel tone="muted">
          <p className="text-xs text-emerald-700">{notice}</p>
        </AdminPanel>
      ) : null}

      {/* ── Promoters table ── */}
      <AdminPanel className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={promoterSearch}
              onChange={(e) => setPromoterSearch(e.target.value)}
              className={`${adminFieldClass} pl-8`}
              placeholder="Search promoters by name, email, code, or payout destination"
            />
          </div>
          <select
            value={promoterStatusFilter}
            onChange={(e) => setPromoterStatusFilter(e.target.value as typeof promoterStatusFilter)}
            className={adminFieldClass}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="suspended">Suspended</option>
            <option value="rejected">Rejected</option>
          </select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => router.refresh()}
            title="Refresh data"
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
        <div className="overflow-hidden rounded-none border border-border -mx-3 -mb-3 sm:-mx-4 sm:-mb-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Promoter</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Default rate</TableHead>
              <TableHead>Payout</TableHead>
              <TableHead className="w-[120px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPromoters.map((promoter) => {
              const payoutPreview = buildPayoutDestinationPreview({
                payoutMethod: promoter.payoutMethod,
                walletAddress: promoter.walletAddress,
                achAccountHolderName: promoter.achAccountHolderName,
                achBankName: promoter.achBankName,
                achAccountType: promoter.achAccountType,
                achRoutingNumberLast4: promoter.achRoutingNumberLast4,
                achAccountNumberLast4: promoter.achAccountNumberLast4,
              });
              const payoutReady = hasCompletePayoutDestination({
                payoutMethod: promoter.payoutMethod,
                walletAddress: promoter.walletAddress,
                achAccountHolderName: promoter.achAccountHolderName,
                achBankName: promoter.achBankName,
                achAccountType: promoter.achAccountType,
                achRoutingNumberLast4: promoter.achRoutingNumberLast4,
                achAccountNumberLast4: promoter.achAccountNumberLast4,
              });

              return (
              <TableRow key={promoter.id}>
                <TableCell>
                  <p className="text-xs font-semibold text-foreground">{promoter.name}</p>
                  <p className="text-[11px] text-muted-foreground">{promoter.email}</p>
                </TableCell>
                <TableCell>
                  <Badge variant={promoterStatusVariant(promoter.status)}>
                    {promoter.status}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {promoter.code}
                </TableCell>
                <TableCell className="text-xs">
                  {formatRate(promoter.defaultCommissionRate)}
                </TableCell>
                <TableCell className="text-[11px] text-muted-foreground">
                  <p className="font-semibold text-foreground">
                    {getPayoutMethodShortLabel(promoter.payoutMethod)}
                  </p>
                  <p className="mt-1">{payoutPreview.title}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {payoutPreview.subtitle || (payoutReady ? "Ready" : "Missing details")}
                  </p>
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="outline"
                    className={adminSecondaryButtonClass}
                    onClick={() => openReviewDialog(promoter)}
                  >
                    Review
                  </Button>
                </TableCell>
              </TableRow>
            )})}
            {filteredPromoters.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                  {promoterSearch || promoterStatusFilter !== "all" ? "No promoters match your filters." : "No promoters yet."}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        </div>
      </AdminPanel>

      {/* ── Invites table ── */}
      <AdminPanel className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={inviteSearch}
              onChange={(e) => setInviteSearch(e.target.value)}
              className={`${adminFieldClass} pl-8`}
              placeholder="Search invites by name, email, or Growth Partner"
            />
          </div>
          <select
            value={inviteStatusFilter}
            onChange={(e) => setInviteStatusFilter(e.target.value as typeof inviteStatusFilter)}
            className={adminFieldClass}
          >
            <option value="all">All statuses</option>
            <option value="invited">Invited</option>
            <option value="applied">Applied</option>
            <option value="successful">Successful</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div className="overflow-hidden rounded-none border border-border -mx-3 -mb-3 sm:-mx-4 sm:-mb-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invite</TableHead>
              <TableHead>Promoter</TableHead>
              <TableHead>Growth Partner application</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-[220px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredInvites.map((entry) => (
              <TableRow key={entry.invite.id}>
                <TableCell>
                  <p className="text-xs font-semibold text-foreground">
                    {entry.invite.invitedName || entry.invite.invitedEmail}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {entry.invite.invitedEmail}
                  </p>
                  {entry.invite.referralCode ? (
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {entry.invite.referralCode}
                    </p>
                  ) : null}
                  {formatSocialProfiles(entry.invite.socialProfiles).length ? (
                    <p className="text-[11px] text-muted-foreground">
                      {formatSocialProfiles(entry.invite.socialProfiles)}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell>
                  <p className="text-xs font-semibold text-foreground">{entry.promoterName}</p>
                  <p className="text-[11px] text-muted-foreground">{entry.promoterEmail}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{entry.promoterCode}</p>
                </TableCell>
                <TableCell>
                  {entry.affiliateCode ? (
                    <>
                      <p className="text-xs font-semibold text-foreground">{entry.affiliateCode}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {entry.affiliateName || entry.affiliateEmail}
                      </p>
                      {entry.affiliateStatus ? (
                        <p className="text-[11px] text-muted-foreground">
                          Growth Partner {entry.affiliateStatus}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Not mapped</span>
                  )}
                </TableCell>
                <TableCell className="text-xs">{formatRate(entry.invite.commissionRate)}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(entry.invite.status)}>
                    {entry.invite.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-[11px] text-muted-foreground">
                  {entry.invite.inviteEmailSentAt ? (
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="size-3.5" />
                      Sent
                    </span>
                  ) : entry.invite.inviteEmailError ? (
                    "Failed"
                  ) : (
                    "Not sent"
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className={adminSecondaryButtonClass}
                      onClick={() => openMapping(entry)}
                    >
                      {entry.invite.status === "successful"
                        ? "Edit commission"
                        : "Activate commission"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={adminSecondaryButtonClass}
                      onClick={() => resendInvite(entry.invite.id)}
                    >
                      Resend
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filteredInvites.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-xs text-muted-foreground">
                  {inviteSearch || inviteStatusFilter !== "all" ? "No invites match your filters." : "No promoter invites yet."}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        </div>
      </AdminPanel>

      {/* ── Activate commission dialog (unchanged) ── */}
      <Dialog open={Boolean(mappingInvite)} onOpenChange={(open) => !open && setMappingInvite(null)}>
        <DialogContent className="max-w-2xl rounded-none">
          <DialogHeader>
            <DialogTitle>Activate promoter commission</DialogTitle>
          </DialogHeader>
          {mappingInvite ? (
            <div className="space-y-4">
              <div className="rounded-none border border-border bg-muted/40 px-3 py-2 text-xs">
                <p className="font-semibold text-foreground">
                  {mappingInvite.invite.invitedName || mappingInvite.invite.invitedEmail}
                </p>
                <p className="text-muted-foreground">
                  Invited by {mappingInvite.promoterName} ({mappingInvite.promoterEmail})
                </p>
                <p className="mt-1 text-muted-foreground">
                  Approve the Growth Partner first. This step only activates promoter commission for future orders.
                </p>
                {formatSocialProfiles(mappingInvite.invite.socialProfiles).length ? (
                  <p className="mt-1 text-muted-foreground">
                    {formatSocialProfiles(mappingInvite.invite.socialProfiles)}
                  </p>
                ) : null}
                {mappingInvite.invite.notes ? (
                  <p className="mt-1 text-muted-foreground">{mappingInvite.invite.notes}</p>
                ) : null}
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input
                  value={candidateQuery}
                  onChange={(event) => setCandidateQuery(event.target.value)}
                  className={adminFieldClass}
                  placeholder="Search Growth Partner signup by email, name, code, or social URL"
                />
                <Button
                  type="button"
                  variant="outline"
                  className={adminSecondaryButtonClass}
                  onClick={() => loadCandidates()}
                  disabled={mappingLoading}
                >
                  <Search className="size-4" />
                  Search
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Growth Partner application</Label>
                <select
                  value={selectedAffiliateId}
                  onChange={(event) => setSelectedAffiliateId(event.target.value)}
                  className={adminFieldClass}
                >
                  <option value="">Select a Growth Partner record</option>
                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.code} - {candidate.name} - {candidate.email} ({candidate.status})
                    </option>
                  ))}
                </select>
                {selectedMappingCandidate ? (
                  selectedMappingCandidate.status === "approved" ? (
                    <p className="text-xs text-emerald-700">
                      Growth Partner approved. Promoter commission can be activated.
                    </p>
                  ) : (
                    <div className="rounded-none border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <p>
                        Growth Partner is {selectedMappingCandidate.status}. Approve the Growth Partner before activating promoter commission.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className={`${adminSecondaryButtonClass} mt-2 bg-white`}
                        onClick={() =>
                          router.push(
                            `/admin/affiliates?openAffiliate=${selectedMappingCandidate.id}`,
                          )
                        }
                      >
                        Open Growth Partner approval
                      </Button>
                    </div>
                  )
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Promoter commission percent</Label>
                  <Input
                    value={mappingRate}
                    onChange={(event) => setMappingRate(event.target.value)}
                    className={adminFieldClass}
                    placeholder="2.5"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Input
                    value={mappingNotes}
                    onChange={(event) => setMappingNotes(event.target.value)}
                    className={adminFieldClass}
                    placeholder="Why this referral is successful"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className={adminSecondaryButtonClass}
                  onClick={() => setMappingInvite(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className={adminPrimaryButtonClass}
                  disabled={
                    mappingLoading ||
                    !canActivatePromoterCommission ||
                    !mappingRate.trim()
                  }
                  onClick={markSuccessful}
                >
                  {mappingLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                  Activate commission
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── Promoter review dialog ── */}
      <Dialog open={Boolean(reviewDialog)} onOpenChange={(open) => !open && closeReviewDialog()}>
        <DialogContent className="max-h-[86vh] max-w-5xl overflow-y-auto rounded-none">
          <DialogHeader>
            <DialogTitle>Review promoter</DialogTitle>
          </DialogHeader>
          {reviewDialog ? (
            <div className="space-y-5">
              {/* Header: name, email, status */}
              <div className="rounded-none border border-border bg-muted/40 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {reviewDialog.promoter.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {reviewDialog.promoter.email}
                    </p>
                  </div>
                  <Badge variant={promoterStatusVariant(reviewDialog.promoter.status)}>
                    {reviewDialog.promoter.status}
                  </Badge>
                </div>

                {/* Social profiles */}
                {reviewDialog.promoter.socialProfiles.length > 0 ? (
                  <div className="mt-3 space-y-1 border-t border-border pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Social profiles
                    </p>
                    {reviewDialog.promoter.socialProfiles.map((profile, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        <span className="font-medium text-foreground">{profile.platform}</span>
                        <a
                          href={profile.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 underline underline-offset-2"
                        >
                          {profile.url}
                          <ExternalLink className="size-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
                    No social profiles submitted.
                  </p>
                )}
              </div>

              {reviewError ? (
                <div className="rounded-none border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {reviewError}
                </div>
              ) : null}

              {/* Code & Rate section */}
              <div className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Code &amp; Rate
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Promoter code</Label>
                    <div className="flex gap-2">
                      <Input
                        value={reviewDialog.code}
                        onChange={(e) =>
                          setReviewDialog((s) =>
                            s
                              ? { ...s, code: e.target.value, codeAvailability: "idle" }
                              : s,
                          )
                        }
                        className={adminFieldClass}
                        placeholder="promoter-code"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className={adminSecondaryButtonClass}
                        disabled={!reviewDialog.code.trim() || reviewDialog.codeAvailability === "checking"}
                        onClick={checkCodeAvailability}
                      >
                        {reviewDialog.codeAvailability === "checking" ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          "Check"
                        )}
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      revalin.ca/grow/{reviewDialog.code || "..."}
                    </p>
                    {reviewDialog.codeAvailability === "available" ? (
                      <p className="text-xs text-emerald-700">Code is available.</p>
                    ) : reviewDialog.codeAvailability === "unavailable" ? (
                      <p className="text-xs text-red-700">Code is not available.</p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Default commission %</Label>
                    <Input
                      value={reviewDialog.rate}
                      onChange={(e) =>
                        setReviewDialog((s) =>
                          s ? { ...s, rate: e.target.value } : s,
                        )
                      }
                      className={adminFieldClass}
                      placeholder="2.5"
                    />
                  </div>
                </div>
              </div>

              {/* Sales and attribution detail */}
              <div className="space-y-3 border-t border-border pt-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Sales &amp; OpenPanel
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Revenue, commission, and attribution across this promoter's recruited Growth Partners.
                    </p>
                  </div>
                  <div className="w-full max-w-[180px] space-y-1.5">
                    <Label>Time frame</Label>
                    <select
                      value={detailRange}
                      onChange={(event) =>
                        setDetailRange(event.target.value as DetailRange)
                      }
                      className={adminFieldClass}
                    >
                      <option value="24h">1 day</option>
                      <option value="7d">1 week</option>
                      <option value="30d">1 month</option>
                      <option value="all">All time</option>
                    </select>
                  </div>
                </div>

                {detailLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading promoter detail...
                  </div>
                ) : promoterPerformance ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-none border border-border bg-muted/40 px-2.5 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Sales
                        </p>
                        <p className="mt-1.5 text-sm font-semibold text-foreground">
                          {promoterPerformance.salesSummary.orderCount}
                        </p>
                      </div>
                      <div className="rounded-none border border-border bg-muted/40 px-2.5 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Revenue
                        </p>
                        <p className="mt-1.5 text-sm font-semibold text-foreground">
                          {formatCurrency(promoterPerformance.salesSummary.revenue)}
                        </p>
                      </div>
                      <div className="rounded-none border border-border bg-muted/40 px-2.5 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Promoter commission
                        </p>
                        <p className="mt-1.5 text-sm font-semibold text-foreground">
                          {formatCurrency(promoterPerformance.salesSummary.commission)}
                        </p>
                      </div>
                      <div className="rounded-none border border-border bg-muted/40 px-2.5 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Active partners
                        </p>
                        <p className="mt-1.5 text-sm font-semibold text-foreground">
                          {promoterPerformance.salesSummary.activePartners}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-none border border-border bg-background px-2.5 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Monthly commission
                        </p>
                        <p className="mt-1.5 text-sm font-semibold text-foreground">
                          {formatCurrency(
                            promoterPerformance.salesSummary.currentMonthCommission,
                          )}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {promoterPerformance.salesSummary.currentMonthKey}
                        </p>
                      </div>
                      <div className="rounded-none border border-border bg-background px-2.5 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Annual commission
                        </p>
                        <p className="mt-1.5 text-sm font-semibold text-foreground">
                          {formatCurrency(
                            promoterPerformance.salesSummary.currentYearCommission,
                          )}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {promoterPerformance.salesSummary.currentYearKey}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-none border border-border bg-background px-2.5 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Tracked visits
                        </p>
                        <p className="mt-1.5 text-sm font-semibold text-foreground">
                          {promoterPerformance.salesSummary.trackedVisits}
                        </p>
                      </div>
                      <div className="rounded-none border border-border bg-background px-2.5 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Purchases
                        </p>
                        <p className="mt-1.5 text-sm font-semibold text-foreground">
                          {promoterPerformance.salesSummary.trackedPurchases}
                        </p>
                      </div>
                      <div className="rounded-none border border-border bg-background px-2.5 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Tracked revenue
                        </p>
                        <p className="mt-1.5 text-sm font-semibold text-foreground">
                          {formatCurrency(promoterPerformance.salesSummary.trackedRevenue)}
                        </p>
                      </div>
                      <div className="rounded-none border border-border bg-background px-2.5 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Events
                        </p>
                        <p className="mt-1.5 text-sm font-semibold text-foreground">
                          {promoterPerformance.salesSummary.trackedEvents}
                        </p>
                      </div>
                    </div>

                    {!promoterPerformance.openPanelConfigured ? (
                      <div className="rounded-none border border-dashed border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
                        OpenPanel read credentials are not configured.
                      </div>
                    ) : null}

                    <div className="overflow-hidden border border-border bg-background">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Sale</TableHead>
                            <TableHead>Growth Partner</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Revenue</TableHead>
                            <TableHead>Commission</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {promoterPerformance.sales.map((sale) => (
                            <TableRow key={sale.payoutId}>
                              <TableCell className="py-2 text-xs">
                                <p className="font-semibold text-foreground">
                                  {sale.orderId}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {formatDateTime(sale.saleDate)}
                                </p>
                              </TableCell>
                              <TableCell className="py-2 text-xs">
                                <p className="font-semibold text-foreground">
                                  {sale.affiliateName || sale.affiliateCode}
                                </p>
                                <p className="font-mono text-[11px] text-muted-foreground">
                                  {sale.affiliateCode}
                                </p>
                              </TableCell>
                              <TableCell className="py-2 text-xs text-muted-foreground">
                                {sale.customerEmail || "-"}
                              </TableCell>
                              <TableCell className="py-2 text-xs font-semibold text-foreground">
                                {formatCurrency(sale.revenue)}
                              </TableCell>
                              <TableCell className="py-2 text-xs text-muted-foreground">
                                {formatCurrency(sale.commission)}
                              </TableCell>
                              <TableCell className="py-2">
                                <Badge variant="outline" className="rounded-none">
                                  {sale.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                          {promoterPerformance.sales.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={6}
                                className="py-8 text-center text-xs text-muted-foreground"
                              >
                                No promoter-attributed sales in this time frame.
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      {[
                        ["Partner breakdown", promoterPerformance.telemetry?.partnerBreakdown ?? []],
                        ["Referrers", promoterPerformance.telemetry?.referrers ?? []],
                        ["Landing paths", promoterPerformance.telemetry?.landingPaths ?? []],
                        ["Devices", promoterPerformance.telemetry?.devices ?? []],
                      ].map(([title, items]) => (
                        <div
                          key={String(title)}
                          className="rounded-none border border-border bg-muted/30 px-3 py-3"
                        >
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            {String(title)}
                          </p>
                          {(items as Array<{ name?: string; affiliateCode?: string; value?: number; revenue?: number; purchases?: number; visits?: number }>).length > 0 ? (
                            <div className="mt-2 space-y-1.5">
                              {(items as Array<{ name?: string; affiliateCode?: string; value?: number; revenue?: number; purchases?: number; visits?: number }>).slice(0, 6).map((item) => {
                                const label =
                                  item.name ||
                                  item.affiliateCode ||
                                  "Unknown";
                                const value =
                                  item.value ??
                                  item.revenue ??
                                  item.purchases ??
                                  item.visits ??
                                  0;

                                return (
                                  <div
                                    key={label}
                                    className="flex items-center justify-between gap-3 text-xs"
                                  >
                                    <span className="truncate text-muted-foreground">
                                      {label}
                                    </span>
                                    <span className="font-semibold text-foreground">
                                      {typeof item.revenue === "number"
                                        ? formatCurrency(value)
                                        : value}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="mt-2 text-xs text-muted-foreground">
                              No data returned.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Actions section — varies by status */}
              <div className="space-y-3 border-t border-border pt-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Actions
                </p>

                {reviewDialog.promoter.status === "pending" ? (
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={reviewDialog.sendApprovalEmail}
                        onChange={(e) =>
                          setReviewDialog((s) =>
                            s ? { ...s, sendApprovalEmail: e.target.checked } : s,
                          )
                        }
                      />
                      Send approval email
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        className={adminPrimaryButtonClass}
                        disabled={reviewLoading || !reviewDialog.code.trim() || !reviewDialog.rate.trim()}
                        onClick={handleReviewApprove}
                      >
                        {reviewLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={adminSecondaryButtonClass}
                        disabled={reviewLoading}
                        onClick={() =>
                          setReviewDialog((s) =>
                            s ? { ...s, removalStatus: "rejected" } : s,
                          )
                        }
                      >
                        Reject
                      </Button>
                    </div>
                    {reviewDialog.removalStatus === "rejected" ? (
                      <div className="space-y-2 rounded-none border border-border bg-muted/40 p-3">
                        <div className="space-y-1.5">
                          <Label>Rejection reason</Label>
                          <Input
                            value={reviewDialog.removalReason}
                            onChange={(e) =>
                              setReviewDialog((s) =>
                                s ? { ...s, removalReason: e.target.value } : s,
                              )
                            }
                            className={adminFieldClass}
                            placeholder="Explain why the application is being rejected"
                          />
                        </div>
                        <Button
                          type="button"
                          className={adminPrimaryButtonClass}
                          disabled={reviewLoading || !reviewDialog.removalReason.trim()}
                          onClick={handleReviewReject}
                        >
                          {reviewLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                          Reject and email
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : reviewDialog.promoter.status === "approved" ? (
                  <div className="space-y-3">
                    {codeChanged ? (
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={reviewDialog.sendLinkUpdateEmail}
                          onChange={(e) =>
                            setReviewDialog((s) =>
                              s ? { ...s, sendLinkUpdateEmail: e.target.checked } : s,
                            )
                          }
                        />
                        Send link update email (code changed)
                      </label>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        className={adminPrimaryButtonClass}
                        disabled={reviewLoading || !reviewDialog.code.trim() || !reviewDialog.rate.trim()}
                        onClick={handleReviewSaveChanges}
                      >
                        {reviewLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                        Save changes
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={adminSecondaryButtonClass}
                        disabled={reviewLoading}
                        onClick={() =>
                          setReviewDialog((s) =>
                            s ? { ...s, removalStatus: "suspended" } : s,
                          )
                        }
                      >
                        Suspend
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={adminSecondaryButtonClass}
                        disabled={reviewLoading}
                        onClick={() =>
                          setReviewDialog((s) =>
                            s ? { ...s, removalStatus: "rejected" } : s,
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                    {(reviewDialog.removalStatus === "suspended" || reviewDialog.removalStatus === "rejected") &&
                    reviewDialog.promoter.status === "approved" ? (
                      <div className="space-y-2 rounded-none border border-border bg-muted/40 p-3">
                        <div className="space-y-1.5">
                          <Label>
                            {reviewDialog.removalStatus === "suspended"
                              ? "Suspension reason"
                              : "Removal reason"}
                          </Label>
                          <Input
                            value={reviewDialog.removalReason}
                            onChange={(e) =>
                              setReviewDialog((s) =>
                                s ? { ...s, removalReason: e.target.value } : s,
                              )
                            }
                            className={adminFieldClass}
                            placeholder={
                              reviewDialog.removalStatus === "suspended"
                                ? "Explain why promoter access is being suspended"
                                : "Explain why promoter access is being removed"
                            }
                          />
                        </div>
                        <Button
                          type="button"
                          className={adminPrimaryButtonClass}
                          disabled={reviewLoading || !reviewDialog.removalReason.trim()}
                          onClick={handleReviewReject}
                        >
                          {reviewLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                          {reviewDialog.removalStatus === "suspended"
                            ? "Suspend and email"
                            : "Remove and email"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  /* suspended or rejected */
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Reinstatement reason</Label>
                      <Input
                        value={reviewDialog.reinstatementReason}
                        onChange={(e) =>
                          setReviewDialog((s) =>
                            s ? { ...s, reinstatementReason: e.target.value } : s,
                          )
                        }
                        className={adminFieldClass}
                        placeholder="Explain why promoter access is being reinstated"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={reviewDialog.sendReinstatementEmail}
                        onChange={(e) =>
                          setReviewDialog((s) =>
                            s ? { ...s, sendReinstatementEmail: e.target.checked } : s,
                          )
                        }
                      />
                      Send reinstatement email
                    </label>
                    <Button
                      type="button"
                      className={adminPrimaryButtonClass}
                      disabled={reviewLoading || !reviewDialog.reinstatementReason.trim()}
                      onClick={handleReviewReinstate}
                    >
                      {reviewLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                      Reinstate
                    </Button>
                  </div>
                )}
              </div>

              {/* Delete record (dev only) */}
              {canDelete ? (
                <div className="space-y-3 border-t border-border pt-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Danger zone (dev only)
                  </p>
                  {showDeleteConfirm ? (
                    <div className="space-y-2 rounded-none border border-red-200 bg-red-50 p-3">
                      <p className="text-xs text-red-700">
                        This will permanently delete {reviewDialog.promoter.name} and all their invites. This cannot be undone.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          className="h-7 rounded-none bg-red-600 px-2.5 text-[10px] uppercase tracking-[0.14em] text-white hover:bg-red-700"
                          disabled={reviewLoading}
                          onClick={handleDeletePromoter}
                        >
                          {reviewLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                          Confirm delete
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className={adminSecondaryButtonClass}
                          onClick={() => setShowDeleteConfirm(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      className="h-7 rounded-none bg-red-600 px-2.5 text-[10px] uppercase tracking-[0.14em] text-white hover:bg-red-700"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      Delete record
                    </Button>
                  )}
                </div>
              ) : null}

              {/* Close button */}
              <div className="flex justify-end border-t border-border pt-3">
                <Button
                  type="button"
                  variant="outline"
                  className={adminSecondaryButtonClass}
                  onClick={closeReviewDialog}
                >
                  Close
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
