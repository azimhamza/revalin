"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  AffiliatePanel,
  affiliateFieldClass,
  affiliateIconTileClass,
  affiliateInsetClass,
  affiliatePrimaryButtonClass,
} from "../_components/affiliate-shell";
import { getConfiguredWallet } from "../wallet-utils";

export function WalletForm({ currentWallet }: { currentWallet: string }) {
  const initialWallet = getConfiguredWallet(currentWallet);
  const [address, setAddress] = useState(initialWallet);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAction, setLastSavedAction] = useState<
    "connected" | "updated" | null
  >(null);
  const [hasSavedWallet, setHasSavedWallet] = useState(Boolean(initialWallet));
  const [error, setError] = useState<string | null>(null);
  const successMessage =
    lastSavedAction === "connected"
      ? "Wallet connected successfully."
      : "Wallet updated successfully.";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const normalizedAddress = address.trim();

    setIsSaving(true);
    setError(null);
    setLastSavedAction(null);

    try {
      const res = await fetch("/api/affiliate/update-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: normalizedAddress }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update wallet.");
      }

      setAddress(normalizedAddress);
      setLastSavedAction(hasSavedWallet ? "updated" : "connected");
      setHasSavedWallet(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AffiliatePanel>
      <form onSubmit={handleSave}>
        <div className="flex items-start gap-3 border-b border-[#0B2E2F]/10 pb-5">
          <div className={affiliateIconTileClass}>
            <Wallet className="size-4 text-[#0B2E2F]" />
          </div>

          <div>
            <h3 className="text-lg font-semibold tracking-tight text-[#0B2E2F]">
              USDC Polygon wallet
            </h3>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_220px] lg:items-start">
          <div className="space-y-2">
            <Label
              htmlFor="wallet"
              className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/46"
            >
              Wallet address
            </Label>
            <Input
              id="wallet"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setLastSavedAction(null);
              }}
              placeholder="0x..."
              required
              pattern="^0x[a-fA-F0-9]{40}$"
              className={`${affiliateFieldClass} font-mono text-sm`}
            />
          </div>

          <div
            className={`${affiliateInsetClass} px-4 py-4 text-sm text-[#0B2E2F]/62`}
          >
            Use a Polygon wallet that can receive USDC. Incorrect addresses will
            block payout delivery.
          </div>
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        {lastSavedAction ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-[#0B2E2F]">
            <CheckCircle2 className="size-4" />
            {successMessage}
          </div>
        ) : null}

        <Button
          type="submit"
          className={`mt-5 h-11 px-5 text-sm font-semibold ${affiliatePrimaryButtonClass}`}
          disabled={isSaving}
        >
          {isSaving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving...
            </>
          ) : hasSavedWallet ? (
            "Update wallet"
          ) : (
            "Connect wallet"
          )}
        </Button>
      </form>
    </AffiliatePanel>
  );
}
