"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Copy,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  getApiData,
  getApiErrorMessage,
  readJsonSafely,
} from "@/lib/api/client";
import {
  buildPayoutDestinationPreview,
  getPayoutMethodShortLabel,
  hasCompletePayoutDestination,
} from "@/lib/checkout/payout-methods";
import type { AffiliateSetupPreview } from "@/lib/checkout/affiliate-service";

import {
  adminFieldClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  AdminPanel,
  AdminStatCard,
} from "../_components/admin-shell";

type AffiliateRow = {
  id: string;
  code: string;
  name: string;
  email: string;
  walletAddress: string;
  payoutMethod: "crypto_usdc_polygon" | "ach_bank_transfer";
  achAccountHolderName: string | null;
  achBankName: string | null;
  achAccountType: "checking" | "savings" | null;
  achRoutingNumberLast4: string | null;
  achAccountNumberLast4: string | null;
  socialProfiles: Array<{
    platform: string;
    url: string;
  }>;
  userId: string | null;
  swellCouponId: string | null;
  discountCode: string | null;
  discountPercent: string | null;
  commissionRate: string;
  currentMonthRevenue: string;
  currentMonthOrderCount: number;
  currentCommissionRate: string;
  currentCommissionTier: string | null;
  currentCommissionOverride: boolean;
  status: "pending" | "approved" | "rejected" | "suspended";
  createdAt: Date;
};

type OrphanAffiliateUser = {
  userId: string;
  name: string;
  email: string;
  createdAt: Date;
};

type AffiliateFilter =
  | "all"
  | "pending"
  | "approved"
  | "rejected"
  | "suspended";

type AssignmentFormState = {
  affiliateCode: string;
  discountPercent: string;
  commissionRate: string;
  sendApprovalEmail: boolean;
  reinstatementReason: string;
  confirmAssignment: boolean;
};

type DialogTab =
  | "codes"
  | "rates"
  | "commission"
  | "history"
  | "options"
  | "danger";

type AssignmentResult = {
  affiliateCode: string;
  discountCode: string | null;
  referralLink: string;
  checkoutLink: string | null;
  emailSent: boolean;
  affiliateName: string;
  affiliateEmail: string;
};

type AssignmentAvailability = {
  affiliateCode: {
    value: string;
    available: boolean;
    message: string;
  };
  discountCode: {
    value: string;
    available: boolean;
    message: string;
  };
};

type DiscountHistoryRow = {
  id: string;
  discountCode: string | null;
  oldDiscountPercent: string | null;
  newDiscountPercent: string | null;
  reason: string | null;
  changeScope: string;
  createdAt: string;
};

type CommissionSummary = {
  monthKey: string;
  startingRate: string;
  carriedForwardFromMonthKey: string | null;
  recognizedRevenue: string;
  recognizedOrderCount: number;
  tierKey: string;
  tierLabel: string;
  effectiveRate: string;
  overrideRate: string | null;
  overrideReason: string | null;
  hasOverride: boolean;
};

type CommissionEventRow = {
  id: string;
  monthKey: string;
  eventType: string;
  oldRate: string | null;
  newRate: string | null;
  notes: string | null;
  createdAt: string;
};

type CommissionOverview = {
  summary: CommissionSummary;
  recentMonths: CommissionSummary[];
  events: CommissionEventRow[];
};

type BulkDiscountSummary = {
  mode: "selected" | "filtered";
  totalTargeted: number;
  eligibleCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  dryRun: boolean;
  results: Array<{
    affiliateId: string;
    affiliateCode: string;
    discountCode: string | null;
    oldDiscountPercent: string | null;
    newDiscountPercent: string;
    eligible: boolean;
    updated: boolean;
    error: string | null;
  }>;
};

type DraftAffiliateSetup = Extract<AffiliateSetupPreview, { kind: "draft" }>;

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

  if (entry.discountCode) {
    return entry.discountCode;
  }

  return "Assigned";
}

function sanitizePartnerCode(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatCommissionPercent(value: string | null | undefined) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "0";
  return `${Number((numeric * 100).toFixed(2))}`;
}

