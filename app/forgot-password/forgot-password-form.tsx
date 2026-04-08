'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const RESEND_COOLDOWN = 60;

type Step = 'request' | 'verify' | 'reset' | 'complete';

export function ForgotPasswordForm() {
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState(() => searchParams.get('email')?.trim() ?? '');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const maskedEmail = useMemo(() => maskEmail(email), [email]);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setCooldown((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function sendCode() {
    setIsSending(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch('/api/auth/forgot-password/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.status === 429) {
        setCooldown(RESEND_COOLDOWN);
        setError(data.error || 'Please wait before requesting another code.');
        return;
      }

      if (!response.ok) {
        setError(data.error || 'Unable to send a reset code.');
        return;
      }

      setCooldown(RESEND_COOLDOWN);
      setStep('verify');
      setNotice(
        data.message ||
          'If an account exists for that email, we sent a 6-digit code.',
      );
    } catch {
      setError('Unable to send a reset code.');
    } finally {
      setIsSending(false);
    }
  }

  async function handleRequestSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendCode();
  }

  async function handleVerifySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsVerifying(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch('/api/auth/forgot-password/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || 'Unable to verify that code.');
        return;
      }

      setResetToken(data.resetToken as string);
      setStep('reset');
      setNotice('Code verified. Choose a new password below.');
    } catch {
      setError('Unable to verify that code.');
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResetSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsResetting(true);

    try {
      const response = await fetch('/api/auth/forgot-password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, newPassword }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || 'Unable to reset password.');
        return;
      }

      setStep('complete');
      setCode('');
      setResetToken('');
      setNewPassword('');
      setConfirmPassword('');
      setNotice('Your password has been updated.');
    } catch {
      setError('Unable to reset password.');
    } finally {
      setIsResetting(false);
    }
  }

  function handleUseDifferentEmail() {
    setStep('request');
    setCode('');
    setResetToken('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setNotice(null);
    setCooldown(0);
  }

  return (
    <div className="space-y-4">
      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {step === 'request' ? (
        <form onSubmit={handleRequestSubmit} className="space-y-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">
              Account email
            </span>
            <input
              id="forgot-password-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none transition-colors focus:border-[#0B2E2F]"
            />
          </label>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={isSending}
            style={{ backgroundColor: '#0B2E2F', color: '#F4F1EA' }}
          >
            {isSending ? (
              <>
                <Loader2 className="size-5 animate-spin" />
                Sending code...
              </>
            ) : (
              'Send reset code'
            )}
          </Button>
        </form>
      ) : null}

      {step === 'verify' ? (
        <form onSubmit={handleVerifySubmit} className="space-y-4">
          <div className="rounded-xl border border-[#0B2E2F]/10 bg-[#F8F5EE] px-4 py-3 text-sm text-foreground/62">
            Enter the 6-digit code sent to{' '}
            <span className="font-semibold text-[#0B2E2F]">{maskedEmail}</span>.
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">
              Reset code
            </span>
            <input
              id="forgot-password-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              autoComplete="one-time-code"
              className="h-11 rounded-xl border border-border bg-background px-3.5 text-center text-lg font-semibold tracking-[0.3em] text-foreground outline-none transition-colors focus:border-[#0B2E2F]"
            />
          </label>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={isVerifying || code.length !== 6}
            style={{ backgroundColor: '#0B2E2F', color: '#F4F1EA' }}
          >
            {isVerifying ? (
              <>
                <Loader2 className="size-5 animate-spin" />
                Verifying...
              </>
            ) : (
              'Verify code'
            )}
          </Button>

          <div className="flex items-center justify-between gap-3 text-sm">
            <button
              type="button"
              onClick={handleUseDifferentEmail}
              className="text-foreground/55 transition-colors hover:text-foreground"
            >
              Use a different email
            </button>
            <button
              type="button"
              disabled={cooldown > 0 || isSending}
              onClick={sendCode}
              className="text-[#0B2E2F] transition-colors hover:text-[#173d3e] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {cooldown > 0
                ? `Resend in ${cooldown}s`
                : isSending
                  ? 'Sending...'
                  : 'Resend code'}
            </button>
          </div>
        </form>
      ) : null}

      {step === 'reset' ? (
        <form onSubmit={handleResetSubmit} className="space-y-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">
              New password
            </span>
            <input
              id="forgot-password-new-password"
              type="password"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
              className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none transition-colors focus:border-[#0B2E2F]"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">
              Confirm password
            </span>
            <input
              id="forgot-password-confirm-password"
              type="password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
              className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none transition-colors focus:border-[#0B2E2F]"
            />
          </label>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={isResetting}
            style={{ backgroundColor: '#0B2E2F', color: '#F4F1EA' }}
          >
            {isResetting ? (
              <>
                <Loader2 className="size-5 animate-spin" />
                Updating password...
              </>
            ) : (
              'Update password'
            )}
          </Button>
        </form>
      ) : null}

      {step === 'complete' ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-[#0B2E2F]/10 bg-[#F8F5EE] px-4 py-4 text-sm leading-6 text-foreground/62">
            Your password has been reset. You can sign in with the updated password now.
          </div>

          <Button
            asChild
            className="w-full"
            size="lg"
            style={{ backgroundColor: '#0B2E2F', color: '#F4F1EA' }}
          >
            <Link href={`/login?email=${encodeURIComponent(email)}&reset=success`}>
              Return to sign in
            </Link>
          </Button>
        </div>
      ) : null}

      <p className="text-center text-sm text-foreground/60">
        Remembered it?{' '}
        <Link href="/login" className="font-semibold text-[#0B2E2F] underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </div>
  );
}

function maskEmail(email: string) {
  const [local, domain] = email.split('@');

  if (!local || !domain) {
    return email;
  }

  return `${local.slice(0, 1)}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain}`;
}
