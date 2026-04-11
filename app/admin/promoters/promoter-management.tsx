"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Search } from "lucide-react";
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
import type {
  PromoterAffiliateCandidate,
  PromoterRecord,
} from "@/lib/checkout/promoter-service";
import {
  adminFieldClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  AdminPanel,
  AdminSectionHeader,
  AdminStatCard,
} from "../_components/admin-shell";

type SocialProfile = {
  platform: string;
  url: string;
};

type AdminInviteRow = {
  invite: {
    id: string;
    promoterId: string;
    invitedAffiliateId: string | null;
    invitedName: string | null;
    invitedEmail: string;
    normalizedInvitedEmail: string;
    socialProfiles: SocialProfile[];
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

function formatRate(value: string | null | undefined) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "-";
  return `${Number((numeric * 100).toFixed(2))}%`;
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

function formatSocialProfiles(profiles: SocialProfile[]) {
  return profiles
    .filter((profile) => profile.platform.trim() && profile.url.trim())
    .map((profile) => `${profile.platform}: ${profile.url}`)
    .join(" | ");
}

export function PromoterManagement({
  promoters,
  invites,
  initialOpenUserId,
  initialOpenPromoterId,
}: {
  promoters: PromoterRecord[];
  invites: AdminInviteRow[];
  initialOpenUserId: string | null;
  initialOpenPromoterId: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createRate, setCreateRate] = useState("2.5");
  const [invitePromoterId, setInvitePromoterId] = useState(
    initialOpenPromoterId || promoters[0]?.id || "",
  );
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSocialPlatform, setInviteSocialPlatform] = useState("Instagram");
  const [inviteSocialUrl, setInviteSocialUrl] = useState("");
  const [inviteNotes, setInviteNotes] = useState("");
  const [mappingInvite, setMappingInvite] = useState<AdminInviteRow | null>(null);
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidates, setCandidates] = useState<PromoterAffiliateCandidate[]>([]);
  const [selectedAffiliateId, setSelectedAffiliateId] = useState("");
  const [mappingRate, setMappingRate] = useState("2.5");
  const [mappingNotes, setMappingNotes] = useState("");
  const [mappingLoading, setMappingLoading] = useState(false);
  const [reinstatementPromoter, setReinstatementPromoter] =
    useState<PromoterRecord | null>(null);
  const [reinstatementReason, setReinstatementReason] = useState("");
  const [removalPromoter, setRemovalPromoter] = useState<PromoterRecord | null>(
    null,
  );
  const [removalStatus, setRemovalStatus] = useState<
    "suspended" | "rejected"
  >("suspended");
  const [removalReason, setRemovalReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      promoters: promoters.length,
      invites: invites.length,
      successful: invites.filter((entry) => entry.invite.status === "successful").length,
      walletReady: promoters.filter((entry) => entry.walletAddress.trim()).length,
    }),
    [invites, promoters],
  );
  const selectedMappingCandidate = candidates.find(
    (candidate) => candidate.id === selectedAffiliateId,
  );
  const canActivatePromoterCommission =
    Boolean(selectedAffiliateId) && selectedMappingCandidate?.status === "approved";

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
        if (!cancelled) router.refresh();
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
  }, [initialOpenUserId, router]);

  async function createPromoter() {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/promoters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: createName,
          email: createEmail,
          defaultCommissionRate: createRate,
        }),
      });
      const payload = await readJsonSafely(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to create promoter."));
      }
      setCreateName("");
      setCreateEmail("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to create promoter.");
    } finally {
      setLoading(false);
    }
  }

  async function createInvite() {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/promoters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_invite",
          promoterId: invitePromoterId,
          invitedName: inviteName,
          invitedEmail: inviteEmail,
          socialProfiles:
            inviteSocialPlatform.trim() && inviteSocialUrl.trim()
              ? [
                  {
                    platform: inviteSocialPlatform,
                    url: inviteSocialUrl,
                  },
                ]
              : [],
          notes: inviteNotes,
        }),
      });
      const payload = await readJsonSafely(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to create invite."));
      }
      setInviteName("");
      setInviteEmail("");
      setInviteSocialPlatform("Instagram");
      setInviteSocialUrl("");
      setInviteNotes("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to create invite.");
    } finally {
      setLoading(false);
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

  async function updateStatus(args: {
    promoterId: string;
    status: PromoterRecord["status"];
    reinstatementReason?: string;
    sendReinstatementEmail?: boolean;
    removalReason?: string;
    sendRemovalEmail?: boolean;
  }) {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/promoters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_status",
          promoterId: args.promoterId,
          status: args.status,
          reinstatementReason: args.reinstatementReason,
          sendReinstatementEmail: args.sendReinstatementEmail,
          removalReason: args.removalReason,
          sendRemovalEmail: args.sendRemovalEmail,
        }),
      });
      const payload = await readJsonSafely(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to update promoter."));
      }
      setReinstatementPromoter(null);
      setReinstatementReason("");
      setRemovalPromoter(null);
      setRemovalReason("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to update promoter.");
    } finally {
      setLoading(false);
    }
  }

  async function sendLinkUpdateEmail(promoter: PromoterRecord) {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/promoters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_link_update_email",
          promoterId: promoter.id,
        }),
      });
      const payload = await readJsonSafely(response);
      if (!response.ok) {
        throw new Error(
          getApiErrorMessage(payload, "Failed to send link update email."),
        );
      }
      setNotice(`Link update email sent to ${promoter.email}.`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to send link update email.",
      );
    } finally {
      setLoading(false);
    }
  }

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
        <AdminStatCard label="Wallets ready" value={counts.walletReady} size="compact" />
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

      <div className="grid gap-3 xl:grid-cols-2">
        <AdminPanel className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Create promoter</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={createName} onChange={(e) => setCreateName(e.target.value)} className={adminFieldClass} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} className={adminFieldClass} />
            </div>
            <div className="space-y-1.5">
              <Label>Default %</Label>
              <Input value={createRate} onChange={(e) => setCreateRate(e.target.value)} className={adminFieldClass} />
            </div>
          </div>
          <Button
            type="button"
            className={adminPrimaryButtonClass}
            disabled={loading || !createName.trim() || !createEmail.trim()}
            onClick={createPromoter}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            Save promoter
          </Button>
        </AdminPanel>

        <AdminPanel className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Send invite</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Promoter</Label>
              <select
                value={invitePromoterId}
                onChange={(event) => setInvitePromoterId(event.target.value)}
                className={adminFieldClass}
              >
                {promoters.map((promoter) => (
                  <option key={promoter.id} value={promoter.id}>
                    {promoter.name} ({promoter.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Invited email</Label>
              <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className={adminFieldClass} />
            </div>
            <div className="space-y-1.5">
              <Label>Invited name</Label>
              <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} className={adminFieldClass} />
            </div>
            <div className="space-y-1.5">
              <Label>Social platform</Label>
              <Input value={inviteSocialPlatform} onChange={(e) => setInviteSocialPlatform(e.target.value)} className={adminFieldClass} placeholder="Instagram" />
            </div>
            <div className="space-y-1.5">
              <Label>Social profile URL</Label>
              <Input value={inviteSocialUrl} onChange={(e) => setInviteSocialUrl(e.target.value)} className={adminFieldClass} placeholder="https://instagram.com/account" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={inviteNotes} onChange={(e) => setInviteNotes(e.target.value)} className={adminFieldClass} />
            </div>
          </div>
          <Button
            type="button"
            className={adminPrimaryButtonClass}
            disabled={loading || !invitePromoterId || !inviteEmail.trim()}
            onClick={createInvite}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            Send invite
          </Button>
        </AdminPanel>
      </div>

      <AdminPanel className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Promoter</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Default rate</TableHead>
              <TableHead>Wallet</TableHead>
              <TableHead className="w-[220px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {promoters.map((promoter) => (
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
                  {promoter.walletAddress.trim() ? "Wallet on file" : "No wallet on file"}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {promoter.status === "approved" ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          className={adminSecondaryButtonClass}
                          disabled={loading}
                          onClick={() => sendLinkUpdateEmail(promoter)}
                        >
                          Email link update
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className={adminSecondaryButtonClass}
                          disabled={loading}
                          onClick={() => {
                            setRemovalPromoter(promoter);
                            setRemovalStatus("suspended");
                            setRemovalReason("");
                          }}
                        >
                          Suspend
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className={adminSecondaryButtonClass}
                          disabled={loading}
                          onClick={() => {
                            setRemovalPromoter(promoter);
                            setRemovalStatus("rejected");
                            setRemovalReason("");
                          }}
                        >
                          Remove
                        </Button>
                      </>
                    ) : promoter.status === "pending" ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          className={adminSecondaryButtonClass}
                          disabled={loading}
                          onClick={() =>
                            updateStatus({
                              promoterId: promoter.id,
                              status: "approved",
                              sendReinstatementEmail: false,
                            })
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className={adminSecondaryButtonClass}
                          disabled={loading}
                          onClick={() => {
                            setRemovalPromoter(promoter);
                            setRemovalStatus("rejected");
                            setRemovalReason("");
                          }}
                        >
                          Reject
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className={adminSecondaryButtonClass}
                        disabled={loading}
                        onClick={() => {
                          setReinstatementPromoter(promoter);
                          setReinstatementReason("");
                        }}
                      >
                        Reinstate
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {promoters.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                  No promoters yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </AdminPanel>

      <AdminPanel className="overflow-hidden p-0">
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
            {invites.map((entry) => (
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
            {invites.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-xs text-muted-foreground">
                  No promoter invites yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </AdminPanel>

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

      <Dialog
        open={Boolean(removalPromoter)}
        onOpenChange={(open) => {
          if (!open) {
            setRemovalPromoter(null);
            setRemovalReason("");
          }
        }}
      >
        <DialogContent className="max-w-lg rounded-none">
          <DialogHeader>
            <DialogTitle>
              {removalStatus === "suspended"
                ? "Suspend promoter access"
                : "Remove promoter access"}
            </DialogTitle>
          </DialogHeader>
          {removalPromoter ? (
            <div className="space-y-4">
              <div className="rounded-none border border-border bg-muted/40 px-3 py-2 text-xs">
                <p className="font-semibold text-foreground">
                  {removalPromoter.name}
                </p>
                <p className="text-muted-foreground">
                  {removalPromoter.email}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>
                  {removalStatus === "suspended"
                    ? "Suspension reason"
                    : "Removal reason"}
                </Label>
                <Input
                  value={removalReason}
                  onChange={(event) => setRemovalReason(event.target.value)}
                  className={adminFieldClass}
                  placeholder={
                    removalStatus === "suspended"
                      ? "Explain why promoter access is being suspended"
                      : "Explain why promoter access is being removed"
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Sent in the promoter access email as removal_reason.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className={adminSecondaryButtonClass}
                  onClick={() => {
                    setRemovalPromoter(null);
                    setRemovalReason("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className={adminPrimaryButtonClass}
                  disabled={loading || !removalReason.trim()}
                  onClick={() =>
                    updateStatus({
                      promoterId: removalPromoter.id,
                      status: removalStatus,
                      removalReason,
                      sendRemovalEmail: true,
                    })
                  }
                >
                  {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                  {removalStatus === "suspended"
                    ? "Suspend and email"
                    : "Remove and email"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(reinstatementPromoter)}
        onOpenChange={(open) => {
          if (!open) {
            setReinstatementPromoter(null);
            setReinstatementReason("");
          }
        }}
      >
        <DialogContent className="max-w-lg rounded-none">
          <DialogHeader>
            <DialogTitle>Reinstate promoter access</DialogTitle>
          </DialogHeader>
          {reinstatementPromoter ? (
            <div className="space-y-4">
              <div className="rounded-none border border-border bg-muted/40 px-3 py-2 text-xs">
                <p className="font-semibold text-foreground">
                  {reinstatementPromoter.name}
                </p>
                <p className="text-muted-foreground">
                  {reinstatementPromoter.email}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Reinstatement reason</Label>
                <Input
                  value={reinstatementReason}
                  onChange={(event) => setReinstatementReason(event.target.value)}
                  className={adminFieldClass}
                  placeholder="Explain why promoter access is being reinstated"
                />
                <p className="text-[11px] text-muted-foreground">
                  Sent in the promoter reinstatement email.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className={adminSecondaryButtonClass}
                  onClick={() => {
                    setReinstatementPromoter(null);
                    setReinstatementReason("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className={adminPrimaryButtonClass}
                  disabled={loading || !reinstatementReason.trim()}
                  onClick={() =>
                    updateStatus({
                      promoterId: reinstatementPromoter.id,
                      status: "approved",
                      reinstatementReason,
                      sendReinstatementEmail: true,
                    })
                  }
                >
                  {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                  Reinstate and email
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
