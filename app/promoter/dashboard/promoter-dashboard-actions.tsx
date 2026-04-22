"use client";

import { useState } from "react";
import {
  Building2,
  CheckCircle2,
  Copy,
  Landmark,
  Loader2,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getApiErrorMessage, readJsonSafely } from "@/lib/api/client";
import {
  ACH_PAYOUT_METHOD,
  CRYPTO_PAYOUT_METHOD,
  getPayoutMethodLabel,
  type AchAccountType,
  type PayoutMethod,
} from "@/lib/checkout/payout-methods";

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

export function PromoterWalletForm({
  currentMethod,
  currentWallet,
  achAccountHolderName,
  achBankName,
  achAccountType,
  achRoutingNumberLast4,
  achAccountNumberLast4,
}: {
  currentMethod: PayoutMethod;
  currentWallet: string;
  achAccountHolderName: string | null;
  achBankName: string | null;
  achAccountType: AchAccountType | null;
  achRoutingNumberLast4: string | null;
  achAccountNumberLast4: string | null;
}) {
  const router = useRouter();
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>(currentMethod);
  const [wallet, setWallet] = useState(currentWallet);
  const [accountHolderName, setAccountHolderName] = useState(
    achAccountHolderName ?? "",
  );
  const [bankName, setBankName] = useState(achBankName ?? "");
  const [accountType, setAccountType] = useState<AchAccountType>(
    achAccountType ?? "checking",
  );
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasExistingSettings =
    currentMethod === CRYPTO_PAYOUT_METHOD
      ? Boolean(currentWallet.trim())
      : Boolean(
          achAccountHolderName?.trim() &&
            achBankName?.trim() &&
            achAccountType &&
            achRoutingNumberLast4 &&
            achAccountNumberLast4,
        );

  async function saveWallet(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const body =
        payoutMethod === CRYPTO_PAYOUT_METHOD
          ? {
              payoutMethod,
              walletAddress: wallet.trim(),
            }
          : {
              payoutMethod,
              achAccountHolderName: accountHolderName.trim(),
              achBankName: bankName.trim(),
              achAccountType: accountType,
              routingNumber: routingNumber.trim(),
              accountNumber: accountNumber.trim(),
            };
      const response = await fetch("/api/promoter/payout-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await readJsonSafely(response);
      if (!response.ok) {
        throw new Error(
          getApiErrorMessage(payload, "Failed to update payout settings."),
        );
      }
      setRoutingNumber("");
      setAccountNumber("");
      setMessage(
        hasExistingSettings
          ? "Payout settings updated."
          : "Payout settings saved.",
      );
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to update payout settings.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={saveWallet} className="space-y-3">
      <div className="space-y-1.5">
        <Label>Payout method</Label>
        <Select
          value={payoutMethod}
          onValueChange={(value) => setPayoutMethod(value as PayoutMethod)}
        >
          <SelectTrigger className={fieldClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value={CRYPTO_PAYOUT_METHOD}>
              {getPayoutMethodLabel(CRYPTO_PAYOUT_METHOD)}
            </SelectItem>
            <SelectItem value={ACH_PAYOUT_METHOD}>
              ACH bank transfer (5% fee)
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] leading-4 text-[#0B2E2F]/62">
          ACH payouts incur a 5% payout fee because we have to withdraw funds
          from our crypto payout account and cover bank transfer and withdrawal
          fees. Crypto payouts do not have this fee.
        </p>
      </div>

      {payoutMethod === CRYPTO_PAYOUT_METHOD ? (
        <>
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
          <div className="border border-[#0B2E2F]/10 bg-[#FCFAF6] px-3 py-3 text-[11px] leading-4 text-[#0B2E2F]/62">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0B2E2F]">
              <Wallet className="size-4" />
              Crypto payouts
            </div>
            <p className="mt-2">
              Use a Polygon wallet you control that can receive USDC on Polygon.
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Account holder name</Label>
              <Input
                value={accountHolderName}
                onChange={(event) => setAccountHolderName(event.target.value)}
                className={fieldClass}
                placeholder="Name on the bank account"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Bank name</Label>
              <Input
                value={bankName}
                onChange={(event) => setBankName(event.target.value)}
                className={fieldClass}
                placeholder="Bank name"
                required
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Account type</Label>
              <Select
                value={accountType}
                onValueChange={(value) => setAccountType(value as AchAccountType)}
              >
                <SelectTrigger className={fieldClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="checking">Checking</SelectItem>
                  <SelectItem value="savings">Savings</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Routing number</Label>
              <Input
                value={routingNumber}
                onChange={(event) => setRoutingNumber(event.target.value)}
                className={`${fieldClass} font-mono text-xs`}
                placeholder={
                  achRoutingNumberLast4
                    ? `Keep current ending in ${achRoutingNumberLast4}`
                    : "9 digits"
                }
                required={!achRoutingNumberLast4}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Account number</Label>
              <Input
                value={accountNumber}
                onChange={(event) => setAccountNumber(event.target.value)}
                className={`${fieldClass} font-mono text-xs`}
                placeholder={
                  achAccountNumberLast4
                    ? `Keep current ending in ${achAccountNumberLast4}`
                    : "Account number"
                }
                required={!achAccountNumberLast4}
              />
            </div>
          </div>

          <div className="border border-[#0B2E2F]/10 bg-[#FCFAF6] px-3 py-3 text-[11px] leading-4 text-[#0B2E2F]/62">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0B2E2F]">
              <Building2 className="size-4" />
              ACH bank transfer
            </div>
            <div className="mt-2 flex gap-2">
              <Landmark className="mt-0.5 size-4 shrink-0 text-[#0B2E2F]" />
              <div className="space-y-1">
                <p>Routing and account numbers are encrypted when stored.</p>
                <p>
                  {achRoutingNumberLast4
                    ? `Leave routing number blank to keep the current one ending in ${achRoutingNumberLast4}. `
                    : "Routing number is required for ACH payouts. "}
                  {achAccountNumberLast4
                    ? `Leave account number blank to keep the current one ending in ${achAccountNumberLast4}.`
                    : "Account number is required for ACH payouts."}
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <Button
        type="submit"
        className={primaryButtonClass}
        disabled={loading || (payoutMethod === CRYPTO_PAYOUT_METHOD && !wallet.trim())}
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : null}
        Save payout settings
      </Button>
    </form>
  );
}
