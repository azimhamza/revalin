'use client';

import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Product } from '@/lib/swell/types';
import { useSelectedVariant } from '@/components/products/variant-selector';
import { getInventoryState } from '@/lib/inventory';
import { cn } from '@/lib/utils';
import { Loader } from '@/components/ui/loader';

export function ProductInventoryPanel({ product }: { product: Product }) {
  const selectedVariant = useSelectedVariant(product);
  const inventory = useMemo(() => getInventoryState(product, selectedVariant), [product, selectedVariant]);
  const [email, setEmail] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  const hasSelectableVariants = product.variants.length > 1;
  const requiresVariantSelection = hasSelectableVariants && !selectedVariant;
  const itemLabel = product.variants.length > 0 ? 'this dosage' : 'this product';

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (requiresVariantSelection) {
      setFeedback('Select a dosage before joining the restock list.');
      return;
    }

    if (!email.trim()) {
      setFeedback('Enter your email address.');
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/back-in-stock/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          productHandle: product.handle,
          variantId: selectedVariant?.id,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to save your request.');
      }

      setEmail('');
      setSubscribed(true);
      setFeedback(payload.message || `We'll notify you when ${itemLabel} is back.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Something went wrong. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Only show for low stock — no need to state the obvious when fully stocked
  if (!inventory.isBackorder && !inventory.isLowStock) {
    return null;
  }

  if (!inventory.isBackorder && inventory.isLowStock) {
    return (
      <div className="flex items-center gap-2 px-1">
        <span className="size-1.5 rounded-full shrink-0 bg-[#8B7340]" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
          Only {inventory.availableQuantity} left
        </p>
      </div>
    );
  }

  // Backorder: restock notification
  if (subscribed) {
    return (
      <div className="rounded-md bg-popover px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full shrink-0 bg-[#8B7340]" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
            Backorder
          </p>
        </div>
        <p className="mt-2.5 text-sm leading-relaxed text-foreground/65">
          You&apos;re on the list &mdash; we&apos;ll email you when {itemLabel} is back in stock.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md bg-popover px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="size-1.5 rounded-full shrink-0 bg-[#8B7340]" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
          Backorder
        </p>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-foreground/65">
        Next batch is on the way. Drop your email to get notified when {itemLabel} is back &mdash; 20% off for the first 48 hours.
      </p>

      {hasSelectableVariants && !selectedVariant ? (
        <p className="mt-1 text-xs text-foreground/40">
          Select a dosage above to tie the alert to the exact option you want.
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-3">
        <label className="sr-only" htmlFor="back-in-stock-email">
          Email address
        </label>
        <div className="flex gap-2">
          <input
            id="back-in-stock-email"
            type="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            placeholder="Email address"
            className="h-9 flex-1 min-w-0 rounded border border-[#0B2E2F]/10 bg-white px-3 text-sm text-[#0B2E2F] placeholder:text-foreground/30 outline-none transition-colors focus:border-[#0B2E2F]/30"
          />
          <button
            type="submit"
            disabled={isSubmitting || requiresVariantSelection}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded bg-[#0B2E2F] px-3.5 text-xs font-medium text-[#F4F1EA] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader size="sm" kind="spinner" />
            ) : (
              <>
                Notify me
                <ArrowRight className="size-3" />
              </>
            )}
          </button>
        </div>
        <p className="mt-2 text-[10px] leading-normal text-foreground/30">
          One-time use. We&apos;ll only email you about this restock.
        </p>
      </form>

      {feedback ? (
        <p className="mt-2 text-xs text-foreground/55">{feedback}</p>
      ) : null}
    </div>
  );
}
