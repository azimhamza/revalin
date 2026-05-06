'use client';

import { ChevronDown } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useSelectedVariant } from '@/components/products/variant-selector';
import type { Product } from '@/lib/swell/types';
import { useProductQuantity } from './product-quantity-context';
import { useProductAvailabilityProduct } from './product-availability-context';

function getQuantityLabel(product: Product, variantId?: string) {
  const variant = product.variants.find(item => item.id === variantId);
  const quantityOption = variant?.selectedOptions.find(option => option.name.toLowerCase().includes('dos') || option.name.toLowerCase().includes('size'));

  return quantityOption?.value || variant?.title || 'the smaller option';
}

export function DosageSubstitutionNotice({ product }: { product: Product }) {
  const { product: availabilityProduct } = useProductAvailabilityProduct(product);
  const searchParams = useSearchParams();
  const requestedDosage = searchParams.get('substitute_size');
  const selectedVariant = useSelectedVariant(availabilityProduct);
  const { quantity } = useProductQuantity();

  if (!requestedDosage || !selectedVariant) {
    return null;
  }

  const replacementLabel = getQuantityLabel(availabilityProduct, selectedVariant.id);

  return (
    <details className="group rounded-md bg-popover px-3 py-3 ring-1 ring-[#0B2E2F]/10">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-[#0B2E2F] marker:hidden">
        <span>{requestedDosage} is out of stock. Using {quantity} x {replacementLabel}.</span>
        <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <p className="mt-2 text-sm leading-relaxed text-foreground/60">
        This gives the same total quantity using the available smaller size. The cart will add {quantity} units of {replacementLabel}, and volume pricing is applied automatically.
      </p>
    </details>
  );
}
