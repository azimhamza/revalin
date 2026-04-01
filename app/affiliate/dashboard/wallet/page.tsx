import { redirect } from "next/navigation";
import { ShieldCheck, Wallet } from "lucide-react";

import { getServerSession } from "@/lib/auth-server";
import { getAffiliateByUserIdentity } from "@/lib/checkout/affiliate-service";

import {
  AffiliatePanel,
  AffiliateSectionHeader,
  affiliateInsetClass,
  affiliateStatusChipClass,
  getAffiliateStatusClasses,
} from "../_components/affiliate-shell";
import { AffiliateRecoveryState } from "../_components/affiliate-recovery-state";
import { formatWalletPreview, getConfiguredWallet } from "../wallet-utils";
import { WalletForm } from "./wallet-form";

export const metadata = {
  title: "Wallet Settings | Revalin Growth Partner",
};

export default async function WalletPage() {
  const session = await getServerSession();
  if (!session?.user) redirect("/login");

  const affiliate = await getAffiliateByUserIdentity({
    userId: session.user.id,
    email: session.user.email,
  });

  if (!affiliate) {
    return <AffiliateRecoveryState email={session.user.email} />;
  }

  return (
    <div className="space-y-6">
      <AffiliatePanel>
        <AffiliateSectionHeader title="Wallet settings" />

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <div className={`${affiliateInsetClass} px-4 py-4`}>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0B2E2F]">
              <Wallet className="size-4" />
              Current wallet
            </div>
            <p className="mt-3 font-mono text-sm font-semibold text-[#0B2E2F]">
              {formatWalletPreview(affiliate.walletAddress)}
            </p>
          </div>

          <div className={`${affiliateInsetClass} px-4 py-4`}>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0B2E2F]">
              <ShieldCheck className="size-4" />
              Growth Partner status
            </div>
            <div className="mt-3">
              <span
                className={`${affiliateStatusChipClass} ${getAffiliateStatusClasses(affiliate.status)}`}
              >
                {affiliate.status}
              </span>
            </div>
          </div>

          <div className={`${affiliateInsetClass} px-4 py-4`}>
            <p className="text-sm font-semibold text-[#0B2E2F]">
              Commission rate
            </p>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-[#0B2E2F]">
              {(Number(affiliate.commissionRate) * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      </AffiliatePanel>

      <WalletForm
        currentWallet={getConfiguredWallet(affiliate.walletAddress)}
      />
    </div>
  );
}
