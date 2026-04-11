"use client";

import { useState } from "react";
import { CheckCircle2, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiErrorMessage, readJsonSafely } from "@/lib/api/client";

type SocialProfile = {
  platform: string;
  url: string;
};

function createEmptySocialProfile(): SocialProfile {
  return { platform: "", url: "" };
}

const fieldClass =
  "h-9 rounded-none border-[#0B2E2F]/12 bg-[#FCFAF6] text-[13px] shadow-none placeholder:text-[#0B2E2F]/35 focus-visible:border-[#0B2E2F]/36 focus-visible:ring-0";
const primaryButtonClass =
  "h-9 rounded-none border border-[#0B2E2F] bg-[#0B2E2F] px-3 text-[11px] uppercase tracking-[0.14em] text-[#F4F1EA] hover:bg-[#173d3e]";
const secondaryButtonClass =
  "h-9 rounded-none border border-[#0B2E2F]/12 bg-[#FCFAF6] px-3 text-[11px] uppercase tracking-[0.14em] text-[#0B2E2F] hover:bg-white";

export function PromoterTrackingLinks({
  primaryCode,
  primaryLink,
  promoterCode,
  promoterLink,
  affiliateCode,
  affiliateLink,
}: {
  primaryCode: string;
  primaryLink: string;
  promoterCode: string;
  promoterLink: string;
  affiliateCode: string | null;
  affiliateLink: string | null;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copyValue(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="border border-[#0B2E2F]/10 bg-[#FCFAF6] px-3 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
          Primary Growth Partner invite link
        </p>
        <p className="mt-2 font-mono text-sm font-semibold text-[#0B2E2F]">
          {primaryCode}
        </p>
        <code className="mt-1 block break-all text-xs text-[#0B2E2F]/62">
          {primaryLink}
        </code>
        <Button
          type="button"
          variant="outline"
          className={`${secondaryButtonClass} mt-3`}
          onClick={() => copyValue("primary", primaryLink)}
        >
          <Copy className="size-4" />
          {copied === "primary" ? "Copied" : "Copy link"}
        </Button>
      </div>

      {affiliateCode && affiliateLink ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="border border-[#0B2E2F]/10 bg-white px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
              Promoter + Growth Partner code
            </p>
            <p className="mt-2 font-mono text-sm font-semibold text-[#0B2E2F]">
              {affiliateCode}
            </p>
            <Button
              type="button"
              variant="outline"
              className={`${secondaryButtonClass} mt-3`}
              onClick={() => copyValue("affiliate", affiliateLink)}
            >
              <Copy className="size-4" />
              {copied === "affiliate" ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="border border-[#0B2E2F]/10 bg-white px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/46">
              Promoter-only backup code
            </p>
            <p className="mt-2 font-mono text-sm font-semibold text-[#0B2E2F]">
              {promoterCode}
            </p>
            <Button
              type="button"
              variant="outline"
              className={`${secondaryButtonClass} mt-3`}
              onClick={() => copyValue("promoter", promoterLink)}
            >
              <Copy className="size-4" />
              {copied === "promoter" ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PromoterInviteForm() {
  const router = useRouter();
  const [invitedName, setInvitedName] = useState("");
  const [invitedEmail, setInvitedEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [socialProfiles, setSocialProfiles] = useState<SocialProfile[]>([
    createEmptySocialProfile(),
  ]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateSocialProfile(index: number, field: keyof SocialProfile, value: string) {
    setSocialProfiles((current) =>
      current.map((profile, currentIndex) =>
        currentIndex === index ? { ...profile, [field]: value } : profile,
      ),
    );
  }

  async function submitInvite(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/promoter/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invitedName,
          invitedEmail,
          notes,
          socialProfiles: socialProfiles.filter(
            (profile) => profile.platform.trim() && profile.url.trim(),
          ),
        }),
      });
      const payload = await readJsonSafely(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to send invite."));
      }
      setInvitedName("");
      setInvitedEmail("");
      setNotes("");
      setSocialProfiles([createEmptySocialProfile()]);
      setMessage("Invite sent.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to send invite.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submitInvite} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Growth Partner name</Label>
          <Input value={invitedName} onChange={(e) => setInvitedName(e.target.value)} className={fieldClass} />
        </div>
        <div className="space-y-1.5">
          <Label>Growth Partner email</Label>
          <Input value={invitedEmail} onChange={(e) => setInvitedEmail(e.target.value)} className={fieldClass} required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldClass} placeholder="Instagram handle, context, or outreach notes" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Social references</Label>
          <Button
            type="button"
            variant="outline"
            className={secondaryButtonClass}
            disabled={socialProfiles.length >= 6}
            onClick={() => setSocialProfiles((current) => [...current, createEmptySocialProfile()])}
          >
            <Plus className="size-4" />
            Add
          </Button>
        </div>
        {socialProfiles.map((profile, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[160px_1fr_auto]">
            <Input
              value={profile.platform}
              onChange={(e) => updateSocialProfile(index, "platform", e.target.value)}
              className={fieldClass}
              placeholder="Instagram"
            />
            <Input
              value={profile.url}
              onChange={(e) => updateSocialProfile(index, "url", e.target.value)}
              className={fieldClass}
              placeholder="https://instagram.com/account"
            />
            <Button
              type="button"
              variant="outline"
              className={secondaryButtonClass}
              disabled={socialProfiles.length === 1}
              onClick={() =>
                setSocialProfiles((current) =>
                  current.filter((_, currentIndex) => currentIndex !== index),
                )
              }
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      {message ? (
        <p className="flex items-center gap-2 text-xs text-emerald-700">
          <CheckCircle2 className="size-4" />
          {message}
        </p>
      ) : null}
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <Button type="submit" className={primaryButtonClass} disabled={loading || !invitedEmail.trim()}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : null}
        Send invite
      </Button>
    </form>
  );
}

export function PromoterWalletForm({ currentWallet }: { currentWallet: string }) {
  const router = useRouter();
  const [wallet, setWallet] = useState(currentWallet);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveWallet(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/promoter/payout-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet }),
      });
      const payload = await readJsonSafely(response);
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to update wallet."));
      }
      setMessage("Payout wallet saved.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to update wallet.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={saveWallet} className="space-y-3">
      <div className="space-y-1.5">
        <Label>Polygon USDC wallet</Label>
        <Input
          value={wallet}
          onChange={(event) => setWallet(event.target.value)}
          className={`${fieldClass} font-mono text-xs`}
          placeholder="0x..."
          required
          pattern="^0x[a-fA-F0-9]{40}$"
        />
      </div>
      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <Button type="submit" className={primaryButtonClass} disabled={loading || !wallet.trim()}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : null}
        Save payout wallet
      </Button>
    </form>
  );
}
