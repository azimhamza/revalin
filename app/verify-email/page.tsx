import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth-server';
import { Footer } from '@/components/layout/footer';
import { VerifyEmailForm } from './verify-email-form';
import {
  getAccountDestinationForRole,
} from '@/lib/account-destination';

export const metadata = {
  title: 'Verify Email | Revalin',
  description: 'Verify your email address to continue.',
};

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const visible = local.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain}`;
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await getServerSession();
  const params = await searchParams;

  if (!session?.user) {
    const callbackSuffix = params.callbackUrl
      ? `?callbackUrl=${encodeURIComponent(params.callbackUrl)}`
      : '';
    redirect(`/login${callbackSuffix}`);
  }

  if (session.user.emailVerified) {
    const continueUrl = params.callbackUrl
      ? `/auth/continue?callbackUrl=${encodeURIComponent(params.callbackUrl)}`
      : '/auth/continue';
    redirect(continueUrl);
  }

  const callbackUrl =
    params.callbackUrl ||
    getAccountDestinationForRole((session.user as any)?.role);
  const maskedEmail = maskEmail(session.user.email);

  return (
    <>
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-sides py-16">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/45">
              Almost there
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.02em]">
              Verify your email
            </h1>
            <p className="mt-3 text-sm text-foreground/55">
              We sent a 6-digit code to{' '}
              <span className="font-medium text-foreground/80">{maskedEmail}</span>
            </p>
          </div>

          <div className="rounded-[26px] border border-[#0B2E2F]/12 bg-card p-6 shadow-[0_20px_48px_rgba(11,46,47,0.05)]">
            <VerifyEmailForm callbackUrl={callbackUrl} />
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
