"use client";

import {
  startTransition,
  type Dispatch,
  type SetStateAction,
  useState,
} from "react";
import { CheckCircle2, Loader2, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";

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
  const [address, setAddress] = useState(getConfiguredWallet(currentWallet));
  return (
    <WalletFormContent
      currentWallet={currentWallet}
      address={address}
      setAddress={setAddress}
    />
  );
}

function WalletFormContent({
  currentWallet,
  address,
  setAddress,
  embedded = false,
}: {
  currentWallet: string;
  address: string;
  setAddress: Dispatch<SetStateAction<string>>;
  embedded?: boolean;
}) {
  const router = useRouter();
  const initialWallet = getConfiguredWallet(currentWallet);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAction, setLastSavedAction] = useState<
    "connected" | "updated" | null
  >(null);
  const [hasSavedWallet, setHasSavedWallet] = useState(Boolean(initialWallet));
  const [error, setError] = useState<string | null>(null);
  const successMessage =
    lastSavedAction === "connected"
      ? "Payout wallet saved."
      : "Payout wallet updated.";

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
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update.");
    } finally {
      setIsSaving(false);
    }
  }

  const content = (
    <form onSubmit={handleSave}>
      <div className="flex items-start gap-2.5 border-b border-[#0B2E2F]/10 pb-3">
        <div className={affiliateIconTileClass}>
          <Wallet className="size-4 text-[#0B2E2F]" />
        </div>

        <div>
          <h3 className="text-sm font-semibold tracking-tight text-[#0B2E2F]">
            Payout wallet
          </h3>
          <p className="mt-1 text-[11px] leading-4 text-[#0B2E2F]/62">
            We use USDC on Polygon because it is the fastest way to send Growth
            Partner payouts. Add a wallet you control that can receive USDC on
            Polygon.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_220px] lg:items-start">
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
            className={`${affiliateFieldClass} font-mono text-xs`}
          />
        </div>

        <div
          className={`${affiliateInsetClass} px-3 py-3 text-[11px] leading-4 text-[#0B2E2F]/62`}
        >
          Use a Polygon wallet that can receive USDC. Incorrect addresses will
          block payout delivery, and on-chain payouts are faster than handling
          manual payout details later.
        </div>
      </div>

      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}

      {lastSavedAction ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-[#0B2E2F]">
          <CheckCircle2 className="size-4" />
          {successMessage}
        </div>
      ) : null}

      <Button
        type="submit"
        className={`mt-3 ${affiliatePrimaryButtonClass}`}
        disabled={isSaving}
      >
        {isSaving ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Saving...
          </>
        ) : hasSavedWallet ? (
          "Update payout wallet"
        ) : (
          "Save payout wallet"
        )}
      </Button>
    </form>
  );

  if (embedded) {
    return content;
  }

  return <AffiliatePanel>{content}</AffiliatePanel>;
}

export function EmbeddedWalletForm({
  currentWallet,
}: {
  currentWallet: string;
}) {
  const [address, setAddress] = useState(getConfiguredWallet(currentWallet));

  return (
    <WalletFormContent
      currentWallet={currentWallet}
      address={address}
      setAddress={setAddress}
      embedded
    />
  );
}
