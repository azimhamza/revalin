"use client";

import {
  startTransition,
  type Dispatch,
  type SetStateAction,
  useState,
} from "react";
import {
  Building2,
  CheckCircle2,
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

import {
  ACH_PAYOUT_METHOD,
  CRYPTO_PAYOUT_METHOD,
  getPayoutMethodLabel,
  type AchAccountType,
  type PayoutMethod,
} from "@/lib/checkout/payout-methods";
import {
  AffiliatePanel,
  affiliateFieldClass,
  affiliateIconTileClass,
  affiliateInsetClass,
  affiliatePrimaryButtonClass,
} from "../_components/affiliate-shell";
import { getApiErrorMessage, readJsonSafely } from "@/lib/api/client";

type AffiliatePayoutSettingsFormProps = {
  currentMethod: PayoutMethod;
  currentWallet: string;
  achAccountHolderName: string | null;
  achBankName: string | null;
  achAccountType: AchAccountType | null;
  achRoutingNumberLast4: string | null;
  achAccountNumberLast4: string | null;
};

type PayoutSettingsFormState = {
  payoutMethod: PayoutMethod;
  walletAddress: string;
  achAccountHolderName: string;
  achBankName: string;
  achAccountType: AchAccountType;
  routingNumber: string;
  accountNumber: string;
};

export function WalletForm(props: AffiliatePayoutSettingsFormProps) {
  const [formState, setFormState] = useState<PayoutSettingsFormState>({
    payoutMethod: props.currentMethod,
    walletAddress: props.currentWallet,
    achAccountHolderName: props.achAccountHolderName ?? "",
    achBankName: props.achBankName ?? "",
    achAccountType: props.achAccountType ?? "checking",
    routingNumber: "",
    accountNumber: "",
  });

  return <WalletFormContent {...props} formState={formState} setFormState={setFormState} />;
}

function WalletFormContent({
  currentMethod,
  currentWallet,
  achAccountHolderName,
  achBankName,
  achAccountType,
  achRoutingNumberLast4,
  achAccountNumberLast4,
  formState,
  setFormState,
  embedded = false,
}: AffiliatePayoutSettingsFormProps & {
  formState: PayoutSettingsFormState;
  setFormState: Dispatch<SetStateAction<PayoutSettingsFormState>>;
  embedded?: boolean;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAction, setLastSavedAction] = useState<"saved" | "updated" | null>(
    null,
  );
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

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setLastSavedAction(null);

    try {
      const body =
        formState.payoutMethod === CRYPTO_PAYOUT_METHOD
          ? {
              payoutMethod: formState.payoutMethod,
              walletAddress: formState.walletAddress.trim(),
            }
          : {
              payoutMethod: formState.payoutMethod,
              achAccountHolderName: formState.achAccountHolderName.trim(),
              achBankName: formState.achBankName.trim(),
              achAccountType: formState.achAccountType,
              routingNumber: formState.routingNumber.trim(),
              accountNumber: formState.accountNumber.trim(),
            };

      const response = await fetch("/api/affiliate/payout-settings", {
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

      setLastSavedAction(hasExistingSettings ? "updated" : "saved");
      setFormState((current) => ({
        ...current,
        routingNumber: "",
        accountNumber: "",
      }));
      startTransition(() => {
        router.refresh();
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to update payout settings.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const successMessage =
    lastSavedAction === "updated"
      ? "Payout settings updated."
      : "Payout settings saved.";

  const achDetailsHint = [
    achRoutingNumberLast4
      ? `Leave routing number blank to keep the current one ending in ${achRoutingNumberLast4}.`
      : "Enter the routing number for the ACH payout account.",
    achAccountNumberLast4
      ? `Leave account number blank to keep the current one ending in ${achAccountNumberLast4}.`
      : "Enter the account number for the ACH payout account.",
  ].join(" ");

  const content = (
    <form onSubmit={handleSave}>
      <div className="flex items-start gap-2.5 border-b border-[#0B2E2F]/10 pb-3">
        <div className={affiliateIconTileClass}>
          {formState.payoutMethod === ACH_PAYOUT_METHOD ? (
            <Building2 className="size-4 text-[#0B2E2F]" />
          ) : (
            <Wallet className="size-4 text-[#0B2E2F]" />
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold tracking-tight text-[#0B2E2F]">
            Payout settings
          </h3>
          <p className="mt-1 text-[11px] leading-4 text-[#0B2E2F]/62">
            Choose how you want approved Growth Partner payouts sent, then keep the
            destination details for that method up to date.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start">
        <div className="space-y-2">
          <Label
            htmlFor="payout-method"
            className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/46"
          >
            Payout method
          </Label>
          <Select
            value={formState.payoutMethod}
            onValueChange={(value) =>
              setFormState((current) => ({
                ...current,
                payoutMethod: value as PayoutMethod,
              }))
            }
          >
            <SelectTrigger id="payout-method" className={affiliateFieldClass}>
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

        <div
          className={`${affiliateInsetClass} px-3 py-3 text-[11px] leading-4 text-[#0B2E2F]/62`}
        >
          {formState.payoutMethod === CRYPTO_PAYOUT_METHOD
            ? "Use a Polygon wallet you control that can receive USDC on Polygon."
            : "Enter the bank account you want us to use for ACH payouts."}
        </div>
      </div>

      {formState.payoutMethod === CRYPTO_PAYOUT_METHOD ? (
        <div className="mt-3 space-y-2">
          <div className="space-y-2">
            <Label
              htmlFor="wallet"
              className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/46"
            >
              Polygon wallet
            </Label>
            <Input
              id="wallet"
              value={formState.walletAddress}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  walletAddress: event.target.value,
                }))
              }
              placeholder="0x..."
              required
              pattern="^0x[a-fA-F0-9]{40}$"
              className={`${affiliateFieldClass} font-mono text-xs`}
            />
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label
                htmlFor="account-holder-name"
                className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/46"
              >
                Account holder name
              </Label>
              <Input
                id="account-holder-name"
                value={formState.achAccountHolderName}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    achAccountHolderName: event.target.value,
                  }))
                }
                placeholder="Name on the bank account"
                required
                className={affiliateFieldClass}
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="bank-name"
                className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/46"
              >
                Bank name
              </Label>
              <Input
                id="bank-name"
                value={formState.achBankName}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    achBankName: event.target.value,
                  }))
                }
                placeholder="Bank name"
                required
                className={affiliateFieldClass}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label
                htmlFor="account-type"
                className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/46"
              >
                Account type
              </Label>
              <Select
                value={formState.achAccountType}
                onValueChange={(value) =>
                  setFormState((current) => ({
                    ...current,
                    achAccountType: value as AchAccountType,
                  }))
                }
              >
                <SelectTrigger id="account-type" className={affiliateFieldClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="checking">Checking</SelectItem>
                  <SelectItem value="savings">Savings</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="routing-number"
                className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/46"
              >
                Routing number
              </Label>
              <Input
                id="routing-number"
                value={formState.routingNumber}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    routingNumber: event.target.value,
                  }))
                }
                placeholder={
                  achRoutingNumberLast4 ? `Keep current ending in ${achRoutingNumberLast4}` : "9 digits"
                }
                required={!achRoutingNumberLast4}
                className={`${affiliateFieldClass} font-mono text-xs`}
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="account-number"
                className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/46"
              >
                Account number
              </Label>
              <Input
                id="account-number"
                value={formState.accountNumber}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    accountNumber: event.target.value,
                  }))
                }
                placeholder={
                  achAccountNumberLast4 ? `Keep current ending in ${achAccountNumberLast4}` : "Account number"
                }
                required={!achAccountNumberLast4}
                className={`${affiliateFieldClass} font-mono text-xs`}
              />
            </div>
          </div>

          <div
            className={`${affiliateInsetClass} flex gap-2 px-3 py-3 text-[11px] leading-4 text-[#0B2E2F]/62`}
          >
            <Landmark className="mt-0.5 size-4 shrink-0 text-[#0B2E2F]" />
            <div className="space-y-1">
              <p>Routing and account numbers are encrypted when stored.</p>
              <p>{achDetailsHint}</p>
            </div>
          </div>
        </div>
      )}

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
        ) : hasExistingSettings ? (
          "Update payout settings"
        ) : (
          "Save payout settings"
        )}
      </Button>
    </form>
  );

  if (embedded) {
    return content;
  }

  return <AffiliatePanel>{content}</AffiliatePanel>;
}

export function EmbeddedWalletForm(props: AffiliatePayoutSettingsFormProps) {
  const [formState, setFormState] = useState<PayoutSettingsFormState>({
    payoutMethod: props.currentMethod,
    walletAddress: props.currentWallet,
    achAccountHolderName: props.achAccountHolderName ?? "",
    achBankName: props.achBankName ?? "",
    achAccountType: props.achAccountType ?? "checking",
    routingNumber: "",
    accountNumber: "",
  });

  return (
    <WalletFormContent
      {...props}
      formState={formState}
      setFormState={setFormState}
      embedded
    />
  );
}
