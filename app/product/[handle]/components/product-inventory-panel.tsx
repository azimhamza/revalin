'use client';

import { useMemo } from 'react';
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
  const isHighDemand = inventory.isHighDemand;
  const label = inventory.isLowStock && !isHighDemand
    ? `Only ${inventory.availableQuantity} ready now. ${inventory.shippingLeadTimeLabel}`
    : inventory.shippingLeadTimeLabel;

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
