"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  CheckCircle2,
  Mail,
  MapPinHouse,
  Phone,
  Wallet,
} from "lucide-react";
import {
  QUICK_PAYMENT_CURRENCIES,
  SHIPPING_COUNTRIES,
} from "@/lib/checkout/constants";
import { cn } from "@/lib/utils";
import {
  accountFieldClass,
  accountIconFrameClass,
  accountIconTileClass,
  accountInsetClass,
  accountMutedPanelClass,
  accountPanelClass,
  accountPrimaryButtonClass,
  accountSelectClass,
} from "../account-theme";
import {
  splitUserName,
  formatPaymentCurrencyLabel,
  type AccountCryptoPreferences,
  type AccountShippingAddress,
} from "../account-utils";
import { getApiErrorMessage, readJsonSafely } from "@/lib/api/client";

type ShippingAddress = AccountShippingAddress;

const DEFAULT_ADDRESS: ShippingAddress = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  province: "",
  postalCode: "",
  country: "CA",
};

const countryAliases = new Map<string, string>([
  ["usa", "US"],
  ["u.s.a.", "US"],
  ["united states of america", "US"],
  ["uk", "GB"],
  ["u.k.", "GB"],
]);

function normalizeCountryValue(value?: string | null) {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return DEFAULT_ADDRESS.country;
  }

  const upper = trimmed.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) {
    return upper;
  }

  const aliasMatch = countryAliases.get(trimmed.toLowerCase());
  if (aliasMatch) {
    return aliasMatch;
  }

  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    const matchedCountry = SHIPPING_COUNTRIES.find((country) => {
      const label = displayNames.of(country.code);
      return label?.toLowerCase() === trimmed.toLowerCase();
    });

    return matchedCountry?.code || DEFAULT_ADDRESS.country;
  } catch {
    return DEFAULT_ADDRESS.country;
  }
}

