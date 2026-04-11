import Link from "next/link";
import {
  ArrowRight,
  ClipboardCheck,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";
import { redirect } from "next/navigation";

import { Footer } from "@/components/layout/footer";
import { getServerSession } from "@/lib/auth-server";
import { getPromoterByUserIdentity } from "@/lib/checkout/promoter-service";

import { PromoterSignupForm } from "./promoter-signup-form";

export const metadata = {
  title: "Promoter Application | Revalin",
  description:
    "Request Promoter access to invite Growth Partners and earn from successful partner sales.",
};

function getStatusCopy(status: string) {
  if (status === "approved") {
    return "Your promoter access is approved. Open the dashboard to invite Growth Partners and manage payouts.";
  }

  if (status === "rejected") {
    return "Your last promoter application was rejected. Contact support if you need the admin team to review a new submission.";
  }

  if (status === "suspended") {
    return "Your promoter access is suspended right now. Contact support if you need the admin team to review the account.";
  }

  return "Your promoter application is already in the admin approval queue. We will email you once access is ready.";
}

export default async function PromoterSignupPage() {
  const session = await getServerSession();
  if (!session?.user) {
    redirect("/login?callbackUrl=/promoter/signup");
  }

  const promoterRecord = await getPromoterByUserIdentity({
    userId: session.user.id,
    email: session.user.email,
  });

  if (promoterRecord?.status === "approved") {
    redirect("/promoter/dashboard");
  }

  return (
    <>
      <div className="min-h-screen md:grid md:grid-cols-2">
        <div className="flex min-h-screen flex-col justify-center bg-background px-sides py-16 md:justify-start md:px-10 md:pt-top-spacing lg:px-16">
          <div className="mx-auto w-full max-w-[440px] md:my-auto">
            <div className="rounded-[26px] border border-[#0B2E2F]/12 bg-card p-6 shadow-[0_20px_48px_rgba(11,46,47,0.05)]">
              {promoterRecord ? (
                <div className="space-y-5">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                      Existing application
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                      Application on file
                    </h2>
                  </div>

                  <div className="rounded-xl border border-border bg-background/70 p-4 text-sm leading-6 text-foreground/70">
                    <p>
                      Status:{" "}
                      <span className="font-semibold capitalize text-foreground">
                        {promoterRecord.status}
                      </span>
                    </p>
                    <p className="mt-2">{getStatusCopy(promoterRecord.status)}</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Link
                      href="/contact"
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#0B2E2F] bg-[#0B2E2F] px-5 text-sm font-semibold text-[#F4F1EA] transition-colors hover:bg-[#173d3e]"
                    >
                      Contact support
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
                <PromoterSignupForm
                  initialName={session.user.name}
                  initialEmail={session.user.email}
                />
              )}
            </div>

            <div className="mt-8 space-y-3 md:hidden">
              {[
                {
                  icon: ClipboardCheck,
                  text: "Apply with the same account you will use for the promoter dashboard",
                },
                {
                  icon: WalletCards,
                  text: "Set your payout wallet after approval",
                },
                {
                  icon: ShieldCheck,
                  text: "Applications are reviewed manually before promoter access goes live",
                },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[#0B2E2F]/12 bg-[#F4F1EA]/70">
                    <item.icon
                      className="size-3.5 text-[#0B2E2F]/60"
                      strokeWidth={1.5}
                    />
                  </div>
                  <p className="text-sm text-foreground/50">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative hidden min-h-screen overflow-hidden bg-[#0B2E2F] md:block">
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div className="px-10 pt-10 lg:px-16">
              <Link
                href="/"
                className="text-sm font-semibold tracking-tight text-[#F4F1EA]"
              >
                Revalin
              </Link>
            </div>

            <div className="px-10 pb-16 lg:px-16">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#F4F1EA]/45">
                Promoter program
              </p>
              <h2 className="mt-4 text-[1.85rem] font-semibold leading-[1.08] tracking-[-0.03em] text-[#F4F1EA] lg:text-[2.2rem]">
                Invite partners. Track approvals. Earn from their sales.
              </h2>

              <div className="mt-8 flex flex-wrap gap-3">
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/40">
                    Default rate
                  </p>
                  <p className="mt-1 text-xl font-semibold tracking-tight text-[#F4F1EA]">
                    2.5%
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/40">
                    Approval
                  </p>
                  <p className="mt-1 text-xl font-semibold tracking-tight text-[#F4F1EA]">
                    Team review
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/40">
                    Dashboard
                  </p>
                  <p className="mt-1 text-xl font-semibold tracking-tight text-[#F4F1EA]">
                    Partner network
                  </p>
                </div>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-4">
                {[
                  {
                    icon: Users,
                    text: "Invite Growth Partners for team review and approval",
                  },
                  {
                    icon: ClipboardCheck,
                    text: "Admin maps successful referrals to partner records",
                  },
                  {
                    icon: WalletCards,
                    text: "Earn from sales generated by approved mapped partners",
                  },
                  {
                    icon: ShieldCheck,
                    text: "Payouts settle weekly after wallet setup",
                  },
                ].map((item) => (
                  <div key={item.text} className="flex items-start gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5">
                      <item.icon
                        className="size-3.5 text-[#F4F1EA]/70"
                        strokeWidth={1.5}
                      />
                    </div>
                    <p className="text-[13px] leading-5 text-[#F4F1EA]/55">
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative z-10 border-t border-white/8 px-10 py-5 lg:px-16">
              <p className="text-[11px] italic tracking-tight text-[#F4F1EA]/30">
                Applications are reviewed manually before promoter access goes live.
              </p>
            </div>
          </div>

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-black/10" />
        </div>
      </div>
      <Footer />
    </>
  );
}
