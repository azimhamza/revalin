'use client';

import { useCallback, useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Loader2, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useAuthSession } from '@/components/auth/session-provider';

const POPUP_DELAY_MS = 10_000;
const HIDDEN_PATHS = new Set(['/login', '/signup', '/verify-email']);
const HIDDEN_PATH_PREFIXES = ['/account'];

export function WelcomePopup() {
  const pathname = usePathname();
  const { data: session, isPending } = useAuthSession();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isHiddenRoute =
    HIDDEN_PATHS.has(pathname) || HIDDEN_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const canShowPopup = !isPending && !session?.user && !isHiddenRoute;

  useEffect(() => {
    if (!canShowPopup) {
      setOpen(false);
      setEmail('');
      setSubmitted(false);
      setError(null);
      return;
    }

    const timeout = setTimeout(() => setOpen(true), POPUP_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [canShowPopup]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim() || isLoading) return;

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/email/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), source: 'popup' }),
        });

        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload.error || 'Unable to subscribe.');
        }

        setSubmitted(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setIsLoading(false);
      }
    },
    [email, isLoading]
  );

  if (!canShowPopup) {
    return null;
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border/70 bg-[#F4F1EA] p-6 shadow-[0_24px_64px_rgba(11,46,47,0.15)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          <VisuallyHidden>
            <Dialog.Title>Welcome to Revalin</Dialog.Title>
          </VisuallyHidden>
          <Dialog.Close asChild>
            <button
              className="absolute right-4 top-4 rounded-full p-1 text-[#0B2E2F]/50 transition-colors hover:text-[#0B2E2F]"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </Dialog.Close>

          {submitted ? (
            <div className="py-4 text-center">
              <p className="text-2xl font-semibold tracking-tight text-[#0B2E2F]">You&apos;re in</p>
              <p className="mt-2 text-sm text-[#0B2E2F]/70">
                Check your email for your 10% off code. It expires in 72 hours.
              </p>
              <button
                onClick={() => setOpen(false)}
                className="mt-5 rounded-xl bg-[#0B2E2F] px-6 py-2.5 text-sm font-semibold text-[#F4F1EA] transition-colors hover:bg-[#0B2E2F]/90"
              >
                Start shopping
              </button>
            </div>
          ) : (
            <>
              <div className="text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0B2E2F]/50">
                  Welcome to Revalin
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-[#0B2E2F]">
                  Get 10% off your first order
                </p>
                <p className="mt-2 text-sm text-[#0B2E2F]/70">
                  Join our list for exclusive batch drops, research updates, and your welcome discount.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="mt-5">
                <div className="flex gap-2">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Your email address"
                    disabled={isLoading}
                    className="h-11 flex-1 rounded-xl border border-[#0B2E2F]/15 bg-white px-3.5 text-sm text-[#0B2E2F] outline-none transition-colors focus:border-[#0B2E2F] disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="h-11 shrink-0 rounded-xl bg-[#0B2E2F] px-5 text-sm font-semibold text-[#F4F1EA] transition-colors hover:bg-[#0B2E2F]/90 disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="size-4 animate-spin" /> : 'Claim 10% Off'}
                  </button>
                </div>
                {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
              </form>

              <p className="mt-4 text-center text-[10px] text-[#0B2E2F]/40">
                Unsubscribe any time. Research use only.
              </p>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
