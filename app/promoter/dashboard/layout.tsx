import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Wallet } from "lucide-react";

import { PageLayout } from "@/components/layout/page-layout";
import { getServerSession } from "@/lib/auth-server";
import { getPromoterByUserIdentity } from "@/lib/checkout/promoter-service";
import { hasCompletePayoutDestination } from "@/lib/checkout/payout-methods";

import { PromoterNav } from "./_components/promoter-nav";
import {
  PromoterPanel,
  promoterPrimaryButtonClass,
  promoterSecondaryButtonClass,
} from "./_components/promoter-shell";

export default async function PromoterDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();
  if (!session?.user) {
    redirect("/login?callbackUrl=/promoter/dashboard");
  }

  const promoter = await getPromoterByUserIdentity({
    userId: session.user.id,
    email: session.user.email,
  });

  if (!promoter) {
    return (
      <PageLayout>
        <div className="px-sides pt-top-spacing pb-16">
          <div className="mx-auto max-w-3xl border border-[#0B2E2F]/12 bg-[#FCFAF6] px-5 py-5">
            <h1 className="text-2xl font-semibold tracking-tight text-[#0B2E2F]">
              Promoter access is not active.
            </h1>
            <p className="mt-2 text-sm text-[#0B2E2F]/64">
              Contact the admin team if this account should invite Growth Partners.
            </p>
            <Link
              href="/account"
              className="mt-4 inline-flex h-9 items-center gap-2 rounded-none border border-[#0B2E2F]/12 bg-white px-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]"
            >
              <ArrowLeft className="size-4" />
              Back to account
            </Link>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (promoter.status !== "approved") {
    const statusMessages: Record<string, { title: string; description: string }> = {
      pending: {
        title: "Your application is under review.",
        description:
          "The admin team is reviewing your promoter application. You will receive an email once a decision has been made.",
      },
      rejected: {
        title: "Your application was not approved.",
        description:
          "Your promoter application was not approved. Contact the admin team if you believe this was an error.",
      },
      suspended: {
        title: "Your account has been suspended.",
        description:
          "Your promoter access has been suspended. Contact the admin team for more information.",
      },
    };
    const msg = statusMessages[promoter.status] ?? statusMessages.pending!;

    return (
      <PageLayout>
        <div className="px-sides pt-top-spacing pb-16">
          <div className="mx-auto max-w-3xl space-y-4">
            <section className="border border-[#0B2E2F]/12 bg-[#0B2E2F] px-4 py-4 text-[#F4F1EA]">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#F4F1EA]/46">
                    Promoter
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                    Promoter dashboard
                  </h1>
                </div>
                <Link
                  href="/account"
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-none border border-white/12 bg-white/8 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#F4F1EA]"
                >
                  <ArrowLeft className="size-4" />
                  Account
                </Link>
              </div>
            </section>

            <section className="border border-[#0B2E2F]/12 bg-[#FCFAF6] px-5 py-5">
              <div className="flex items-center gap-3">
                <span className="border border-[#0B2E2F]/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0B2E2F]/70">
                  {promoter.status}
                </span>
              </div>
              <h2 className="mt-3 text-xl font-semibold tracking-tight text-[#0B2E2F]">
                {msg.title}
              </h2>
              <p className="mt-2 text-sm text-[#0B2E2F]/64">
                {msg.description}
              </p>
            </section>
          </div>
        </div>
      </PageLayout>
    );
  }

  const hasPayoutDestination = hasCompletePayoutDestination({
    payoutMethod: promoter.payoutMethod,
    walletAddress: promoter.walletAddress,
    achAccountHolderName: promoter.achAccountHolderName,
    achBankName: promoter.achBankName,
    achAccountType: promoter.achAccountType,
    achRoutingNumberLast4: promoter.achRoutingNumberLast4,
    achAccountNumberLast4: promoter.achAccountNumberLast4,
  });

  return (
    <PageLayout>
      <div className="px-sides pt-top-spacing pb-12">
        <div className="mx-auto max-w-[1520px] space-y-3">
          <PromoterPanel
            tone="inverse"
            className="relative overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_28%),linear-gradient(155deg,#0B2E2F_0%,#123B3D_100%)] p-0"
          >
            <div className="flex flex-col gap-3.5 px-3.5 py-3.5 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/48">
                  Promoter
                </p>
                <h1 className="text-[1.35rem] font-semibold tracking-[-0.04em] text-[#F4F1EA]">
                  Promoter dashboard
                </h1>
                <p className="max-w-3xl text-[12px] leading-5 text-[#F4F1EA]/70">
                  Share your referral link, track recruited partners, and manage the payout destination used for promoter payouts.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href="/account"
                  className={`inline-flex items-center justify-center gap-2 ${promoterSecondaryButtonClass}`}
                >
                  <ArrowLeft className="size-4" />
                  Back to account
                </Link>
                <Link
                  href="/promoter/dashboard#payout-settings"
                  className={`inline-flex items-center justify-center gap-2 ${promoterPrimaryButtonClass}`}
                >
                  <Wallet className="size-4" />
                  {hasPayoutDestination ? "Payout settings" : "Set payout details"}
                </Link>
              </div>
            </div>
          </PromoterPanel>

          <div className="grid gap-3 xl:grid-cols-[190px_minmax(0,1fr)]">
            <aside className="space-y-2">
              <PromoterNav />
            </aside>

            <div className="min-w-0">{children}</div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
