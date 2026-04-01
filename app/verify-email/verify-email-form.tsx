'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

const RESEND_COOLDOWN = 60;

export function VerifyEmailForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const sendCode = useCallback(async () => {
    setIsSending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/send-verification-code', { method: 'POST' });
      if (res.status === 429) {
        setCooldown(RESEND_COOLDOWN);
      } else if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to send code.');
      } else {
        setCooldown(RESEND_COOLDOWN);
      }
    } catch {
      setError('Failed to send verification code.');
    } finally {
      setIsSending(false);
    }
  }, []);

  // Send code on mount
  useEffect(() => {
    sendCode();
  }, [sendCode]);

  // Cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsVerifying(true);

    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Verification failed.');
        setIsVerifying(false);
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
      setIsVerifying(false);
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
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground/55">
          Verification code
        </span>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, '');
            setCode(val);
          }}
          required
          autoFocus
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
          'Verify email'
        )}
      </Button>

      <div className="text-center">
        <button
          type="button"
          disabled={cooldown > 0 || isSending}
          onClick={sendCode}
          className="text-sm text-foreground/55 transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {cooldown > 0
            ? `Resend code in ${cooldown}s`
            : isSending
              ? 'Sending...'
              : 'Resend code'}
        </button>
      </div>
    </form>
  );
}
