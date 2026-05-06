'use client';

import React, { Suspense } from 'react';
import { Product } from '@/lib/swell/types';
import { AddToCart, AddToCartButton } from '@/components/cart/add-to-cart';
import { formatPrice, getDiscountPercentage, getDisplayCompareAtPrice, getDisplayPrice } from '@/lib/swell/utils';
import { VariantSelector } from '../variant-selector';
import { ProductImage } from './product-image';
import { useSelectedVariant } from '@/components/products/variant-selector';
import { getInventoryState } from '@/lib/inventory';
import { IntentLink } from '@/components/navigation/intent-link';
import { useLazyProductAvailability } from '@/lib/catalog/availability-client';

export const ProductCard = ({ product: initialProduct }: { product: Product }) => {
  const {
    product,
    loadAvailability,
  } = useLazyProductAvailability(initialProduct);
  const selectedVariant = useSelectedVariant(product);
  const displayPrice = getDisplayPrice(product, selectedVariant);
  const compareAtPrice = getDisplayCompareAtPrice(product, selectedVariant, displayPrice);
  const discountPercentage = getDiscountPercentage(compareAtPrice, displayPrice);
  const inventory = getInventoryState(product, selectedVariant);
  const inventoryMessage = inventory.isBackorder
    ? inventory.shortLabel
    : inventory.isLowStock
      ? `Only ${inventory.availableQuantity} ready now`
      : null;

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
    <div
      className="relative isolate w-full aspect-[3/4] md:aspect-square bg-muted group"
      onPointerEnter={() => {
        void loadAvailability();
      }}
      onFocusCapture={() => {
        void loadAvailability();
      }}
      onTouchStart={() => {
        void loadAvailability();
      }}
    >
      <IntentLink
        href={productHref}
        prefetchMode="off"
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
            {inventoryMessage ? (
              <p className="col-span-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
                {inventoryMessage}
              </p>
            ) : null}
            <Suspense fallback={null}>
              <div className="col-start-1 self-start">
                <VariantSelector product={product} />
              </div>
            </Suspense>

            <Suspense fallback={<AddToCartButton className="col-start-2 self-end" product={product} size="sm" />}>
              <AddToCart className="col-start-2 self-end" size="sm" product={product} />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
};
