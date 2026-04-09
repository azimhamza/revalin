'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getApiData, getApiErrorMessage, readJsonSafely } from '@/lib/api/client';

export function EmailCapture() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/marketing/email-subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source: 'footer' }),
      });
      const payload = await readJsonSafely(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, 'Unable to subscribe.'));
      }

      const data = getApiData<{ subscribed?: boolean; alreadySubscribed?: boolean }>(payload);
      setAlreadySubscribed(Boolean(data?.alreadySubscribed));
      setSubmitted(true);
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="py-3">
        <p className="text-sm text-[#F4F1EA]/80">
          {alreadySubscribed
            ? "You're already subscribed — check your inbox for your welcome discount or our latest deal."
            : 'Thanks — check your email for 10% off your first order.'}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="py-3">
      <div className="flex gap-2 items-center">
        <label htmlFor="email-capture" className="sr-only">
          Email address
        </label>
        <input
          id="email-capture"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Get 10% off — enter your email"
          disabled={isLoading}
          className="h-9 w-full max-w-xs rounded border border-white/25 bg-white/10 px-3 text-sm text-[#F4F1EA] placeholder:text-[#F4F1EA]/50 outline-none focus:border-white/50 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="h-9 rounded bg-[#F4F1EA] px-4 text-sm font-medium text-[#0B2E2F] transition-colors hover:bg-[#F4F1EA]/90 disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="size-4 animate-spin" /> : 'Notify Me'}
        </button>
      </div>
      {error ? <p className="mt-1.5 text-xs text-red-400">{error}</p> : null}
    </form>
  );
}
