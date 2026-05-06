'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Truck } from 'lucide-react';
import { Product } from '@/lib/swell/types';
import { useSelectedVariant } from '@/components/products/variant-selector';
import { getInventoryState } from '@/lib/inventory';
import { cn } from '@/lib/utils';
import { useProductAvailabilityProduct } from './product-availability-context';

export function ProductInventoryPanel({ product }: { product: Product }) {
  const { product: availabilityProduct, loadAvailability } = useProductAvailabilityProduct(product);
  const selectedVariant = useSelectedVariant(availabilityProduct);
  const displayVariant = selectedVariant || (availabilityProduct.variants.length === 1 ? availabilityProduct.variants[0] : null);
  const inventory = useMemo(() => getInventoryState(availabilityProduct, displayVariant), [availabilityProduct, displayVariant]);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const isHighDemand = inventory.isHighDemand;
  const isBackorder = inventory.isBackorder;
  const requiresVariantSelection = isBackorder && availabilityProduct.variants.length > 1 && !displayVariant;
  const label = inventory.isLowStock && !isHighDemand && !isBackorder
    ? `Only ${inventory.availableQuantity} ready now. ${inventory.shippingLeadTimeLabel}`
    : inventory.shippingLeadTimeLabel;

  async function handleNotifySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requiresVariantSelection || status === 'submitting') return;

    setStatus('submitting');
    setMessage('');

    try {
      const response = await fetch('/api/product-notifications/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          productHandle: availabilityProduct.handle,
          variantId: displayVariant?.id,
        }),
      });
      const payload = await response.json().catch(() => null);
      const nextMessage =
        payload?.data?.message ||
        payload?.message ||
        (response.ok ? 'You are on the list.' : 'Unable to save this notification.');

      if (!response.ok) {
        setStatus('error');
        setMessage(nextMessage);
        return;
      }

      setStatus('success');
      setMessage(nextMessage);
      setEmail('');
    } catch {
      setStatus('error');
      setMessage('Unable to save this notification.');
    }
  }

  if (isBackorder) {
    return (
      <div
        className="rounded-md border border-[#8B7340]/20 bg-[#8B7340]/10 px-3 py-3"
        onPointerEnter={() => void loadAvailability()}
        onFocusCapture={() => void loadAvailability()}
        onTouchStart={() => void loadAvailability()}
      >
        <div className="flex items-start gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#8B7340]/14 text-[#8B7340]">
            <Truck className="size-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight text-[#6F5D34]">
              {requiresVariantSelection ? 'Select an option to get notified' : 'Get notified when available'}
            </p>
          </div>
        </div>

        <form onSubmit={handleNotifySubmit} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            required
            value={email}
            onChange={event => {
              setEmail(event.target.value);
              if (status !== 'submitting') {
                setStatus('idle');
                setMessage('');
              }
            }}
            disabled={requiresVariantSelection || status === 'submitting'}
            placeholder="Email address"
            className="h-10 min-w-0 flex-1 rounded-md border border-[#8B7340]/20 bg-white px-3 text-sm text-[#0B2E2F] outline-none transition-colors placeholder:text-[#0B2E2F]/40 focus:border-[#8B7340]/45 disabled:opacity-55"
          />
          <button
            type="submit"
            disabled={requiresVariantSelection || status === 'submitting'}
            className="h-10 rounded-md bg-[#0B2E2F] px-4 text-sm font-semibold text-[#F4F1EA] transition-colors hover:bg-[#0B2E2F]/90 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {status === 'submitting' ? 'Submitting' : 'Notify me'}
          </button>
        </form>

        {message ? (
          <p
            className={cn(
              'mt-2 text-xs font-medium',
              status === 'error' ? 'text-red-800' : 'text-[#1F5B43]',
            )}
          >
            {message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-md border px-3 py-3',
        isHighDemand
          ? 'border-[#8B7340]/20 bg-[#8B7340]/10'
          : 'border-[#2D6A4F]/15 bg-[#2D6A4F]/10',
      )}
      onPointerEnter={() => void loadAvailability()}
      onFocusCapture={() => void loadAvailability()}
      onTouchStart={() => void loadAvailability()}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-full',
            isHighDemand ? 'bg-[#8B7340]/14 text-[#8B7340]' : 'bg-[#2D6A4F]/12 text-[#2D6A4F]',
          )}
        >
          <Truck className="size-3.5" />
        </span>
        <p
          className={cn(
            'text-sm font-semibold leading-tight',
            isHighDemand ? 'text-[#6F5D34]' : 'text-[#1F5B43]',
          )}
        >
          {label}
        </p>
      </div>
    </div>
  );
}
