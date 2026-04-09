'use client';

import { useCallback, useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Loader2, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useAuthSession } from '@/components/auth/session-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getApiErrorMessage, readJsonSafely } from '@/lib/api/client';

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
        const response = await fetch('/api/marketing/email-subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), source: 'popup' }),
        });
        const payload = await readJsonSafely(response);

        if (!response.ok) {
          throw new Error(getApiErrorMessage(payload, 'Unable to subscribe.'));
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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/35 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-popover p-5 shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <VisuallyHidden>
            <Dialog.Title>Welcome to Revalin</Dialog.Title>
          </VisuallyHidden>
          {submitted ? (
            <div>
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  You&apos;re in
                </p>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="-mr-1 -mt-1 shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Close"
                  >
                    <X className="size-4" />
                  </button>
                </Dialog.Close>
              </div>
              <p className="mt-1.5 text-lg font-semibold text-foreground">Check your email</p>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">
                We sent your 10% off code to{' '}
                <span className="font-medium text-foreground">{email}</span>. It expires in 72 hours.
              </p>
              <Button
                type="button"
                size="lg"
                className="mt-5 w-full"
                style={{ backgroundColor: '#0B2E2F', color: '#F4F1EA' }}
                onClick={() => setOpen(false)}
              >
                Start shopping
              </Button>
            </div>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Welcome to Revalin
                </p>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="-mr-1 -mt-1 shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Close"
                  >
                    <X className="size-4" />
                  </button>
                </Dialog.Close>
              </div>
              <p className="mt-1.5 text-lg font-semibold text-foreground">
                10% off your first order
              </p>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">
                Join the list for exclusive batch drops, research updates, and your welcome discount.
              </p>

              <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-2">
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email address"
                  disabled={isLoading}
                  aria-label="Email address"
                />
                <Button
                  type="submit"
                  size="lg"
                  disabled={isLoading}
                  className="w-full"
                  style={{ backgroundColor: '#0B2E2F', color: '#F4F1EA' }}
                >
                  {isLoading ? <Loader2 className="size-5 animate-spin" /> : 'Claim 10% off'}
                </Button>
                {error ? <p className="text-xs text-destructive">{error}</p> : null}
              </form>

              <p className="mt-4 text-[10px] text-muted-foreground">
                Unsubscribe any time. Research use only.
              </p>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
