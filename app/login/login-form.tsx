'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signIn } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import {
  getAccountDestinationForRole,
  getSafeAppDestination,
} from '@/lib/account-destination';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedCallbackUrl = searchParams.get('callbackUrl');
  const resetState = searchParams.get('reset');

  const [email, setEmail] = useState(() => searchParams.get('email')?.trim() ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await signIn.email({
        email,
        password,
      });

      if (result.error) {
        setError(result.error.message || 'Invalid email or password.');
        setIsLoading(false);
        return;
      }

      // Link pre-existing orders to this user
      fetch('/api/account/link-orders', { method: 'POST' }).catch(() => {});
      // Link affiliate record if email matches so affiliates land in the right dashboard.
      const linkAffiliateResult = await fetch('/api/auth/link-affiliate', { method: 'POST' })
        .then(async (res) => {
          if (!res.ok) return { linked: false };
          return (await res.json()) as { linked?: boolean };
        })
        .catch(() => ({ linked: false }));

      const role = (result.data?.user as any)?.role;
      const destination = getSafeAppDestination(
        requestedCallbackUrl ||
          (linkAffiliateResult.linked
            ? '/affiliate/dashboard'
            : getAccountDestinationForRole(role)),
      );

      // Redirect unverified users to email verification
      if (!result.data?.user?.emailVerified) {
        router.push('/verify-email?callbackUrl=' + encodeURIComponent(destination));
      } else {
        router.push(destination);
      }
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {resetState === 'success' && !error && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Password updated. Sign in with your new password.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

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
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          minLength={8}
          className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none transition-colors focus:border-[#0B2E2F]"
        />
      </label>

      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-semibold text-[#0B2E2F] underline underline-offset-2">
          Forgot password?
        </Link>
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
            Signing in...
          </>
        ) : (
          'Sign in'
        )}
      </Button>

      <p className="text-center text-sm text-foreground/60">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="font-semibold text-[#0B2E2F] underline underline-offset-2">
          Create one
        </Link>
      </p>
    </form>
  );
}
