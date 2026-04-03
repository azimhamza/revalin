import Link from "next/link";
import { LifeBuoy, ShieldAlert } from "lucide-react";

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
    <div className="space-y-3">
      <AffiliatePanel>
        <AffiliateSectionHeader
          title="Partner record not linked"
          description="This account can reach the Growth Partner area, but no linked partner record was found. If you were already assigned as a Growth Partner, do not submit a new application. The team needs to finish linking the record used for referrals and payouts."
          eyebrow="Recovery"
        />

        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <div className={`${affiliateInsetClass} px-3 py-3`}>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0B2E2F]">
              <ShieldAlert className="size-4" />
              Linked record
            </div>
            <p className="mt-2 text-xs font-semibold text-[#0B2E2F]">
              Not linked yet
            </p>
            <p className="mt-2 text-[11px] leading-4 text-[#0B2E2F]/58">
              No Growth Partner record is currently linked to this account.
            </p>
          </div>

          <div className={`${affiliateInsetClass} px-3 py-3`}>
            <p className="text-xs font-semibold text-[#0B2E2F]">
              Signed-in email
            </p>
            <p className="mt-2 break-all text-xs font-semibold text-[#0B2E2F]">
              {email || "Unavailable"}
            </p>
            <p className="mt-2 text-[11px] leading-4 text-[#0B2E2F]/58">
              This email needs to match the partner record the admin team
              linked for referrals and payouts.
            </p>
          </div>

          <div className={`${affiliateInsetClass} px-3 py-3`}>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0B2E2F]">
              <LifeBuoy className="size-4" />
              Common causes
            </div>
            <p className="mt-2 text-[11px] leading-4 text-[#0B2E2F]/58">
              The Growth Partner role may have been assigned before the partner
              record was linked, or the linked record may live under a
              different email address.
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/contact"
            className={`inline-flex items-center justify-center gap-2 ${affiliatePrimaryButtonClass}`}
          >
            Contact support
          </Link>
          <Link
            href="/account"
            className={`inline-flex items-center justify-center gap-2 ${affiliateSecondaryButtonClass}`}
          >
            Back to account
          </Link>
        </div>
      </AffiliatePanel>
    </div>
  );
}
