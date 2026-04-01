import { Suspense } from 'react';
import { LoginForm } from './login-form';
import { Footer } from '@/components/layout/footer';
import { FlaskConical, Truck, ShieldCheck, ClipboardCheck } from 'lucide-react';

export const metadata = {
  title: 'Sign In | Revalin',
  description: 'Sign in to your Revalin account.',
};

export default function LoginPage() {
  return (
    <>
      <div className="min-h-screen md:grid md:grid-cols-2">
        {/* ── Left panel — sign-in form on cream ── */}
        <div className="flex min-h-screen flex-col justify-center bg-background px-sides py-16 md:px-10 lg:px-16">
          <div className="mx-auto w-full max-w-[400px]">
            {/* Mobile brand strip */}
            <div className="mb-8 rounded-xl border border-[#0B2E2F]/12 bg-[#0B2E2F] px-4 py-3.5 md:hidden">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-semibold text-[#F4F1EA]">Revalin Research</p>
                <div className="flex gap-3">
                  <div className="text-center">
                    <p className="text-[9px] uppercase tracking-[0.12em] text-[#F4F1EA]/40">Purity</p>
                    <p className="text-sm font-semibold text-[#F4F1EA]">&gt;99%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] uppercase tracking-[0.12em] text-[#F4F1EA]/40">Ships</p>
                    <p className="text-sm font-semibold text-[#F4F1EA]">Same-day</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                Welcome back
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.02em]">Sign in</h1>
            </div>

            <div className="rounded-[26px] border border-[#0B2E2F]/12 bg-card p-6 shadow-[0_20px_48px_rgba(11,46,47,0.05)]">
              <Suspense fallback={null}>
                <LoginForm />
              </Suspense>
            </div>

            {/* Mobile features */}
            <div className="mt-8 space-y-3 md:hidden">
              {[
                { icon: ClipboardCheck, text: 'Batch-specific COAs with purity data' },
                { icon: Truck, text: 'Tracked worldwide shipping' },
                { icon: ShieldCheck, text: 'Encrypted & private' },
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

        {/* ── Right panel — dark teal brand panel ── */}
        <div className="relative hidden overflow-hidden bg-[#0B2E2F] md:flex md:flex-col md:justify-between">
          <div className="relative z-10 flex flex-1 flex-col justify-center px-10 lg:px-16">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#F4F1EA]/50">
              Revalin Research
            </p>
            <h2 className="mt-4 text-[2.25rem] font-semibold tracking-[-0.03em] leading-[1.08] text-[#F4F1EA] lg:text-[2.75rem]">
              Reference-standard peptides for serious research.
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-[#F4F1EA]/60">
              Sign in to manage orders, access batch-specific certificates of analysis, and track shipments from your dashboard.
            </p>

            {/* Stats row */}
            <div className="mt-10 flex flex-wrap gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/40">Avg. purity</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-[#F4F1EA]">&gt;99%</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/40">Fulfillment</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-[#F4F1EA]">Same-day</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/40">Testing</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-[#F4F1EA]">Third-party</p>
              </div>
            </div>

            {/* Feature list */}
            <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-5">
              {[
                { icon: ClipboardCheck, text: 'COAs with HPLC & mass spec data' },
                { icon: Truck, text: 'Discreet, tracked worldwide shipping' },
                { icon: FlaskConical, text: 'Full catalog of research peptides' },
                { icon: ShieldCheck, text: 'Encrypted data, no third-party sharing' },
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

          {/* Bottom tagline */}
          <div className="relative z-10 border-t border-white/8 px-10 py-5 lg:px-16">
            <p className="text-xs italic tracking-tight text-[#F4F1EA]/30">
              All products are intended for laboratory research use only.
            </p>
          </div>

          {/* Subtle gradient overlay */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-black/10" />
        </div>
      </div>
      <Footer />
    </>
  );
}
