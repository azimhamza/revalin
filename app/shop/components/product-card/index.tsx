'use client';

import React, { Suspense } from 'react';
import { ArrowRight } from 'lucide-react';
import { Product } from '@/lib/swell/types';
import { AddToCart, AddToCartButton } from '@/components/cart/add-to-cart';
import { formatPrice, getDiscountPercentage, getDisplayCompareAtPrice, getDisplayPrice } from '@/lib/swell/utils';
import { VariantSelector } from '../variant-selector';
import { ProductImage } from './product-image';
import { useSelectedVariant } from '@/components/products/variant-selector';
import { getInventoryState } from '@/lib/inventory';
import { IntentLink } from '@/components/navigation/intent-link';

export const ProductCard = ({ product }: { product: Product }) => {
  const selectedVariant = useSelectedVariant(product);
  const displayPrice = getDisplayPrice(product, selectedVariant);
  const compareAtPrice = getDisplayCompareAtPrice(product, selectedVariant, displayPrice);
  const discountPercentage = getDiscountPercentage(compareAtPrice, displayPrice);
  const inventory = getInventoryState(product, selectedVariant);

  // Forward the currently-selected variant options so /product/[handle] opens
  // to the same dosage/option the shopper picked on the card.
  const productHref = (() => {
    const base = `/product/${product.handle}`;
    if (!selectedVariant?.selectedOptions?.length) return base;
    const params = new URLSearchParams();
    for (const option of selectedVariant.selectedOptions) {
      if (!option?.name || !option?.value) continue;
      params.set(option.name.toLowerCase(), option.value);
    }
    const query = params.toString();
    return query ? `${base}?${query}` : base;
  })();

  return (
    <div className="relative isolate w-full aspect-[3/4] md:aspect-square bg-muted group">
      <IntentLink
        href={productHref}
        className="block size-full overflow-hidden focus-visible:outline-none"
        aria-label={`View details for ${product.title}, price ${displayPrice.amount} ${displayPrice.currencyCode}`}
      >
        <Suspense fallback={null}>
          <ProductImage product={product} />
        </Suspense>
      </IntentLink>

      {/* Interactive Overlay */}
      <div className="absolute inset-0 p-2 w-full pointer-events-none">
        <div className="flex absolute inset-x-3 bottom-3 flex-col gap-8 px-2 py-3 rounded-md bg-popover pointer-events-auto">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-3 items-start md:gap-x-4">
            <p className="text-lg font-semibold leading-tight break-keep">{product.title}</p>
            <div className="flex flex-col items-end gap-0.5 justify-self-end self-start text-right">
              <div className="flex items-center justify-end gap-1 whitespace-nowrap text-base leading-none font-semibold md:gap-2 md:text-lg">
                {formatPrice(displayPrice.amount, displayPrice.currencyCode)}
                {compareAtPrice && (
                  <span className="text-base line-through opacity-30">
                    {formatPrice(compareAtPrice.amount, compareAtPrice.currencyCode)}
                  </span>
                )}
              </div>
              {discountPercentage ? (
                <span className="text-[10px] leading-none font-semibold uppercase tracking-[0.08em] text-red-800">
                  {discountPercentage}% off
                </span>
              ) : null}
            </div>
            {inventory.isLowStock && !inventory.isBackorder && (
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
                Only {inventory.availableQuantity} left
              </p>
            )}
            <Suspense fallback={null}>
              <div className="col-start-1 self-start">
                <VariantSelector product={product} />
              </div>
            </Suspense>

            {inventory.isBackorder ? (
              <IntentLink
                href={productHref}
                className="group/waitlist col-start-2 self-end inline-flex h-7 items-center gap-1.5 rounded-sm py-1 px-2 text-base font-semibold text-[#F4F1EA] bg-[#0B2E2F] transition-opacity hover:opacity-90"
              >
                Get Notified
                <ArrowRight className="size-4 transition-transform duration-200 ease-out group-hover/waitlist:translate-x-0.5" />
              </IntentLink>
            ) : (
              <Suspense fallback={<AddToCartButton className="col-start-2 self-end" product={product} size="sm" />}>
                <AddToCart className="col-start-2 self-end" size="sm" product={product} />
              </Suspense>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
