import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
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
            <div className="mb-8 mt-10 md:mt-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                Promoter
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.02em]">Apply for access</h1>
            </div>

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

            <div className="mt-8 flex items-center gap-2.5 md:hidden">
              <ShieldCheck className="size-4 shrink-0 text-[#0B2E2F]/40" strokeWidth={1.5} />
              <p className="text-sm text-foreground/40">Invite partners. Track approvals. Weekly payouts.</p>
            </div>
          </div>
        </div>

        <div className="relative hidden overflow-hidden bg-[#0B2E2F] md:flex md:flex-col md:justify-between">
          <div className="relative z-10 flex flex-1 flex-col justify-end px-10 pb-20 lg:px-16">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#F4F1EA]/40">
              Revalin Promoter
            </p>
            <h2 className="mt-5 max-w-[16ch] text-[2.75rem] font-semibold leading-[1.04] tracking-[-0.04em] text-[#F4F1EA] lg:text-[3.5rem]">
              Grow the network. Earn from every partner.
            </h2>
            <p className="mt-5 max-w-sm text-base leading-relaxed text-[#F4F1EA]/50">
              Invite Growth Partners, track their approvals, and earn commission from their sales.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <div className="border border-white/10 bg-white/[0.04] px-4 py-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/40">Default rate</p>
                <p className="mt-0.5 text-lg font-semibold tracking-tight text-[#F4F1EA]">2.5%</p>
              </div>
              <div className="border border-white/10 bg-white/[0.04] px-4 py-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/40">Dashboard</p>
                <p className="mt-0.5 text-lg font-semibold tracking-tight text-[#F4F1EA]">Partner network</p>
              </div>
              <div className="border border-white/10 bg-white/[0.04] px-4 py-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/40">Payouts</p>
                <p className="mt-0.5 text-lg font-semibold tracking-tight text-[#F4F1EA]">Weekly</p>
              </div>
            </div>
          </div>

          <div className="relative z-10 border-t border-white/8 px-10 py-5 lg:px-16">
            <p className="text-xs italic tracking-tight text-[#F4F1EA]/25">
              Applications are reviewed manually before promoter access goes live.
            </p>
          </div>

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.02] via-transparent to-black/10" />
        </div>
      </div>
      <Footer />
    </>
  );
}
