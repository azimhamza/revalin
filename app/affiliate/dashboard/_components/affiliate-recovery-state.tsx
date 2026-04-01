import Link from "next/link";
import { ArrowRight, LifeBuoy, ShieldAlert } from "lucide-react";

import {
  AffiliatePanel,
  AffiliateSectionHeader,
  affiliateInsetClass,
  affiliatePrimaryButtonClass,
  affiliateSecondaryButtonClass,
} from "./affiliate-shell";

type AffiliateRecoveryStateProps = {
  email?: string | null;
};

export function AffiliateRecoveryState({
  email,
}: AffiliateRecoveryStateProps) {
  return (
    <div className="space-y-6">
      <AffiliatePanel>
        <AffiliateSectionHeader
          title="Complete Growth Partner setup"
          description="This account can reach the Growth Partner area, but no linked partner record was found. The dashboard depends on an affiliate record tied to the same email used for sign-in."
        />

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <div className={`${affiliateInsetClass} px-4 py-4`}>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0B2E2F]">
              <ShieldAlert className="size-4" />
              Linked record
            </div>
            <p className="mt-3 text-sm font-semibold text-[#0B2E2F]">
              Not found
            </p>
            <p className="mt-2 text-sm leading-5 text-[#0B2E2F]/58">
              No Growth Partner application is currently linked to this account.
            </p>
          </div>

          <div className={`${affiliateInsetClass} px-4 py-4`}>
            <p className="text-sm font-semibold text-[#0B2E2F]">
              Signed-in email
            </p>
            <p className="mt-3 break-all text-sm font-semibold text-[#0B2E2F]">
              {email || "Unavailable"}
            </p>
            <p className="mt-2 text-sm leading-5 text-[#0B2E2F]/58">
              Use the same email address that was used on the partner
              application.
            </p>
          </div>

          <div className={`${affiliateInsetClass} px-4 py-4`}>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0B2E2F]">
              <LifeBuoy className="size-4" />
              Common causes
            </div>
            <p className="mt-3 text-sm leading-5 text-[#0B2E2F]/58">
              The application may still be pending, the affiliate role may have
              been assigned manually, or the approved record may live under a
              different email address.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/affiliate/signup"
            className={`inline-flex h-11 items-center justify-center gap-2 px-5 text-sm font-semibold ${affiliatePrimaryButtonClass}`}
          >
            Open application
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/account"
            className={`inline-flex h-11 items-center justify-center gap-2 px-5 text-sm font-semibold ${affiliateSecondaryButtonClass}`}
          >
            Back to account
          </Link>
          <Link
            href="/contact"
            className={`inline-flex h-11 items-center justify-center gap-2 px-5 text-sm font-semibold ${affiliateSecondaryButtonClass}`}
          >
            Contact support
          </Link>
        </div>
      </AffiliatePanel>
    </div>
  );
}
