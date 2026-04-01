'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '../ui/button';
import { Loader } from '../ui/loader';

type RemoveItemConfirmationProps = {
  open: boolean;
  productTitle: string;
  isPending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function RemoveItemConfirmation({
  open,
  productTitle,
  isPending = false,
  onClose,
  onConfirm,
}: RemoveItemConfirmationProps) {
  useEffect(() => {
    if (!open) return;

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPending) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [open, isPending, onClose]);

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
            onClick={isPending ? undefined : onClose}
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
            aria-labelledby="remove-item-confirmation-title"
          >
            <p
              id="remove-item-confirmation-title"
              className="text-lg font-semibold text-foreground"
            >
              Remove this item?
            </p>
            <p className="mt-2 text-sm leading-5 text-muted-foreground">
              Are you 110% sure you want to remove
              {' '}
              <span className="font-semibold text-foreground">{productTitle}</span>
              {' '}
              from your cart?
            </p>

            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={isPending}
                onClick={onClose}
              >
                Keep it
              </Button>
              <Button
                type="button"
                className="flex-1"
                style={{ backgroundColor: '#0B2E2F', color: '#F4F1EA' }}
                disabled={isPending}
                onClick={onConfirm}
              >
                {isPending ? <Loader size="sm" /> : 'Yes, remove it'}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