export function ProfileForm({
  userName,
  userEmail,
  savedAddress,
  savedCryptoPreferences,
}: {
  userName: string;
  userEmail: string;
  savedAddress: ShippingAddress | null;
  savedCryptoPreferences: AccountCryptoPreferences;
}) {
  const nameParts = splitUserName(userName);
  const countryOptions = useMemo(() => {
    try {
      const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
      return SHIPPING_COUNTRIES.map((country) => ({
        code: country.code,
        label: displayNames.of(country.code) || country.code,
      }));
    } catch {
      return SHIPPING_COUNTRIES;
    }
  }, []);

  const [address, setAddress] = useState<ShippingAddress>(
    savedAddress
      ? {
          ...savedAddress,
          country: normalizeCountryValue(savedAddress.country),
        }
      : {
          ...DEFAULT_ADDRESS,
          email: userEmail,
          firstName: nameParts.firstName,
          lastName: nameParts.lastName,
        },
  );
  const [preferredPaymentCurrency, setPreferredPaymentCurrency] = useState(
    savedCryptoPreferences.preferredPaymentCurrency,
  );
  const [cryptoWalletAddress, setCryptoWalletAddress] = useState(
    savedCryptoPreferences.cryptoWalletAddress,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = (name: keyof ShippingAddress, value: string) => {
    setAddress((prev) => ({ ...prev, [name]: value }));
    setSuccess(false);
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...address,
          preferredPaymentCurrency,
          cryptoWalletAddress,
        }),
      });
      const payload = await readJsonSafely(res);

      if (!res.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to save profile."));
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setIsSaving(false);
    }
  }

  const fields: {
    label: string;
    name: keyof ShippingAddress;
    type?: string;
    required?: boolean;
    placeholder?: string;
  }[] = [
    { label: "First name", name: "firstName", required: true },
    { label: "Last name", name: "lastName", required: true },
    { label: "Email", name: "email", type: "email", required: true },
    { label: "Phone", name: "phone", type: "tel", required: true },
    { label: "Address", name: "address1", required: true },
    { label: "Apt / Suite", name: "address2", placeholder: "Optional" },
    { label: "City", name: "city", required: true },
    { label: "Province / State", name: "province" },
    { label: "Postal code", name: "postalCode", required: true },
    { label: "Country", name: "country", required: true },
  ];

  return (
    <form onSubmit={handleSave} className={`${accountPanelClass} p-5 sm:p-6`}>
      <div className="grid gap-4 lg:grid-cols-[0.72fr_1fr]">
        <div className={`${accountMutedPanelClass} p-5`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/45">
            Signed in as
          </p>
          <p className="mt-3 text-xl font-semibold tracking-tight text-[#0B2E2F]">
            {userName}
          </p>
          <div className="mt-4 space-y-3 text-sm text-foreground/60">
            <div
              className={`flex items-start gap-3 ${accountInsetClass} px-3.5 py-3`}
            >
              <Mail className="mt-0.5 size-4 shrink-0 text-[#0B2E2F]" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/45">
                  Account email
                </p>
                <p className="mt-1 break-words font-semibold text-[#0B2E2F]">
                  {userEmail}
                </p>
              </div>
            </div>
            <div
              className={`flex items-start gap-3 ${accountInsetClass} px-3.5 py-3`}
            >
              <Phone className="mt-0.5 size-4 shrink-0 text-[#0B2E2F]" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/45">
                  Checkout readiness
                </p>
                <p className="mt-1 leading-6">
                  Keep your phone and shipping details updated for delivery and
                  support issues.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 border border-[#0B2E2F]/12 bg-[#0B2E2F] px-3.5 py-3 text-[#F4F1EA] shadow-[0_18px_50px_rgba(11,46,47,0.14)]">
              <MapPinHouse className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F4F1EA]/55">
                  Shipping details
                </p>
                <p className="mt-1 leading-6 text-[#F4F1EA]/76">
                  These fields populate your default shipping address for future
                  orders.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className={`${accountInsetClass} p-5`}>
          <div className="border-b border-[#0B2E2F]/10 pb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/45">
              Shipping profile
            </p>
            <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#0B2E2F]">
              Default delivery information
            </h3>
            <p className="mt-2 text-sm leading-6 text-foreground/58">
              Adjust your personal and address details below. Changes stay
              attached to your account after you save.
            </p>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {fields.map((field) => (
              <div key={field.name} className="space-y-1.5">
                <Label
                  htmlFor={field.name}
                  className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/52"
                >
                  {field.label}
                </Label>
                {field.name === "country" ? (
                  <select
                    id={field.name}
                    value={address.country}
                    onChange={(e) => updateField("country", e.target.value)}
                    required={field.required}
                    className={accountSelectClass}
                  >
                    {countryOptions.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={field.name}
                    type={field.type || "text"}
                    value={address[field.name]}
                    onChange={(e) => updateField(field.name, e.target.value)}
                    required={field.required}
                    placeholder={field.placeholder}
                    className={accountFieldClass}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-[#0B2E2F]/10 pt-5">
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 size-9 shrink-0 ${accountIconFrameClass}`}
              >
                <Wallet className="size-4 text-[#0B2E2F]" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/45">
                  Crypto convenience
                </p>
                <h4 className="mt-1 text-lg font-semibold tracking-tight text-[#0B2E2F]">
                  Remember a preferred network and wallet.
                </h4>
                <p className="mt-2 text-sm leading-6 text-foreground/58">
                  This does not create autopay or card-like billing. Revalin
                  will still generate a fresh NOWPayments deposit address for
                  every crypto order.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-5">
              <div className="space-y-2">
                <Label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/52">
                  Preferred crypto
                </Label>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PAYMENT_CURRENCIES.map((currency) => {
                    const isActive = preferredPaymentCurrency === currency;

                    return (
                      <button
                        key={currency}
                        type="button"
                        onClick={() => {
                          setPreferredPaymentCurrency(currency);
                          setSuccess(false);
                        }}
                        className={cn(
                          "border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors",
                          isActive
                            ? "border-[#0B2E2F] bg-[#0B2E2F] text-[#F4F1EA]"
                            : "border-[#0B2E2F]/10 bg-white text-[#0B2E2F] hover:bg-[#ece9e2]",
                        )}
                      >
                        {formatPaymentCurrencyLabel(currency)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="cryptoWalletAddress"
                  className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/52"
                >
                  Wallet you usually pay from
                </Label>
                <Input
                  id="cryptoWalletAddress"
                  type="text"
                  value={cryptoWalletAddress}
                  onChange={(e) => {
                    setCryptoWalletAddress(e.target.value);
                    setSuccess(false);
                  }}
                  placeholder="Optional wallet address for convenience only"
                  className={accountFieldClass}
                />
                <p className="text-xs leading-5 text-foreground/45">
                  Optional. This is only used to prefill checkout and help with
                  support if needed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="size-4" />
          Profile saved successfully.
        </div>
      )}

      <Button
        type="submit"
        className={`mt-5 h-11 px-5 text-sm font-semibold ${accountPrimaryButtonClass}`}
        disabled={isSaving}
      >
        {isSaving ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Saving...
          </>
        ) : (
          "Save profile"
        )}
      </Button>
    </form>
  );
}
