import { Suspense } from 'react';
import { Footer } from '@/components/layout/footer';
import { ShieldCheck } from 'lucide-react';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata = {
  title: 'Forgot Password | Revalin',
  description: 'Reset your Revalin account password with a verification code.',
};

export default function ForgotPasswordPage() {
  return (
    <>
      <div className="min-h-screen md:grid md:grid-cols-2">
        <div className="flex min-h-screen flex-col justify-center bg-background px-sides py-16 md:justify-start md:px-10 md:pt-top-spacing lg:px-16">
          <div className="mx-auto w-full max-w-[400px]">
            <div className="mb-8 mt-10 md:mt-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                Account recovery
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.02em]">
                Reset your password
              </h1>
            </div>

            <div className="rounded-[26px] border border-[#0B2E2F]/12 bg-card p-6 shadow-[0_20px_48px_rgba(11,46,47,0.05)]">
              <Suspense fallback={null}>
                <ForgotPasswordForm />
              </Suspense>
            </div>
          </div>
        </div>

        <div className="relative hidden overflow-hidden bg-[#0B2E2F] md:flex md:flex-col md:justify-between">
          <div className="relative z-10 flex flex-1 flex-col justify-end px-10 pb-20 lg:px-16">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#F4F1EA]/40">
              Revalin
            </p>
            <h2 className="mt-5 max-w-[14ch] text-[2.75rem] font-semibold leading-[1.04] tracking-[-0.04em] text-[#F4F1EA] lg:text-[3.5rem]">
              Secure reset. No public links.
            </h2>
            <p className="mt-5 max-w-sm text-base leading-relaxed text-[#F4F1EA]/50">
              Request a 6-digit code, verify it, then choose a new password. Existing sessions are revoked on reset.
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
