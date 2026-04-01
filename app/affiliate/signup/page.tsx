import Link from "next/link";
import { ArrowRight, ClipboardCheck, ShieldCheck, Users, WalletCards } from "lucide-react";
import { notFound } from "next/navigation";

import { Footer } from "@/components/layout/footer";
import { getServerSession } from "@/lib/auth-server";
import { isTemporarilyHiddenAppRoute } from "@/lib/account-destination";
import { getAffiliateByUserIdentity } from "@/lib/checkout/affiliate-service";

import { AffiliateSignupForm } from "./affiliate-signup-form";

export const metadata = {
  title: "Growth Partner Program | Revalin",
  description:
    "Join the Revalin Growth Partner program. Earn commission on every referred order.",
};

function getStatusCopy(status: string) {
  if (status === "approved") {
    return "Your referral route is approved. Open the Growth Partner dashboard to track visits, referrals, and payouts.";
  }

  if (status === "rejected") {
    return "Your last application was rejected. Contact support if you need the admin team to review a new submission.";
  }

  if (status === "suspended") {
    return "Your Growth Partner access is suspended right now. Contact support if you need the admin team to review the account.";
  }

  return "Your application is already in the admin approval queue. We’ll email you once the code and dashboard access are ready.";
}

export default async function AffiliateSignupPage() {
  if (isTemporarilyHiddenAppRoute("/affiliate/signup")) {
    notFound();
  }

  const footer = await Footer();
  const session = await getServerSession();
  const affiliateRecord = session?.user
    ? await getAffiliateByUserIdentity({
        userId: session.user.id,
        email: session.user.email,
      })
    : null;
  const role = (session?.user as any)?.role;
  const canOpenDashboard =
    role === "admin" ||
    role === "affiliate" ||
    affiliateRecord?.status === "approved";

  return (
    <>
      <div className="min-h-screen md:grid md:grid-cols-2">
        <div className="flex min-h-screen flex-col justify-center bg-background px-sides py-16 md:px-10 lg:px-16">
          <div className="mx-auto w-full max-w-[440px]">
            <div className="mb-8 rounded-xl border border-[#0B2E2F]/12 bg-[#0B2E2F] px-4 py-3.5 md:hidden">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-semibold text-[#F4F1EA]">Growth Partner Program</p>
                <div className="flex gap-3">
                  <div className="text-center">
                    <p className="text-[9px] uppercase tracking-[0.12em] text-[#F4F1EA]/40">Commission</p>
                    <p className="text-sm font-semibold text-[#F4F1EA]">5%+</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] uppercase tracking-[0.12em] text-[#F4F1EA]/40">Access</p>
                    <p className="text-sm font-semibold text-[#F4F1EA]">Live dashboard</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                Growth Partner
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.02em]">
                Restore Growth Partner access.
              </h1>
              <p className="mt-3 text-sm leading-6 text-foreground/65">
                Apply for a dedicated referral route, admin-reviewed discount code, and the payout dashboard that
                already exists in the app.
              </p>
            </div>

            <div className="rounded-[26px] border border-[#0B2E2F]/12 bg-card p-6 shadow-[0_20px_48px_rgba(11,46,47,0.05)]">
              {affiliateRecord ? (
                <div className="space-y-5">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                      Existing application
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                      {affiliateRecord.code}
                    </h2>
                  </div>

                  <div className="rounded-xl border border-border bg-background/70 p-4 text-sm leading-6 text-foreground/70">
                    <p>
                      Status: <span className="font-semibold capitalize text-foreground">{affiliateRecord.status}</span>
                    </p>
                    <p className="mt-2">{getStatusCopy(affiliateRecord.status)}</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Link
                      href={canOpenDashboard ? "/affiliate/dashboard" : "/account"}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#0B2E2F] bg-[#0B2E2F] px-5 text-sm font-semibold text-[#F4F1EA] transition-colors hover:bg-[#173d3e]"
                    >
                      {canOpenDashboard ? "Open dashboard" : "Open account"}
                      <ArrowRight className="size-4" />
                    </Link>
                    <Link
                      href="/account"
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-[#0B2E2F]/14 bg-[#FCFAF6] px-5 text-sm font-semibold text-[#0B2E2F] transition-colors hover:bg-[#F1EADB]"
                    >
                      Back to account
                    </Link>
                  </div>
                </div>
              ) : (
                <AffiliateSignupForm
                  initialName={session?.user?.name}
                  initialEmail={session?.user?.email}
                  isSignedIn={Boolean(session?.user)}
                />
              )}
            </div>

            <div className="mt-8 space-y-3 md:hidden">
              {[
                { icon: ClipboardCheck, text: "Admin-reviewed approvals and discount code setup" },
                { icon: WalletCards, text: "Wallet-based payouts tracked in one dashboard" },
                { icon: ShieldCheck, text: "The same email can later unlock affiliate access automatically" },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[#0B2E2F]/12 bg-[#F4F1EA]/70">
                    <item.icon className="size-3.5 text-[#0B2E2F]/60" strokeWidth={1.5} />
                  </div>
                  <p className="text-sm text-foreground/50">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative hidden overflow-hidden bg-[#0B2E2F] md:flex md:flex-col md:justify-between">
          <div className="relative z-10 flex flex-1 flex-col justify-center px-10 lg:px-16">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#F4F1EA]/50">
              Revalin Growth Partner
            </p>
            <h2 className="mt-4 text-[2.25rem] font-semibold leading-[1.08] tracking-[-0.03em] text-[#F4F1EA] lg:text-[2.75rem]">
              Referral routes, commission tracking, and payout operations are live again.
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-[#F4F1EA]/60">
              Submit a Growth Partner application to reserve your route, route referred traffic through the existing
              affiliate flow, and hand approvals to the admin queue already running in this build.
            </p>

            <div className="mt-10 flex flex-wrap gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/40">Routes</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-[#F4F1EA]">/{`your-code`}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/40">Approvals</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-[#F4F1EA]">Admin queue</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/40">Payouts</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-[#F4F1EA]">Wallet-first</p>
              </div>
            </div>

            <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-5">
              {[
                { icon: Users, text: "Pending applications flow straight into Growth Partner management" },
                { icon: ClipboardCheck, text: "Approved codes power direct /slug referral routes" },
                { icon: WalletCards, text: "Affiliates track performance, wallet setup, and payouts in one place" },
                { icon: ShieldCheck, text: "Admins retain approval and payout control in the dashboard" },
              ].map((item) => (
                <div key={item.text} className="flex items-start gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5">
                    <item.icon className="size-3.5 text-[#F4F1EA]/70" strokeWidth={1.5} />
                  </div>
                  <p className="text-sm leading-snug text-[#F4F1EA]/55">{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 border-t border-white/8 px-10 py-5 lg:px-16">
            <p className="text-xs italic tracking-tight text-[#F4F1EA]/30">
              Referral applications still require manual approval before routes go live publicly.
            </p>
          </div>

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-black/10" />
        </div>
      </div>
      {footer}
    </>
  );
}