function formatCurrency(value: string | number) {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

function unwrapAdminPayload<T>(payload: unknown) {
  return (getApiData<T>(payload) ?? payload) as T;
}

export function AffiliateManagement({
  affiliates,
  orphanUsers,
  initialSetupTarget,
  defaultBaselineCommissionPercent,
}: {
  affiliates: AffiliateRow[];
  orphanUsers: OrphanAffiliateUser[];
  initialSetupTarget: AffiliateSetupPreview | null;
  defaultBaselineCommissionPercent: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [repairingUserId, setRepairingUserId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AffiliateFilter>("all");
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentRemoving, setAssignmentRemoving] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [selectedAffiliate, setSelectedAffiliate] =
    useState<AffiliateRow | null>(null);
  const [selectedDraftSetup, setSelectedDraftSetup] =
    useState<DraftAffiliateSetup | null>(null);
  const [activeTab, setActiveTab] = useState<DialogTab>("codes");
  const [profilesExpanded, setProfilesExpanded] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentFormState>({
    affiliateCode: "",
    discountPercent: "10",
    commissionRate: defaultBaselineCommissionPercent,
    sendApprovalEmail: true,
    reinstatementReason: "",
    confirmAssignment: false,
  });
  const [assignmentResult, setAssignmentResult] =
    useState<AssignmentResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availability, setAvailability] =
    useState<AssignmentAvailability | null>(null);
  const [selectedAffiliateIds, setSelectedAffiliateIds] = useState<string[]>(
    [],
  );
  const [bulkMode, setBulkMode] = useState<"selected" | "filtered">("selected");
  const [bulkDiscountPercent, setBulkDiscountPercent] = useState("20");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<BulkDiscountSummary | null>(
    null,
  );
  const [commissionMonthKey, setCommissionMonthKey] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );
  const [commissionLoading, setCommissionLoading] = useState(false);
  const [commissionOverview, setCommissionOverview] =
    useState<CommissionOverview | null>(null);
  const [discountHistory, setDiscountHistory] = useState<DiscountHistoryRow[]>(
    [],
  );
  const [overrideRateInput, setOverrideRateInput] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [affiliateActionReason, setAffiliateActionReason] = useState("");
  const [dangerZoneMode, setDangerZoneMode] = useState<
    "suspended" | "delete" | null
  >(null);
  const autoOpenedSetupTarget = useRef<string | null>(null);

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
      currentMonthRevenue: affiliates.reduce(
        (sum, entry) => sum + Number(entry.currentMonthRevenue || 0),
        0,
      ),
      activeOverrides: affiliates.filter(
        (entry) => entry.currentCommissionOverride,
      ).length,
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
        getPayoutMethodShortLabel(entry.payoutMethod)
          .toLowerCase()
          .includes(normalizedQuery) ||
        (entry.achBankName || "").toLowerCase().includes(normalizedQuery) ||
        (entry.achAccountNumberLast4 || "").toLowerCase().includes(normalizedQuery) ||
        entry.socialProfiles.some(
          (profile) =>
            profile.platform.toLowerCase().includes(normalizedQuery) ||
            profile.url.toLowerCase().includes(normalizedQuery),
        ) ||
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

  const eligibleFilteredAffiliates = useMemo(
    () =>
      filteredAffiliates.filter(
        (entry) =>
          entry.status === "approved" &&
          Boolean(entry.discountCode) &&
          Boolean(entry.swellCouponId),
      ),
    [filteredAffiliates],
  );

  const eligibleFilteredIds = useMemo(
    () => eligibleFilteredAffiliates.map((entry) => entry.id),
    [eligibleFilteredAffiliates],
  );

  const selectedEligibleIds = useMemo(
    () => selectedAffiliateIds.filter((id) => eligibleFilteredIds.includes(id)),
    [eligibleFilteredIds, selectedAffiliateIds],
  );

  const isReinstatementFlow =
    selectedAffiliate?.status === "suspended" ||
    selectedAffiliate?.status === "rejected";
  const isDraftSetup = Boolean(selectedDraftSetup);
  const selectedSubject = selectedAffiliate
    ? {
        name: selectedAffiliate.name,
        email: selectedAffiliate.email,
        status: selectedAffiliate.status,
        socialProfiles: selectedAffiliate.socialProfiles,
      }
    : selectedDraftSetup
      ? {
          name: selectedDraftSetup.name,
          email: selectedDraftSetup.email,
          status: "draft",
          socialProfiles: [] as AffiliateRow["socialProfiles"],
        }
      : null;
  const dialogTabs = isDraftSetup
    ? ([
        { key: "codes", label: "Codes" },
        { key: "rates", label: "Rates" },
        { key: "options", label: "Options" },
      ] as const)
    : ([
        { key: "codes", label: "Codes" },
        { key: "rates", label: "Rates" },
        { key: "commission", label: "Commission" },
        { key: "history", label: "History" },
        { key: "options", label: "Options" },
        { key: "danger", label: "Danger" },
      ] as const);

  const derivedDiscountCode = assignmentForm.affiliateCode.toUpperCase();
  const availabilitySummary = availability
    ? {
        allAvailable:
          availability.affiliateCode.available &&
          availability.discountCode.available,
      }
    : null;

  const openAssignmentDialog = useCallback(
    (entry: AffiliateRow) => {
      const shouldUseConfiguredBaseline =
        entry.status === "pending" &&
        !entry.discountCode &&
        !entry.swellCouponId;

      setSelectedAffiliate(entry);
      setSelectedDraftSetup(null);
      setAssignmentError(null);
      setAssignmentResult(null);
      setAvailability(null);
      setActiveTab("codes");
      setProfilesExpanded(false);
      setAssignmentForm({
        affiliateCode: entry.code,
        discountPercent: entry.discountPercent || "10",
        commissionRate: shouldUseConfiguredBaseline
          ? defaultBaselineCommissionPercent
          : formatCommissionPercent(entry.commissionRate),
        sendApprovalEmail: entry.status !== "approved",
        reinstatementReason: "",
        confirmAssignment: false,
      });
      setCommissionMonthKey(new Date().toISOString().slice(0, 7));
      setOverrideRateInput("");
      setOverrideReason("");
      setAssignmentOpen(true);
    },
    [defaultBaselineCommissionPercent],
  );

  const openDraftAssignmentDialog = useCallback(
    (entry: DraftAffiliateSetup) => {
      setSelectedAffiliate(null);
      setSelectedDraftSetup(entry);
      setAssignmentError(null);
      setAssignmentResult(null);
      setAvailability(null);
      setActiveTab("codes");
      setProfilesExpanded(false);
      setAssignmentForm({
        affiliateCode: entry.affiliateCode,
        discountPercent: "10",
        commissionRate: defaultBaselineCommissionPercent,
        sendApprovalEmail: true,
        reinstatementReason: "",
        confirmAssignment: false,
      });
      setCommissionMonthKey(new Date().toISOString().slice(0, 7));
      setOverrideRateInput("");
      setOverrideReason("");
      setAssignmentOpen(true);
    },
    [defaultBaselineCommissionPercent],
  );

  function handleAssignmentOpenChange(open: boolean) {
    setAssignmentOpen(open);

    if (!open) {
      setAssignmentResult(null);
      setAvailability(null);
      setAssignmentError(null);
      setDangerZoneMode(null);
      setAffiliateActionReason("");
      setActiveTab("codes");
      setProfilesExpanded(false);
      setSelectedAffiliate(null);
      setSelectedDraftSetup(null);
    }
  }

  useEffect(() => {
    if (!initialSetupTarget) {
      return;
    }

    const setupKey =
      initialSetupTarget.kind === "existing"
        ? `affiliate:${initialSetupTarget.affiliateId}`
        : `draft:${initialSetupTarget.userId}`;
    if (autoOpenedSetupTarget.current === setupKey) {
      return;
    }

    if (initialSetupTarget.kind === "existing") {
      const requestedAffiliate = affiliates.find(
        (entry) => entry.id === initialSetupTarget.affiliateId,
      );
      if (!requestedAffiliate) {
        return;
      }

      autoOpenedSetupTarget.current = setupKey;
      openAssignmentDialog(requestedAffiliate);
    } else {
      autoOpenedSetupTarget.current = setupKey;
      openDraftAssignmentDialog(initialSetupTarget);
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("openAffiliate");
    nextParams.delete("openUser");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [
    affiliates,
    initialSetupTarget,
    openAssignmentDialog,
    openDraftAssignmentDialog,
    pathname,
    router,
    searchParams,
  ]);

  useEffect(() => {
    if (
      isDraftSetup &&
      (activeTab === "commission" ||
        activeTab === "history" ||
        activeTab === "danger")
    ) {
      setActiveTab("codes");
    }
  }, [activeTab, isDraftSetup]);

  useEffect(() => {
    if (!assignmentOpen || !selectedAffiliate) {
      return;
    }

    let cancelled = false;
    setCommissionLoading(true);

    fetch(
      `/api/admin/affiliates/${selectedAffiliate.id}?monthKey=${encodeURIComponent(
        commissionMonthKey,
      )}`,
    )
      .then(async (response) => {
        const payload = await readJsonSafely(response);
        const data = unwrapAdminPayload<{
          commission?: CommissionOverview | null;
          discountHistory?: DiscountHistoryRow[];
        }>(payload);
        if (!response.ok) {
          throw new Error(
            getApiErrorMessage(
              payload,
              "Failed to load Growth Partner detail.",
            ),
          );
        }

        if (cancelled) return;

        setCommissionOverview(data.commission ?? null);
        setDiscountHistory(data.discountHistory ?? []);
        if (data.commission?.summary) {
          setOverrideRateInput(
            data.commission.summary.overrideRate
              ? formatCommissionPercent(data.commission.summary.overrideRate)
              : "",
          );
          setOverrideReason(data.commission.summary.overrideReason ?? "");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setAssignmentError(
            error instanceof Error
              ? error.message
              : "Failed to load Growth Partner detail.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCommissionLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [assignmentOpen, commissionMonthKey, selectedAffiliate]);

  function toggleAffiliateSelection(id: string, checked: boolean) {
    setSelectedAffiliateIds((current) =>
      checked
        ? Array.from(new Set([...current, id]))
        : current.filter((entry) => entry !== id),
    );
  }

  function toggleSelectAllFiltered(checked: boolean) {
    setSelectedAffiliateIds((current) => {
      if (!checked) {
        return current.filter((id) => !eligibleFilteredIds.includes(id));
      }

      return Array.from(new Set([...current, ...eligibleFilteredIds]));
    });
  }

  async function handleCheckAvailability() {
    if (!selectedAffiliate && !selectedDraftSetup) return;

    setAvailabilityLoading(true);
    setAssignmentError(null);

    try {
      const response = await fetch(
        selectedAffiliate
          ? `/api/admin/affiliates/${selectedAffiliate.id}`
          : `/api/admin/users/${selectedDraftSetup!.userId}/affiliate-assignment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "check_availability",
            affiliateCode: assignmentForm.affiliateCode,
            discountCode: derivedDiscountCode,
          }),
        },
      );
      const payload = await readJsonSafely(response);
      const data = unwrapAdminPayload<{
        availability?: AssignmentAvailability | null;
      }>(payload);
      if (!response.ok) {
        throw new Error(
          getApiErrorMessage(payload, "Failed to check code availability."),
        );
      }

      setAvailability(data.availability ?? null);
      if (data.availability?.affiliateCode?.value) {
        setAssignmentForm((current) => ({
          ...current,
          affiliateCode:
            data.availability?.affiliateCode?.value || current.affiliateCode,
        }));
      }
    } catch (error) {
      setAssignmentError(
        error instanceof Error
          ? error.message
          : "Failed to check code availability.",
      );
    } finally {
      setAvailabilityLoading(false);
    }
  }

  async function submitBulkDiscount(dryRun: boolean) {
    const targetIds =
      bulkMode === "selected" ? selectedEligibleIds : eligibleFilteredIds;

    if (targetIds.length === 0) {
      setBulkPreview(null);
      setAssignmentError(
        "No eligible affiliates are selected for a bulk update.",
      );
      return;
    }

    setBulkLoading(true);
    setAssignmentError(null);

    try {
      const response = await fetch("/api/admin/affiliates/bulk-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: bulkMode,
          affiliateIds: targetIds,
          discountPercent: bulkDiscountPercent,
          changeReason: bulkReason,
          dryRun,
        }),
      });
      const payload = await readJsonSafely(response);
      const data = unwrapAdminPayload<{
        summary?: BulkDiscountSummary | null;
      }>(payload);
      if (!response.ok) {
        throw new Error(
          getApiErrorMessage(
            payload,
            "Failed to run the bulk discount update.",
          ),
        );
      }

      setBulkPreview(data.summary ?? null);
      if (!dryRun) {
        setBulkConfirm(false);
        router.refresh();
      }
    } catch (error) {
      setAssignmentError(
        error instanceof Error
          ? error.message
          : "Failed to run the bulk discount update.",
      );
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleOverrideSave(clearOverride = false) {
    if (!selectedAffiliate) return;

    setOverrideSaving(true);
    setAssignmentError(null);

    try {
      const response = await fetch(
        `/api/admin/affiliates/${selectedAffiliate.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commissionOverrideMonthKey: commissionMonthKey,
            commissionOverrideRate: clearOverride ? null : overrideRateInput,
            clearCommissionOverride: clearOverride,
            changeReason: overrideReason,
          }),
        },
      );
      const payload = await readJsonSafely(response);
      const data = unwrapAdminPayload<{
        commission?: CommissionOverview | null;
      }>(payload);
      if (!response.ok) {
        throw new Error(
          getApiErrorMessage(
            payload,
            "Failed to update the commission override.",
          ),
        );
      }

      setCommissionOverview(data.commission ?? null);
      router.refresh();
    } catch (error) {
      setAssignmentError(
        error instanceof Error
          ? error.message
          : "Failed to update the commission override.",
      );
    } finally {
      setOverrideSaving(false);
    }
  }

  async function handleStatusChange(
    id: string,
    status: "pending" | "approved" | "rejected" | "suspended",
    options?: {
      changeReason?: string;
      suspensionReason?: string;
    },
  ) {
    setLoadingId(id);

    try {
      const res = await fetch(`/api/admin/affiliates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          changeReason:
            options?.changeReason ||
            `Growth Partner status moved to ${status}.`,
          suspensionReason: options?.suspensionReason,
        }),
      });

      const payload = await readJsonSafely(res);
      if (!res.ok) {
        throw new Error(
          getApiErrorMessage(payload, "Failed to update Growth Partner."),
        );
      }

      router.refresh();
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update Growth Partner.";
      console.error("Failed to update Growth Partner:", error);
      window.alert(message);
      return false;
    } finally {
      setLoadingId(null);
    }
  }

  async function handleAssignmentSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedAffiliate && !selectedDraftSetup) return;
    const reinstatementReason = assignmentForm.reinstatementReason.trim();

    if (
      isReinstatementFlow &&
      assignmentForm.sendApprovalEmail &&
      !reinstatementReason
    ) {
      setAssignmentError(
        "A reinstatement reason is required to send the reinstatement email.",
      );
      return;
    }

    setAssignmentLoading(true);
    setAssignmentError(null);

    try {
      const res = await fetch(
        selectedAffiliate
          ? `/api/admin/affiliates/${selectedAffiliate.id}`
          : `/api/admin/users/${selectedDraftSetup!.userId}/affiliate-assignment`,
        {
          method: selectedAffiliate ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(selectedAffiliate
              ? { status: "approved" }
              : { action: "save_assignment" }),
            affiliateCode: assignmentForm.affiliateCode,
            discountCode: derivedDiscountCode,
            discountPercent: assignmentForm.discountPercent,
            commissionRate: assignmentForm.commissionRate,
            sendApprovalEmail: assignmentForm.sendApprovalEmail,
            changeReason: isReinstatementFlow
              ? reinstatementReason ||
                "Growth Partner reinstated from admin dashboard."
              : "Growth Partner assignment updated from admin dashboard.",
            reinstatementReason: isReinstatementFlow
              ? reinstatementReason
              : undefined,
          }),
        },
      );

      const payload = await readJsonSafely(res);
      const data = unwrapAdminPayload<{
        assignment: AssignmentResult;
      }>(payload);
      if (!res.ok) {
        throw new Error(
          getApiErrorMessage(payload, "Failed to save affiliate assignment."),
        );
      }

      setAssignmentResult({
        affiliateCode: data.assignment.affiliateCode,
        discountCode: data.assignment.discountCode,
        referralLink: data.assignment.referralLink,
        checkoutLink: data.assignment.checkoutLink,
        emailSent: Boolean(data.assignment.emailSent),
        affiliateName: selectedSubject?.name || "",
        affiliateEmail: selectedSubject?.email || "",
      });
      router.refresh();
    } catch (error) {
      setAssignmentError(
        error instanceof Error ? error.message : "Failed to save assignment.",
      );
    } finally {
      setAssignmentLoading(false);
    }
  }

  async function handleAssignmentRemoval() {
    if (!selectedAffiliate) return;

    const confirmed = window.confirm(
      `Remove the Swell assignment for ${selectedAffiliate.name}? This will delete the coupon and move the affiliate back to pending.`,
    );
    if (!confirmed) return;

    setAssignmentRemoving(true);
    setAssignmentError(null);

    try {
      const res = await fetch(`/api/admin/affiliates/${selectedAffiliate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          removeAssignment: true,
          changeReason:
            "Growth Partner Swell assignment removed from admin dashboard.",
        }),
      });

      const payload = await readJsonSafely(res);
      if (!res.ok) {
        throw new Error(
          getApiErrorMessage(payload, "Failed to remove affiliate assignment."),
        );
      }

      setAssignmentOpen(false);
      router.refresh();
    } catch (error) {
      setAssignmentError(
        error instanceof Error
          ? error.message
          : "Failed to remove affiliate assignment.",
      );
    } finally {
      setAssignmentRemoving(false);
    }
  }

  async function handleAffiliateDeletion(
    entry: AffiliateRow,
    removalReason: string,
  ) {
    setLoadingId(entry.id);

    try {
      const res = await fetch(`/api/admin/affiliates/${entry.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          removalReason,
        }),
      });

      const payload = await readJsonSafely(res);
      if (!res.ok) {
        throw new Error(
          getApiErrorMessage(
            payload,
            "Failed to delete the Growth Partner record.",
          ),
        );
      }

      setAssignmentOpen(false);
      setSelectedAffiliate(null);
      setDangerZoneMode(null);
      setAffiliateActionReason("");
      router.refresh();
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to delete the Growth Partner record.";

      console.error("Failed to delete Growth Partner:", error);
      window.alert(message);
      return false;
    } finally {
      setLoadingId(null);
    }
  }

  async function handleDangerZoneConfirm() {
    if (!selectedAffiliate || !dangerZoneMode) return;

    const reason = affiliateActionReason.trim();
    if (!reason) {
      window.alert(
        dangerZoneMode === "suspended"
          ? "A suspension reason is required."
          : "A removal reason is required.",
      );
      return;
    }

    if (dangerZoneMode === "suspended") {
      const updated = await handleStatusChange(
        selectedAffiliate.id,
        "suspended",
        {
          changeReason: `Growth Partner suspended: ${reason}`,
          suspensionReason: reason,
        },
      );
      if (updated) {
        setAssignmentOpen(false);
        setDangerZoneMode(null);
        setAffiliateActionReason("");
      }
      return;
    }

    await handleAffiliateDeletion(selectedAffiliate, reason);
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

  async function handleOrphanRepair(userId: string) {
    setRepairingUserId(userId);

    try {
      const res = await fetch(
        `/api/admin/affiliates/orphan-users/${userId}/repair`,
        {
          method: "POST",
        },
      );

      const payload = await readJsonSafely(res);
      const data = unwrapAdminPayload<{
        repair?: {
          created?: boolean;
        };
      }>(payload);
      if (!res.ok) {
        throw new Error(
          getApiErrorMessage(
            payload,
            "Failed to create the missing Growth Partner record.",
          ),
        );
      }

      window.alert(
        data?.repair?.created
          ? "Pending Growth Partner record created. Review and approve it below."
          : "Growth Partner record linked successfully.",
      );
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create the missing Growth Partner record.";
      console.error("Failed to repair orphan Growth Partner:", error);
      window.alert(message);
    } finally {
      setRepairingUserId(null);
    }
  }

  return (
    <div className="space-y-3">
      {orphanUsers.length > 0 ? (
        <AdminPanel tone="muted" className="space-y-3">
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0B2E2F]/46">
              Needs Repair
            </p>
            <h3 className="text-sm font-semibold tracking-[-0.04em] text-[#0B2E2F]">
              Growth Partner users missing partner records
            </h3>
            <p className="max-w-3xl text-[11px] leading-4 text-[#0B2E2F]/62">
              These accounts are marked as Growth Partners in auth, but they do
              not have a linked record in the affiliates table. Repair creates a
              pending partner record linked to the user so approval can continue
              in this screen.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {orphanUsers.map((entry) => (
              <div
                key={entry.userId}
                className="flex flex-col gap-2.5 border border-[#0B2E2F]/12 bg-[#FCFAF6] px-3 py-3 md:flex-row md:items-end md:justify-between"
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[#0B2E2F]">
                    {entry.name || "Unnamed user"}
                  </p>
                  <p className="text-xs text-[#0B2E2F]/60">{entry.email}</p>
                  <p className="text-xs text-[#0B2E2F]/42">
                    Marked Growth Partner on{" "}
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  type="button"
                  className={adminPrimaryButtonClass}
                  disabled={repairingUserId === entry.userId}
                  onClick={() => handleOrphanRepair(entry.userId)}
                >
                  {repairingUserId === entry.userId ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Repair record
                </Button>
              </div>
            ))}
          </div>
        </AdminPanel>
      ) : null}

      <Dialog open={assignmentOpen} onOpenChange={handleAssignmentOpenChange}>
        <DialogContent className="flex max-w-[900px] flex-col gap-0 overflow-hidden rounded-none border-[#0B2E2F]/16 bg-[#FCFAF6] p-0 shadow-[0_24px_80px_rgba(11,46,47,0.12)] sm:h-[80vh]">
          <DialogTitle className="sr-only">
            {assignmentResult
              ? "Assignment saved"
              : isDraftSetup
                ? "Create Growth Partner assignment"
                : selectedAffiliate?.status === "approved"
                  ? "Manage assignment"
                  : isReinstatementFlow
                    ? "Reinstate affiliate"
                    : "Approve affiliate"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {assignmentResult
              ? "Codes and links updated."
              : isDraftSetup
                ? "Create the Growth Partner record and assignment."
                : isReinstatementFlow
                  ? "Edit codes and reinstatement settings."
                  : "Edit codes and approval settings."}
          </DialogDescription>

          {selectedSubject && !assignmentResult ? (
            <form
              onSubmit={handleAssignmentSubmit}
              className="flex min-h-0 flex-1 flex-col"
            >
              {/* ── Dialog Header ── */}
              <div className="shrink-0 border-b border-[#0B2E2F]/12 px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-sm font-semibold tracking-[-0.04em] text-[#0B2E2F]">
                    {selectedSubject.name}
                  </p>
                  <span className="text-xs text-[#0B2E2F]/58">
                    {selectedSubject.email}
                  </span>
                  <Badge
                    variant={statusBadgeVariant(selectedSubject.status)}
                    className="rounded-none px-2.5 py-0.5 text-[10px] uppercase tracking-[0.14em]"
                  >
                    {selectedSubject.status}
                  </Badge>
                  {selectedSubject.socialProfiles.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setProfilesExpanded((p) => !p)}
                      className="flex items-center gap-1 text-xs font-semibold text-[#0B2E2F]/62 hover:text-[#0B2E2F]"
                    >
                      {selectedSubject.socialProfiles.length} profile
                      {selectedSubject.socialProfiles.length === 1 ? "" : "s"}
                      <ChevronDown
                        className={`size-3 transition-transform ${profilesExpanded ? "rotate-180" : ""}`}
                      />
                    </button>
                  ) : null}
                </div>
                {profilesExpanded &&
                selectedSubject.socialProfiles.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedSubject.socialProfiles.map((profile, index) => (
                      <a
                        key={`${profile.platform}-${profile.url}-${index}`}
                        href={profile.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-none border border-[#0B2E2F]/10 bg-white/85 px-2.5 py-1.5 text-xs font-semibold text-[#0B2E2F] underline-offset-4 hover:underline"
                      >
                        {profile.platform}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* ── Dialog Body (sidebar + content) ── */}
              <div className="flex min-h-0 flex-1">
                {/* Left tab nav */}
                <nav className="flex w-[160px] shrink-0 flex-col gap-0.5 border-r border-[#0B2E2F]/10 bg-[#F8F5EF] px-2 py-3">
                  {dialogTabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={[
                        "rounded-none px-3 py-2 text-left text-xs font-semibold transition-colors",
                        activeTab === tab.key
                          ? "bg-[#0B2E2F] text-[#F4F1EA]"
                          : tab.key === "danger"
                            ? "text-red-700 hover:bg-red-50"
                            : "text-[#0B2E2F]/62 hover:bg-[#EFE7D8] hover:text-[#0B2E2F]",
                      ].join(" ")}
                    >
                      {tab.label}
                    </button>
                  ))}
                </nav>

                {/* Right content */}
                <div className="flex-1 overflow-y-auto px-5 py-5">
                  {/* ── Codes Tab ── */}
                  {activeTab === "codes" ? (
                    <div className="space-y-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/45">
                        Codes
                      </p>
                      <div className="space-y-2">
                        <Label>Partner code</Label>
                        <Input
                          value={assignmentForm.affiliateCode}
                          onChange={(event) => {
                            setAvailability(null);
                            setAssignmentForm((current) => ({
                              ...current,
                              affiliateCode: sanitizePartnerCode(
                                event.target.value,
                              ),
                              confirmAssignment: false,
                            }));
                          }}
                          className={adminFieldClass}
                          placeholder="e.g. azim-lab"
                          required
                        />
                        <p className="text-xs text-[#0B2E2F]/56">
                          Route:{" "}
                          <span className="font-mono">
                            revalin.ca/
                            {assignmentForm.affiliateCode || "partner-code"}
                          </span>
                        </p>
                        <p className="text-xs text-[#0B2E2F]/56">
                          Swell code:{" "}
                          <span className="font-mono font-semibold">
                            {derivedDiscountCode || "—"}
                          </span>
                        </p>
                      </div>

                      <div className="flex flex-col gap-2.5 rounded-none border border-[#0B2E2F]/10 bg-white/80 px-3 py-3">
                        <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/45">
                              Assignment-time code check
                            </p>
                            <p className="mt-1 text-xs text-[#0B2E2F]/58">
                              Confirms the route slug and Swell code can be
                              reserved before saving.
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            className={adminSecondaryButtonClass}
                            onClick={handleCheckAvailability}
                            disabled={availabilityLoading}
                          >
                            {availabilityLoading ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : null}
                            Check availability
                          </Button>
                        </div>

                        {availability ? (
                          <div className="space-y-2.5">
                            <div
                              className={`flex items-start gap-2.5 rounded-none border px-3 py-3 ${
                                availabilitySummary?.allAvailable
                                  ? "border-emerald-200 bg-emerald-50"
                                  : "border-red-200 bg-red-50"
                              }`}
                            >
                              {availabilitySummary?.allAvailable ? (
                                <CheckCircle2 className="mt-0.5 size-4 text-emerald-700" />
                              ) : (
                                <XCircle className="mt-0.5 size-4 text-red-600" />
                              )}
                              <div className="space-y-1">
                                <p
                                  className={`text-xs font-semibold ${
                                    availabilitySummary?.allAvailable
                                      ? "text-emerald-700"
                                      : "text-red-700"
                                  }`}
                                >
                                  {availabilitySummary?.allAvailable
                                    ? "This partner code and Swell code are available to use."
                                    : "One or more codes need to be changed before saving."}
                                </p>
                                <p className="text-xs text-[#0B2E2F]/58">
                                  Checked route{" "}
                                  <span className="font-mono">
                                    /
                                    {assignmentForm.affiliateCode ||
                                      "partner-code"}
                                  </span>{" "}
                                  and Swell code{" "}
                                  <span className="font-mono">
                                    {derivedDiscountCode || "—"}
                                  </span>
                                  .
                                </p>
                              </div>
                            </div>

                            <div className="grid gap-2.5 sm:grid-cols-2">
                              <div
                                className={`rounded-none border px-2.5 py-2.5 ${
                                  availability.affiliateCode.available
                                    ? "border-emerald-200 bg-emerald-50"
                                    : "border-red-200 bg-red-50"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/45">
                                    Partner code
                                  </p>
                                  <span
                                    className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                                      availability.affiliateCode.available
                                        ? "text-emerald-700"
                                        : "text-red-600"
                                    }`}
                                  >
                                    {availability.affiliateCode.available ? (
                                      <CheckCircle2 className="size-3.5" />
                                    ) : (
                                      <XCircle className="size-3.5" />
                                    )}
                                    {availability.affiliateCode.available
                                      ? "Available"
                                      : "Unavailable"}
                                  </span>
                                </div>
                                <p
                                  className={`mt-1.5 text-xs font-semibold ${
                                    availability.affiliateCode.available
                                      ? "text-emerald-700"
                                      : "text-red-600"
                                  }`}
                                >
                                  {availability.affiliateCode.message}
                                </p>
                              </div>
                              <div
                                className={`rounded-none border px-2.5 py-2.5 ${
                                  availability.discountCode.available
                                    ? "border-emerald-200 bg-emerald-50"
                                    : "border-red-200 bg-red-50"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/45">
                                    Swell code
                                  </p>
                                  <span
                                    className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                                      availability.discountCode.available
                                        ? "text-emerald-700"
                                        : "text-red-600"
                                    }`}
                                  >
                                    {availability.discountCode.available ? (
                                      <CheckCircle2 className="size-3.5" />
                                    ) : (
                                      <XCircle className="size-3.5" />
                                    )}
                                    {availability.discountCode.available
                                      ? "Available"
                                      : "Unavailable"}
                                  </span>
                                </div>
                                <p
                                  className={`mt-1.5 text-xs font-semibold ${
                                    availability.discountCode.available
                                      ? "text-emerald-700"
                                      : "text-red-600"
                                  }`}
                                >
                                  {availability.discountCode.message}
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {/* ── Rates Tab ── */}
                  {activeTab === "rates" ? (
                    <div className="space-y-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/45">
                        Rates
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Discount percent</Label>
                          <Input
                            value={assignmentForm.discountPercent}
                            onChange={(event) =>
                              setAssignmentForm((current) => ({
                                ...current,
                                discountPercent: event.target.value,
                                confirmAssignment: false,
                              }))
                            }
                            className={adminFieldClass}
                            placeholder="10"
                            required
                          />
                          <p className="text-xs text-[#0B2E2F]/56">
                            Customer-facing Swell discount applied in checkout.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>Baseline commission percent</Label>
                          <Input
                            value={assignmentForm.commissionRate}
                            onChange={(event) =>
                              setAssignmentForm((current) => ({
                                ...current,
                                commissionRate: event.target.value,
                                confirmAssignment: false,
                              }))
                            }
                            className={adminFieldClass}
                            placeholder={defaultBaselineCommissionPercent}
                            required
                          />
                          <p className="text-xs text-[#0B2E2F]/56">
                            Starting rate carried into new commission months.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* ── Commission Tab ── */}
                  {activeTab === "commission" ? (
                    <div className="space-y-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/45">
                            Commission month
                          </p>
                          <p className="mt-1 text-xs text-[#0B2E2F]/58">
                            Paid-month tier state, override controls, and payout
                            impact for the selected month.
                          </p>
                        </div>
                        <div className="w-full max-w-[180px] space-y-2">
                          <Label>Month</Label>
                          <Input
                            type="month"
                            value={commissionMonthKey}
                            onChange={(event) =>
                              setCommissionMonthKey(event.target.value)
                            }
                            className={adminFieldClass}
                          />
                        </div>
                      </div>

                      {commissionLoading ? (
                        <div className="flex items-center gap-2 text-xs text-[#0B2E2F]/58">
                          <Loader2 className="size-4 animate-spin" />
                          Loading commission state...
                        </div>
                      ) : commissionOverview?.summary ? (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-none border border-[#0B2E2F]/10 bg-[#FCFAF6] px-2.5 py-2.5">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/45">
                                Revenue
                              </p>
                              <p className="mt-1.5 text-sm font-semibold text-[#0B2E2F]">
                                {formatCurrency(
                                  commissionOverview.summary.recognizedRevenue,
                                )}
                              </p>
                            </div>
                            <div className="rounded-none border border-[#0B2E2F]/10 bg-[#FCFAF6] px-2.5 py-2.5">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/45">
                                Orders
                              </p>
                              <p className="mt-1.5 text-sm font-semibold text-[#0B2E2F]">
                                {
                                  commissionOverview.summary
                                    .recognizedOrderCount
                                }
                              </p>
                            </div>
                            <div className="rounded-none border border-[#0B2E2F]/10 bg-[#FCFAF6] px-2.5 py-2.5">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/45">
                                Tier
                              </p>
                              <p className="mt-1.5 text-sm font-semibold text-[#0B2E2F]">
                                {commissionOverview.summary.tierLabel}
                              </p>
                            </div>
                            <div className="rounded-none border border-[#0B2E2F]/10 bg-[#FCFAF6] px-2.5 py-2.5">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/45">
                                Effective rate
                              </p>
                              <div className="mt-1.5 flex items-center gap-2">
                                <p className="text-sm font-semibold text-[#0B2E2F]">
                                  {formatCommissionPercent(
                                    commissionOverview.summary.effectiveRate,
                                  )}
                                  %
                                </p>
                                {commissionOverview.summary.hasOverride ? (
                                  <Badge
                                    variant="secondary"
                                    className="rounded-none"
                                  >
                                    Override
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                            <div className="space-y-2">
                              <Label>Month-specific override percent</Label>
                              <Input
                                value={overrideRateInput}
                                onChange={(event) =>
                                  setOverrideRateInput(event.target.value)
                                }
                                className={adminFieldClass}
                                placeholder="e.g. 22"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Override reason</Label>
                              <Input
                                value={overrideReason}
                                onChange={(event) =>
                                  setOverrideReason(event.target.value)
                                }
                                className={adminFieldClass}
                                placeholder="Why this month needs a manual rate"
                              />
                            </div>
                            <div className="flex flex-col gap-2 self-end lg:flex-row">
                              <Button
                                type="button"
                                variant="outline"
                                className={adminSecondaryButtonClass}
                                onClick={() => handleOverrideSave(true)}
                                disabled={
                                  overrideSaving ||
                                  !commissionOverview.summary.hasOverride
                                }
                              >
                                Clear override
                              </Button>
                              <Button
                                type="button"
                                className={adminPrimaryButtonClass}
                                onClick={() => handleOverrideSave(false)}
                                disabled={
                                  overrideSaving || !overrideRateInput.trim()
                                }
                              >
                                {overrideSaving ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : null}
                                Save override
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* ── History Tab ── */}
                  {activeTab === "history" ? (
                    <div className="space-y-4">
                      <div className="rounded-none border border-[#0B2E2F]/10 bg-[#FCFAF6] px-2.5 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/45">
                          Recent commission events
                        </p>
                        {commissionOverview?.events &&
                        commissionOverview.events.length > 0 ? (
                          <div className="mt-2.5 space-y-2.5">
                            {commissionOverview.events
                              .slice(0, 4)
                              .map((event) => (
                                <div
                                  key={event.id}
                                  className="border-t border-[#0B2E2F]/8 pt-2.5 first:border-t-0 first:pt-0"
                                >
                                  <p className="text-xs font-semibold capitalize text-[#0B2E2F]">
                                    {event.eventType.replace(/_/g, " ")}
                                  </p>
                                  <p className="mt-1 text-xs text-[#0B2E2F]/52">
                                    {new Date(event.createdAt).toLocaleString()}
                                  </p>
                                  {event.notes ? (
                                    <p className="mt-1 text-xs text-[#0B2E2F]/62">
                                      {event.notes}
                                    </p>
                                  ) : null}
                                </div>
                              ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-[#0B2E2F]/58">
                            No commission events recorded yet.
                          </p>
                        )}
                      </div>

                      <div className="rounded-none border border-[#0B2E2F]/10 bg-[#FCFAF6] px-2.5 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/45">
                          Recent discount changes
                        </p>
                        {discountHistory.length > 0 ? (
                          <div className="mt-2.5 space-y-2.5">
                            {discountHistory.slice(0, 4).map((change) => (
                              <div
                                key={change.id}
                                className="border-t border-[#0B2E2F]/8 pt-2.5 first:border-t-0 first:pt-0"
                              >
                                <p className="text-xs font-semibold text-[#0B2E2F]">
                                  {change.discountCode || "Code removed"}
                                </p>
                                <p className="mt-1 text-xs text-[#0B2E2F]/52">
                                  {change.oldDiscountPercent || "-"}% →{" "}
                                  {change.newDiscountPercent || "-"}% •{" "}
                                  {new Date(change.createdAt).toLocaleString()}
                                </p>
                                {change.reason ? (
                                  <p className="mt-1 text-xs text-[#0B2E2F]/62">
                                    {change.reason}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-[#0B2E2F]/58">
                            No discount changes recorded yet.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {/* ── Options Tab ── */}
                  {activeTab === "options" ? (
                    <div className="space-y-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/45">
                        Options
                      </p>

                      {isReinstatementFlow ? (
                        <div className="space-y-2">
                          <Label
                            htmlFor="reinstatement-reason"
                            className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/55"
                          >
                            Reinstatement reason
                          </Label>
                          <Input
                            id="reinstatement-reason"
                            value={assignmentForm.reinstatementReason}
                            onChange={(event) =>
                              setAssignmentForm((current) => ({
                                ...current,
                                reinstatementReason: event.target.value,
                              }))
                            }
                            placeholder="Explain why this Growth Partner is being reinstated"
                            className={adminFieldClass}
                          />
                          <p className="text-xs text-[#0B2E2F]/52">
                            Sent in the reinstatement email when email delivery
                            is enabled below.
                          </p>
                        </div>
                      ) : null}

                      <label className="flex items-start gap-3 rounded-none border border-[#0B2E2F]/12 bg-white/70 px-3 py-2.5 text-xs text-[#0B2E2F]/72">
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
                          {isReinstatementFlow
                            ? "Send reinstatement email"
                            : "Send approval email"}
                        </span>
                      </label>

                      <label className="flex items-start gap-3 rounded-none border border-[#0B2E2F]/12 bg-[#F4F1EA] px-3 py-2.5 text-xs text-[#0B2E2F]/78">
                        <input
                          type="checkbox"
                          checked={assignmentForm.confirmAssignment}
                          onChange={(event) =>
                            setAssignmentForm((current) => ({
                              ...current,
                              confirmAssignment: event.target.checked,
                            }))
                          }
                          className="mt-1 size-4 rounded-none border-[#0B2E2F]/30 text-[#0B2E2F] focus:ring-0"
                        />
                        <span>I confirm these codes are correct.</span>
                      </label>
                    </div>
                  ) : null}

                  {/* ── Danger Tab ── */}
                  {activeTab === "danger" ? (
                    <div className="space-y-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-red-700">
                        Danger zone
                      </p>

                      {!dangerZoneMode ? (
                        <div className="flex gap-2">
                          {selectedAffiliate?.status !== "suspended" ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="h-7 rounded-none border border-red-200 bg-white px-2.5 text-[10px] uppercase tracking-[0.14em] text-red-700 hover:bg-red-100 hover:text-red-800"
                              onClick={() => setDangerZoneMode("suspended")}
                            >
                              Suspend
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            className="h-7 rounded-none bg-red-600 px-2.5 text-[10px] uppercase tracking-[0.14em] text-white hover:bg-red-700"
                            onClick={() => setDangerZoneMode("delete")}
                          >
                            Delete record
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-xs text-red-700">
                            {dangerZoneMode === "delete"
                              ? `Deleting ${selectedSubject?.name} will remove the application and send the removal email immediately.`
                              : `Suspending ${selectedSubject?.name} will disable Growth Partner access and send the suspension email.`}
                          </p>
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-[0.16em] text-red-700/70">
                              {dangerZoneMode === "delete"
                                ? "Removal reason"
                                : "Suspension reason"}
                            </Label>
                            <Input
                              value={affiliateActionReason}
                              onChange={(event) =>
                                setAffiliateActionReason(event.target.value)
                              }
                              placeholder={
                                dangerZoneMode === "delete"
                                  ? "Explain why this record is being deleted"
                                  : "Explain why this Growth Partner is being suspended"
                              }
                              className={adminFieldClass}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className={adminSecondaryButtonClass}
                              onClick={() => {
                                setDangerZoneMode(null);
                                setAffiliateActionReason("");
                              }}
                              disabled={loadingId === selectedAffiliate?.id}
                            >
                              Back
                            </Button>
                            <Button
                              type="button"
                              className={
                                dangerZoneMode === "delete"
                                  ? "h-7 rounded-none bg-red-600 px-2.5 text-[10px] uppercase tracking-[0.14em] text-white hover:bg-red-700"
                                  : adminPrimaryButtonClass
                              }
                              onClick={handleDangerZoneConfirm}
                              disabled={loadingId === selectedAffiliate?.id}
                            >
                              {loadingId === selectedAffiliate?.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : null}
                              {dangerZoneMode === "delete"
                                ? "Delete record"
                                : "Suspend affiliate"}
                            </Button>
                          </div>
                        </div>
                      )}

                      {selectedAffiliate?.discountCode ||
                      selectedAffiliate?.swellCouponId ? (
                        <div className="border-t border-red-200 pt-3">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-7 rounded-none border border-red-200 bg-white px-2.5 text-[10px] uppercase tracking-[0.14em] text-red-700 hover:bg-red-100 hover:text-red-800"
                            onClick={handleAssignmentRemoval}
                            disabled={assignmentLoading || assignmentRemoving}
                          >
                            {assignmentRemoving ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              "Remove from Swell"
                            )}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {assignmentError ? (
                    <p className="mt-3 text-xs text-red-600">
                      {assignmentError}
                    </p>
                  ) : null}
                </div>
              </div>

              {/* ── Dialog Footer ── */}
              <div className="shrink-0 border-t border-[#0B2E2F]/12 bg-[#FCFAF6] px-5 py-3">
                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className={adminSecondaryButtonClass}
                    onClick={() => setAssignmentOpen(false)}
                    disabled={assignmentLoading || assignmentRemoving}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className={adminPrimaryButtonClass}
                    disabled={
                      assignmentLoading ||
                      assignmentRemoving ||
                      !assignmentForm.confirmAssignment
                    }
                  >
                    {assignmentLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : isDraftSetup ? (
                      "Create and assign"
                    ) : selectedAffiliate?.status === "approved" ? (
                      "Save assignment"
                    ) : isReinstatementFlow ? (
                      "Reinstate and assign"
                    ) : (
                      "Approve and assign"
                    )}
                  </Button>
                </div>
              </div>
            </form>
          ) : null}

          {assignmentResult ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
                <div className="rounded-none border border-[#0B2E2F]/10 bg-white/85 px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/45">
                    Affiliate
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#0B2E2F]">
                    {assignmentResult.affiliateName}
                  </p>
                  <p className="text-xs text-[#0B2E2F]/55">
                    {assignmentResult.affiliateEmail}
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="rounded-none border border-[#0B2E2F]/10 bg-white/85 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/45">
                          Partner code
                        </p>
                        <p className="mt-1 font-mono text-xs font-semibold text-[#0B2E2F]">
                          /{assignmentResult.affiliateCode}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className={adminSecondaryButtonClass}
                        onClick={() =>
                          copyValue(
                            "affiliate-code",
                            assignmentResult.affiliateCode,
                          )
                        }
                      >
                        {copiedField === "affiliate-code" ? (
                          <CheckCircle2 className="size-4" />
                        ) : (
                          <Copy className="size-4" />
                        )}
                        {copiedField === "affiliate-code" ? "Copied" : "Copy"}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-none border border-[#0B2E2F]/10 bg-white/85 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/45">
                          Swell discount code
                        </p>
                        <p className="mt-1 font-mono text-xs font-semibold text-[#0B2E2F]">
                          {assignmentResult.discountCode}
                        </p>
                      </div>
                      {assignmentResult.discountCode ? (
                        <Button
                          type="button"
                          variant="outline"
                          className={adminSecondaryButtonClass}
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

                  <div className="rounded-none border border-[#0B2E2F]/10 bg-white/85 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/45">
                          Branded referral link
                        </p>
                        <p className="mt-1 break-all font-mono text-xs font-semibold text-[#0B2E2F]">
                          {assignmentResult.referralLink}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className={adminSecondaryButtonClass}
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
                    <div className="rounded-none border border-[#0B2E2F]/10 bg-white/85 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/45">
                            Direct checkout link
                          </p>
                          <p className="mt-1 break-all font-mono text-xs font-semibold text-[#0B2E2F]">
                            {assignmentResult.checkoutLink}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className={adminSecondaryButtonClass}
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

                <p className="text-xs leading-5 text-[#0B2E2F]/62">
                  {assignmentResult.emailSent
                    ? "Approval email sent."
                    : "Saved without email."}
                </p>
              </div>

              <div className="shrink-0 border-t border-[#0B2E2F]/12 bg-[#FCFAF6] px-5 py-3">
                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className={adminSecondaryButtonClass}
                    onClick={() => setAssignmentResult(null)}
                  >
                    Edit again
                  </Button>
                  <Button
                    type="button"
                    className={adminPrimaryButtonClass}
                    onClick={() => handleAssignmentOpenChange(false)}
                  >
                    Done
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <AdminStatCard label="Applicants" value={counts.all} size="compact" />
        <AdminStatCard label="Pending" value={counts.pending} size="compact" />
        <AdminStatCard
          label="Approved"
          value={counts.approved}
          size="compact"
        />
        <AdminStatCard
          label="Codes assigned"
          value={counts.assignedCodes}
          size="compact"
        />
        <AdminStatCard
          label="Month revenue"
          value={formatCurrency(counts.currentMonthRevenue)}
          size="compact"
        />
      </div>

      <AdminPanel className="space-y-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid gap-2 xl:w-full xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)_auto]">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search code, name, email, payout method, or destination"
              className={adminFieldClass}
            />

            <div className="grid gap-1.5 sm:grid-cols-5">
              {filterOptions.map((option) => {
                const active = filter === option.key;

                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setFilter(option.key)}
                    className={[
                      "flex min-h-7 items-center justify-between gap-2 rounded-none border px-2.5 py-1.5 text-left transition-colors",
                      active
                        ? "border-[#0B2E2F] bg-[#0B2E2F] text-[#F4F1EA]"
                        : "border-[#0B2E2F]/12 bg-[#FCFAF6] text-[#0B2E2F]/64 hover:bg-[#EFE7D8]",
                    ].join(" ")}
                  >
                    <span className="text-[9px] font-semibold uppercase tracking-[0.14em]">
                      {option.label}
                    </span>
                    <span className="text-[11px] font-semibold leading-none">
                      {option.count}
                    </span>
                  </button>
                );
              })}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8 shrink-0 self-start"
              onClick={() => router.refresh()}
              title="Refresh data"
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
        </div>

        <div className="rounded-none border border-[#0B2E2F]/12 bg-white/70 px-2.5 py-2.5">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/46">
                  Bulk discount control
                </p>
                <p className="mt-1 text-xs leading-5 text-[#0B2E2F]/58">
                  Update the customer-facing Swell discount percent for selected
                  affiliates or every eligible affiliate in the current filtered
                  view.
                </p>
              </div>
              <div className="text-xs text-[#0B2E2F]/58">
                Selected eligible{" "}
                <span className="font-semibold text-[#0B2E2F]">
                  {selectedEligibleIds.length}
                </span>{" "}
                / filtered eligible{" "}
                <span className="font-semibold text-[#0B2E2F]">
                  {eligibleFilteredIds.length}
                </span>
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-[200px_minmax(0,120px)_minmax(0,1fr)_auto]">
              <div className="space-y-2">
                <Label>Target mode</Label>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <button
                    type="button"
                    onClick={() => setBulkMode("selected")}
                    className={[
                      "rounded-none border px-2.5 py-1.5 text-left text-xs font-semibold transition-colors",
                      bulkMode === "selected"
                        ? "border-[#0B2E2F] bg-[#0B2E2F] text-[#F4F1EA]"
                        : "border-[#0B2E2F]/12 bg-[#FCFAF6] text-[#0B2E2F]/70 hover:bg-[#EFE7D8]",
                    ].join(" ")}
                  >
                    Selected individuals
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkMode("filtered")}
                    className={[
                      "rounded-none border px-2.5 py-1.5 text-left text-xs font-semibold transition-colors",
                      bulkMode === "filtered"
                        ? "border-[#0B2E2F] bg-[#0B2E2F] text-[#F4F1EA]"
                        : "border-[#0B2E2F]/12 bg-[#FCFAF6] text-[#0B2E2F]/70 hover:bg-[#EFE7D8]",
                    ].join(" ")}
                  >
                    All filtered individuals
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Discount %</Label>
                <Input
                  value={bulkDiscountPercent}
                  onChange={(event) =>
                    setBulkDiscountPercent(event.target.value)
                  }
                  className={adminFieldClass}
                  placeholder="20"
                />
              </div>

              <div className="space-y-2">
                <Label>Reason</Label>
                <Input
                  value={bulkReason}
                  onChange={(event) => setBulkReason(event.target.value)}
                  className={adminFieldClass}
                  placeholder="Why this discount is changing"
                />
              </div>

              <div className="flex flex-col gap-2 self-end lg:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className={adminSecondaryButtonClass}
                  onClick={() => submitBulkDiscount(true)}
                  disabled={bulkLoading}
                >
                  {bulkLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Preview
                </Button>
                <Button
                  type="button"
                  className={adminPrimaryButtonClass}
                  onClick={() => submitBulkDiscount(false)}
                  disabled={bulkLoading || !bulkConfirm || !bulkPreview}
                >
                  Apply bulk update
                </Button>
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-none border border-[#0B2E2F]/12 bg-[#F4F1EA] px-3 py-2.5 text-xs text-[#0B2E2F]/78">
              <input
                type="checkbox"
                checked={bulkConfirm}
                onChange={(event) => setBulkConfirm(event.target.checked)}
                className="mt-1 size-4 rounded-none border-[#0B2E2F]/30 text-[#0B2E2F] focus:ring-0"
              />
              <span>
                I confirm the selected mode and new discount percent are
                correct.
              </span>
            </label>

            {bulkPreview ? (
              <div className="rounded-none border border-[#0B2E2F]/10 bg-[#FCFAF6] px-3 py-3">
                <div className="grid gap-3 md:grid-cols-5">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#0B2E2F]/45">
                      Targeted
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#0B2E2F]">
                      {bulkPreview.totalTargeted}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#0B2E2F]/45">
                      Eligible
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#0B2E2F]">
                      {bulkPreview.eligibleCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#0B2E2F]/45">
                      Updated
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#0B2E2F]">
                      {bulkPreview.updatedCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#0B2E2F]/45">
                      Skipped
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#0B2E2F]">
                      {bulkPreview.skippedCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#0B2E2F]/45">
                      Failed
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#0B2E2F]">
                      {bulkPreview.failedCount}
                    </p>
                  </div>
                </div>

                {bulkPreview.results.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {bulkPreview.results.slice(0, 6).map((result) => (
                      <div
                        key={`${result.affiliateId}-${result.affiliateCode}`}
                        className="flex flex-col gap-1 border-t border-[#0B2E2F]/8 pt-2 first:border-t-0 first:pt-0 md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <p className="text-xs font-semibold text-[#0B2E2F]">
                            {result.affiliateCode || result.affiliateId}
                          </p>
                          <p className="text-xs text-[#0B2E2F]/52">
                            {result.oldDiscountPercent || "-"}% →{" "}
                            {result.newDiscountPercent}%
                          </p>
                        </div>
                        <p
                          className={`text-xs ${
                            result.error
                              ? "text-red-600"
                              : result.updated
                                ? "text-emerald-700"
                                : "text-[#0B2E2F]/58"
                          }`}
                        >
                          {result.error ||
                            (bulkPreview.dryRun
                              ? "Ready to update"
                              : result.updated
                                ? "Updated"
                                : "Skipped")}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {assignmentError && !assignmentOpen ? (
              <p className="text-xs text-red-600">{assignmentError}</p>
            ) : null}
          </div>
        </div>

        <div className="overflow-hidden border border-[#0B2E2F]/12 bg-[#FCFAF6]">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-[#0B2E2F]/10 hover:bg-transparent">
                <TableHead className="w-12 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={
                      eligibleFilteredIds.length > 0 &&
                      selectedEligibleIds.length === eligibleFilteredIds.length
                    }
                    onChange={(event) =>
                      toggleSelectAllFiltered(event.target.checked)
                    }
                    className="size-4 rounded-none border-[#0B2E2F]/30 text-[#0B2E2F] focus:ring-0"
                    aria-label="Select all eligible affiliates in view"
                  />
                </TableHead>
                <TableHead className="px-3 py-2.5 text-[9px] uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Partner code
                </TableHead>
                <TableHead className="px-3 py-2.5 text-[9px] uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Applicant
                </TableHead>
                <TableHead className="px-3 py-2.5 text-[9px] uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Status
                </TableHead>
                <TableHead className="px-3 py-2.5 text-[9px] uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Swell code
                </TableHead>
                <TableHead className="px-3 py-2.5 text-[9px] uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Month revenue
                </TableHead>
                <TableHead className="px-3 py-2.5 text-[9px] uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Effective commission
                </TableHead>
                <TableHead className="px-3 py-2.5 text-[9px] uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Payout
                </TableHead>
                <TableHead className="px-3 py-2.5 text-[9px] uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Linked
                </TableHead>
                <TableHead className="px-3 py-2.5 text-[9px] uppercase tracking-[0.14em] text-[#0B2E2F]/46">
                  Created
                </TableHead>
                <TableHead className="w-12 px-3 py-2.5" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredAffiliates.map((entry) => {
                const payoutPreview = buildPayoutDestinationPreview({
                  payoutMethod: entry.payoutMethod,
                  walletAddress: entry.walletAddress,
                  achAccountHolderName: entry.achAccountHolderName,
                  achBankName: entry.achBankName,
                  achAccountType: entry.achAccountType,
                  achRoutingNumberLast4: entry.achRoutingNumberLast4,
                  achAccountNumberLast4: entry.achAccountNumberLast4,
                });
                const payoutReady = hasCompletePayoutDestination({
                  payoutMethod: entry.payoutMethod,
                  walletAddress: entry.walletAddress,
                  achAccountHolderName: entry.achAccountHolderName,
                  achBankName: entry.achBankName,
                  achAccountType: entry.achAccountType,
                  achRoutingNumberLast4: entry.achRoutingNumberLast4,
                  achAccountNumberLast4: entry.achAccountNumberLast4,
                });

                return (
                <TableRow
                  key={entry.id}
                  className="border-b border-[#0B2E2F]/8 bg-[#FCFAF6] hover:bg-[#F5EFE4]"
                >
                  <TableCell className="px-3 py-2.5 align-top">
                    <input
                      type="checkbox"
                      checked={selectedAffiliateIds.includes(entry.id)}
                      disabled={
                        !(
                          entry.status === "approved" &&
                          entry.discountCode &&
                          entry.swellCouponId
                        )
                      }
                      onChange={(event) =>
                        toggleAffiliateSelection(entry.id, event.target.checked)
                      }
                      className="mt-1 size-4 rounded-none border-[#0B2E2F]/30 text-[#0B2E2F] focus:ring-0 disabled:opacity-40"
                      aria-label={`Select ${entry.code}`}
                    />
                  </TableCell>
                  <TableCell className="px-3 py-2.5 align-top">
                    <p className="font-mono text-xs font-semibold text-[#0B2E2F]">
                      {entry.code}
                    </p>
                  </TableCell>
                  <TableCell className="px-3 py-2.5 align-top">
                    <p className="text-xs font-semibold text-[#0B2E2F]">
                      {entry.name}
                    </p>
                    <p className="mt-1 text-xs text-[#0B2E2F]/58">
                      {entry.email}
                    </p>
                    {entry.socialProfiles.length ? (
                      <p className="mt-1 text-xs text-[#0B2E2F]/46">
                        {entry.socialProfiles.length} profile
                        {entry.socialProfiles.length === 1 ? "" : "s"}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 align-top">
                    <Badge
                      variant={statusBadgeVariant(entry.status)}
                      className="rounded-none px-2.5 py-1 text-[10px] uppercase tracking-[0.14em]"
                    >
                      {entry.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-3 py-2.5 align-top">
                    <p className="text-xs font-semibold text-[#0B2E2F]">
                      {formatDiscountSummary(entry)}
                    </p>
                    {entry.swellCouponId ? (
                      <p className="mt-1 font-mono text-[11px] text-[#0B2E2F]/42">
                        Coupon {entry.swellCouponId}
                      </p>
                    ) : null}
                    {entry.discountPercent ? (
                      <p className="mt-1 text-xs text-[#0B2E2F]/52">
                        {entry.discountPercent}% live
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 align-top text-xs text-[#0B2E2F]/62">
                    <p className="text-xs font-semibold text-[#0B2E2F]">
                      {formatCurrency(entry.currentMonthRevenue)}
                    </p>
                    <p className="mt-1 text-xs text-[#0B2E2F]/52">
                      {entry.currentMonthOrderCount} paid order
                      {entry.currentMonthOrderCount === 1 ? "" : "s"}
                    </p>
                  </TableCell>
                  <TableCell className="px-3 py-2.5 align-top text-xs text-[#0B2E2F]/62">
                    <p className="text-xs font-semibold text-[#0B2E2F]">
                      {formatCommissionPercent(entry.currentCommissionRate)}%
                    </p>
                    <p className="mt-1 text-xs text-[#0B2E2F]/52">
                      {entry.currentCommissionTier || "No month summary yet"}
                    </p>
                    {entry.currentCommissionOverride ? (
                      <Badge variant="secondary" className="mt-2 rounded-none">
                        Override
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-[220px] px-3 py-2.5 align-top text-[11px] text-[#0B2E2F]/48">
                    <p className="text-xs font-semibold text-[#0B2E2F]">
                      {getPayoutMethodShortLabel(entry.payoutMethod)}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-[#0B2E2F]/58">
                      {payoutPreview.title}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-[#0B2E2F]/46">
                      {payoutPreview.subtitle || (payoutReady ? "Ready" : "Missing details")}
                    </p>
                  </TableCell>
                  <TableCell className="px-3 py-2.5 align-top text-xs text-[#0B2E2F]/56">
                    {entry.userId ? "Connected" : "Not linked"}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 align-top text-xs text-[#0B2E2F]/56">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 align-top">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={loadingId === entry.id}
                          className="h-7 w-7 rounded-none border border-[#0B2E2F]/12 text-[#0B2E2F]/56 hover:bg-[#EFE7D8] hover:text-[#0B2E2F]"
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="rounded-none border-[#0B2E2F]/14 bg-[#FCFAF6] p-0.5"
                      >
                        <DropdownMenuItem
                          onClick={() => openAssignmentDialog(entry)}
                          className="rounded-none px-2.5 py-1.5 text-xs focus:bg-[#EFE7D8]"
                        >
                          {entry.status === "approved"
                            ? "Manage assignment"
                            : "Approve and assign"}
                        </DropdownMenuItem>
                        {entry.status !== "suspended" ? (
                          <DropdownMenuItem
                            onClick={() => {
                              openAssignmentDialog(entry);
                              setActiveTab("danger");
                              setDangerZoneMode("suspended");
                            }}
                            className="rounded-none px-2.5 py-1.5 text-xs focus:bg-[#EFE7D8]"
                          >
                            Suspend
                          </DropdownMenuItem>
                        ) : null}
                        {entry.status !== "rejected" ? (
                          <DropdownMenuItem
                            onClick={() =>
                              handleStatusChange(entry.id, "rejected")
                            }
                            className="rounded-none px-2.5 py-1.5 text-xs text-red-600 focus:bg-[#F6DDD8] focus:text-red-700"
                          >
                            Reject
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          onClick={() => {
                            openAssignmentDialog(entry);
                            setActiveTab("danger");
                            setDangerZoneMode("delete");
                          }}
                          className="rounded-none px-2.5 py-1.5 text-xs text-red-600 focus:bg-[#F6DDD8] focus:text-red-700"
                        >
                          Delete record
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )})}

              {filteredAffiliates.length === 0 ? (
                <TableRow className="border-b-0 bg-[#FCFAF6] hover:bg-[#FCFAF6]">
                  <TableCell
                    colSpan={11}
                    className="px-3 py-8 text-center text-xs text-[#0B2E2F]/52"
                  >
                    No affiliates match this filter.
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
