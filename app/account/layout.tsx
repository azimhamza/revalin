import { notFound, redirect } from "next/navigation";
import { getFreshServerSession } from "@/lib/auth-server";
import { PageLayout } from "@/components/layout/page-layout";
import Link from "next/link";
import { Shield, ShoppingBag, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccountNav } from "./account-nav";
import { getAffiliateByUserIdentity } from "@/lib/checkout/affiliate-service";
import { getPromoterByUserIdentity } from "@/lib/checkout/promoter-service";
import {
  accountPrimaryButtonClass,
  accountSecondaryButtonClass,
} from "./account-theme";
import { isTemporarilyHiddenAppRoute } from "@/lib/account-destination";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (isTemporarilyHiddenAppRoute("/account")) {
    notFound();
  }

  const session = await getFreshServerSession();

  if (!session?.user) {
    redirect("/login?callbackUrl=/account");
  }

  if (!session.user.emailVerified) {
    redirect("/verify-email?callbackUrl=/account");
  }

  const role = (session.user as any).role;
  const [affiliateRecord, promoterRecord] = await Promise.all([
    getAffiliateByUserIdentity({
      userId: session.user.id,
      email: session.user.email,
    }),
    getPromoterByUserIdentity({
      userId: session.user.id,
      email: session.user.email,
    }),
  ]);
  const showAffiliate =
    role === "affiliate" ||
    role === "admin" ||
    affiliateRecord?.status === "approved";
  const showAffiliateShortcut =
    role === "affiliate" || affiliateRecord?.status === "approved";
  const showPromoter = promoterRecord?.status === "approved" || role === "admin";
  const showAdmin = role === "admin";

  return (
    <PageLayout>
      <div className="px-sides pt-top-spacing pb-16">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="relative overflow-hidden border border-[#0B2E2F]/12 bg-[linear-gradient(135deg,#E7E1D3_0%,#F4F1EA_56%,#DDE7E0_100%)] px-6 py-7 shadow-[0_20px_80px_rgba(11,46,47,0.08)] sm:px-8 sm:py-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(11,46,47,0.10),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.9),transparent_38%)]" />

            <div className="relative max-w-3xl">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#0B2E2F]/46">
                  Account
                </p>
                <h1 className="mt-2 text-[2.2rem] font-semibold tracking-[-0.04em] text-[#0B2E2F] sm:text-[2.8rem]">
                  Welcome back, {session.user.name?.split(" ")[0] || "there"}.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[#0B2E2F]/68 sm:text-base">
                  Orders, saved details, and account access all stay in one
                  place.
                </p>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Button
                    asChild
                    className={`h-11 px-5 text-sm font-semibold ${accountPrimaryButtonClass}`}
                  >
                    <Link href="/account/orders">Review orders</Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className={`h-11 px-5 text-sm font-semibold ${accountSecondaryButtonClass}`}
                  >
                    <Link href="/shop">
                      Browse catalog
                      <ShoppingBag className="size-4" />
                    </Link>
                  </Button>
                  {showAffiliateShortcut ? (
                    <Button
                      asChild
                      variant="outline"
                      className={`h-11 px-5 text-sm font-semibold ${accountSecondaryButtonClass}`}
                    >
                      <Link
                        href={
                          affiliateRecord
                            ? "/affiliate/dashboard"
                            : "/affiliate/signup"
                        }
                      >
                        {affiliateRecord
                          ? "Growth Partner dashboard"
                          : "Complete Growth Partner setup"}
                        <Users className="size-4" />
                      </Link>
                    </Button>
                  ) : null}
                  {showAdmin ? (
                    <Button
                      asChild
                      variant="outline"
                      className={`h-11 px-5 text-sm font-semibold ${accountSecondaryButtonClass}`}
                    >
                      <Link href="/admin">
                        Open admin panel
                        <Shield className="size-4" />
                      </Link>
                    </Button>
                  ) : null}
                  {showPromoter && role !== "admin" ? (
                    <Button
                      asChild
                      variant="outline"
                      className={`h-11 px-5 text-sm font-semibold ${accountSecondaryButtonClass}`}
                    >
                      <Link href="/promoter/dashboard">
                        Promoter dashboard
                        <Users className="size-4" />
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <AccountNav
            showAffiliate={showAffiliate}
            showPromoter={showPromoter}
            showAdmin={showAdmin}
          />

          {children}
        </div>
      </div>
    </PageLayout>
  );
}
