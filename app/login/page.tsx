import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { LoginForm } from './login-form';
import { Footer } from '@/components/layout/footer';
import { ShieldCheck } from 'lucide-react';
import { getServerSession } from '@/lib/auth-server';

export const metadata = {
  title: 'Sign In | Revalin',
  description: 'Sign in to your Revalin account.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await getServerSession();
  const params = await searchParams;

  if (session?.user) {
    const continueUrl = params.callbackUrl
      ? `/auth/continue?callbackUrl=${encodeURIComponent(params.callbackUrl)}`
      : '/auth/continue';
    redirect(continueUrl);
  }

  return (
    <>
      <div className="min-h-screen md:grid md:grid-cols-2">
        {/* ── Left panel — sign-in form on cream ── */}
        <div className="flex min-h-screen flex-col justify-center bg-background px-sides py-16 md:px-10 lg:px-16">
          <div className="mx-auto w-full max-w-[400px]">
            <div className="mb-8">
              
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.02em]">Sign in</h1>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                Welcome back
              </p>
            </div>

            <div className="rounded-[26px] border border-[#0B2E2F]/12 bg-card p-6 shadow-[0_20px_48px_rgba(11,46,47,0.05)]">
              <Suspense fallback={null}>
                <LoginForm />
              </Suspense>
            </div>

            {/* Mobile trust line */}
            <div className="mt-8 flex items-center gap-2.5 md:hidden">
              <ShieldCheck className="size-4 shrink-0 text-[#0B2E2F]/40" strokeWidth={1.5} />
              <p className="text-sm text-foreground/40">Verified compounds. Third-party tested.</p>
            </div>
          </div>
        </div>

        {/* ── Right panel — editorial minimal ── */}
        <div className="relative hidden overflow-hidden bg-[#0B2E2F] md:flex md:flex-col md:justify-between">
          <div className="relative z-10 flex flex-1 flex-col justify-end px-10 pb-20 lg:px-16">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#F4F1EA]/40">
              Revalin
            </p>
            <h2 className="mt-5 max-w-[14ch] text-[2.75rem] font-semibold leading-[1.04] tracking-[-0.04em] text-[#F4F1EA] lg:text-[3.5rem]">
              Research-grade. Verified purity.
            </h2>
            <p className="mt-5 max-w-sm text-base leading-relaxed text-[#F4F1EA]/50">
              Every batch third-party tested. Every order tracked.
            </p>
          </div>

          <div className="relative z-10 border-t border-white/8 px-10 py-5 lg:px-16">
            <p className="text-xs italic tracking-tight text-[#F4F1EA]/25">
              All products are intended for laboratory research use only.
            </p>
          </div>

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.02] via-transparent to-black/10" />
        </div>
      </div>
      <Footer />
    </>
  );
}
