"use client";

import { useState } from "react";
import { CheckCircle2, Copy, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiErrorMessage, readJsonSafely } from "@/lib/api/client";

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
