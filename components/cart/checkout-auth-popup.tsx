'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { type AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { Button } from '@/components/ui/button';

interface CheckoutAuthPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  closeCart: () => void;
  router: AppRouterInstance;
}

export function CheckoutAuthPopup({ open, onOpenChange, closeCart, router }: CheckoutAuthPopupProps) {
  useEffect(() => {
    if (!open) return;

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [open, onOpenChange]);

  const navigateTo = (path: string) => {
    onOpenChange(false);
    closeCart();
    router.push(path);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[60] bg-foreground/35"
            onClick={() => onOpenChange(false)}
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-x-4 top-1/2 z-[61] mx-auto w-full max-w-sm -translate-y-1/2 rounded-2xl border border-border bg-popover p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-auth-title"
            aria-describedby="checkout-auth-description"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Before you checkout
            </p>
            <p
              id="checkout-auth-title"
              className="mt-1.5 text-lg font-semibold text-foreground"
            >
              New users get 10% off
            </p>
            <p id="checkout-auth-description" className="mt-2 text-sm leading-5 text-muted-foreground">
              Create an account to claim 10% off your first order, track orders, and check out faster next time.
            </p>

            <div className="mt-5 flex flex-col gap-2">
              <Button
                type="button"
                size="lg"
                className="w-full justify-between"
                style={{ backgroundColor: '#0B2E2F', color: '#F4F1EA' }}
                onClick={() => navigateTo('/signup?callbackUrl=/checkout')}
              >
                Create account
                <ArrowRight className="size-5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => navigateTo('/login?callbackUrl=/checkout')}
              >
                Sign in
              </Button>
            </div>

            <button
              type="button"
              className="mt-4 w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => navigateTo('/checkout')}
            >
              Continue as guest
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
