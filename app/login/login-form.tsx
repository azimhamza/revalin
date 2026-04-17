'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signIn } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { setPostAuthPendingCookie } from '@/lib/auth/post-auth-client';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedCallbackUrl = searchParams.get('callbackUrl');
  const resetState = searchParams.get('reset');
  const signupHref = requestedCallbackUrl
    ? `/signup?callbackUrl=${encodeURIComponent(requestedCallbackUrl)}`
    : '/signup';

  const [email, setEmail] = useState(() => searchParams.get('email')?.trim() ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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

      const continueUrl = requestedCallbackUrl
        ? `/auth/continue?callbackUrl=${encodeURIComponent(requestedCallbackUrl)}`
        : '/auth/continue';
      setPostAuthPendingCookie();
      router.replace(continueUrl);
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
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            minLength={8}
            className="h-11 w-full rounded-xl border border-border bg-background px-3.5 pr-10 text-sm text-foreground outline-none transition-colors focus:border-[#0B2E2F]"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/70 transition-colors"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
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
        <Link href={signupHref} className="font-semibold text-[#0B2E2F] underline underline-offset-2">
          Create one
        </Link>
      </p>
    </form>
  );
}
