import { Suspense } from 'react';
import { Footer } from '@/components/layout/footer';
import { FlaskConical, KeyRound, ShieldCheck, ClipboardCheck } from 'lucide-react';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata = {
  title: 'Forgot Password | Revalin',
  description: 'Reset your Revalin account password with a verification code.',
};

export default async function ForgotPasswordPage() {
  const footer = await Footer();

  return (
    <>
      <div className="min-h-screen md:grid md:grid-cols-2">
        <div className="flex min-h-screen flex-col justify-center bg-background px-sides py-16 md:justify-start md:px-10 md:pt-top-spacing lg:px-16">
          <div className="mx-auto w-full max-w-[400px]">
            <div className="mb-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
                Account recovery
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.02em]">
                Reset your password
              </h1>
              <p className="mt-3 text-sm leading-6 text-foreground/58">
                Request a 6-digit code, verify it, then choose a new password for your account.
              </p>
            </div>

            <div className="rounded-[26px] border border-[#0B2E2F]/12 bg-card p-6 shadow-[0_20px_48px_rgba(11,46,47,0.05)]">
              <Suspense fallback={null}>
                <ForgotPasswordForm />
              </Suspense>
            </div>
          </div>
        </div>

        <div className="relative hidden overflow-hidden bg-[#0B2E2F] md:flex md:flex-col md:justify-between">
          <div className="relative z-10 flex flex-1 flex-col justify-start px-10 pt-16 md:pt-[calc(var(--top-spacing)-0.75rem)] lg:px-16">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#F4F1EA]/50">
              Revalin Research
            </p>
            <h2 className="mt-4 text-[2rem] font-semibold leading-[1.08] tracking-[-0.03em] text-[#F4F1EA] lg:text-[2.375rem]">
              Recover access without leaving the verification-code flow.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-[#F4F1EA]/60">
              We validate the code first, then hand off the password update through the existing auth system so account access stays consistent.
            </p>

            <div className="mt-10 flex flex-wrap gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/40">
                  Recovery
                </p>
                <p className="mt-1 text-xl font-semibold tracking-tight text-[#F4F1EA]">
                  6-digit code
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/40">
                  Session safety
                </p>
                <p className="mt-1 text-xl font-semibold tracking-tight text-[#F4F1EA]">
                  Revoked on reset
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#F4F1EA]/40">
                  Time window
                </p>
                <p className="mt-1 text-xl font-semibold tracking-tight text-[#F4F1EA]">
                  10 minutes
                </p>
              </div>
            </div>

            <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-5">
              {[
                { icon: KeyRound, text: 'Verification-code reset, not a public link' },
                { icon: ShieldCheck, text: 'Password reset revokes existing sessions' },
                { icon: ClipboardCheck, text: 'Works with the same auth records as sign-in' },
                { icon: FlaskConical, text: 'Account recovery stays inside the app flow' },
              ].map((item) => (
                <div key={item.text} className="flex items-start gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5">
                    <item.icon className="size-3.5 text-[#F4F1EA]/70" strokeWidth={1.5} />
                  </div>
                  <p className="text-[13px] leading-snug text-[#F4F1EA]/55">{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 border-t border-white/8 px-10 py-5 lg:px-16">
            <p className="text-xs italic tracking-tight text-[#F4F1EA]/30">
              All products are intended for laboratory research use only.
            </p>
          </div>

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-black/10" />
        </div>
      </div>
      {footer}
    </>
  );
}
