'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signUp } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { RESEARCH_USE_MINIMUM_AGE } from '@/lib/compliance';
import { setPostAuthPendingCookie } from '@/lib/auth/post-auth-client';

async function sendAccountWelcomeDiscount() {
  try {
    const response = await fetch('/api/marketing/account-welcome-discount', {
      method: 'POST',
      credentials: 'same-origin',
    });

    if (!response.ok) {
      console.error(
        '[SIGNUP-WELCOME-DISCOUNT] Failed to issue welcome discount:',
        response.status,
      );
    }
  } catch (error) {
    console.error('[SIGNUP-WELCOME-DISCOUNT] Failed to issue welcome discount:', error);
  }
}

export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedCallbackUrl = searchParams.get('callbackUrl');
  const loginHref = requestedCallbackUrl
    ? `/login?callbackUrl=${encodeURIComponent(requestedCallbackUrl)}`
    : '/login';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [researchUseAccepted, setResearchUseAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!researchUseAccepted) {
      setError('You must confirm the research-use compliance acknowledgment.');
      return;
    }

    setIsLoading(true);

    try {
      const result = await signUp.email({
        name,
        email,
        password,
        researchUseAccepted,
      } as any);

      if (result.error) {
        setError(result.error.message || 'Unable to create account.');
        setIsLoading(false);
        return;
      }

      const continueUrl = requestedCallbackUrl
        ? `/auth/continue?callbackUrl=${encodeURIComponent(requestedCallbackUrl)}`
        : '/auth/continue';
      await sendAccountWelcomeDiscount();
      setPostAuthPendingCookie();
      router.replace(continueUrl);
    } catch {
      setError('Something went wrong. Please try again.');
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">Full name</span>
        <input
          id="name"
          type="text"
          placeholder="Jane Doe"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="name"
          className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none transition-colors focus:border-[#0B2E2F]"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">Email</span>
        <input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none transition-colors focus:border-[#0B2E2F]"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">Password</span>
        <input
          id="password"
          type="password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          minLength={8}
          className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none transition-colors focus:border-[#0B2E2F]"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">Confirm password</span>
        <input
          id="confirmPassword"
          type="password"
          placeholder="Re-enter password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          autoComplete="new-password"
          minLength={8}
          className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none transition-colors focus:border-[#0B2E2F]"
        />
      </label>

      <div className="rounded-xl border border-border bg-background/70 p-4">
        <div className="flex items-start gap-3">
          <input
            id="researchUseAccepted"
            type="checkbox"
            checked={researchUseAccepted}
            onChange={(e) => setResearchUseAccepted(e.target.checked)}
            required
            className="mt-1 size-4 rounded border border-border accent-[#0B2E2F]"
          />
          <div className="space-y-1 text-sm leading-5 text-foreground/75">
            <label htmlFor="researchUseAccepted">
              I confirm I am at least 21 years old, am a qualified purchaser acting for lawful
              research purposes, and understand Revalin products are not for human or veterinary use or human
              consumption.
            </label>
            <p>
              I also agree to the{' '}
              <Link href="/terms-of-service" className="font-semibold text-[#0B2E2F] underline underline-offset-2">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy-policy" className="font-semibold text-[#0B2E2F] underline underline-offset-2">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </div>

      <Button
        type="submit"
        className="w-full"
        size="lg"
        disabled={isLoading}
        style={{ backgroundColor: '#0B2E2F', color: '#F4F1EA' }}
      >
        {isLoading ? (
          <>
            <Loader2 className="size-5 animate-spin" />
            Creating account...
          </>
        ) : (
          'Create account'
        )}
      </Button>

      <p className="text-center text-sm text-foreground/60">
        Already have an account?{' '}
        <Link href={loginHref} className="font-semibold text-[#0B2E2F] underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </form>
  );
}
