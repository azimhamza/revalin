'use client';

import React, { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { Product } from '@/lib/swell/types';
import { AddToCart, AddToCartButton } from '@/components/cart/add-to-cart';
import { formatPrice } from '@/lib/swell/utils';
import { VariantSelector } from '../variant-selector';
import { ProductImage } from './product-image';
import { useProductImages, useSelectedVariant } from '@/components/products/variant-selector';
import { thumbHashToAverageRGBA } from 'thumbhash';

const getOverlayTextClass = (thumbhash?: string) => {
  if (!thumbhash || thumbhash.startsWith('data:')) return 'text-white';

  try {
    const thumbhashData = Uint8Array.from(atob(thumbhash), c => c.charCodeAt(0));
    const { r: red, g: green, b: blue, a: alpha } = thumbHashToAverageRGBA(thumbhashData);
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) * alpha + (1 - alpha);
    return luminance > 0.55 ? 'text-black' : 'text-white';
  } catch {
    return 'text-white';
  }
};

export const ProductCard = ({ product }: { product: Product }) => {
  const selectedVariant = useSelectedVariant(product);
  const [variantImage] = useProductImages(product, selectedVariant?.selectedOptions);
  const displayImage = variantImage || product.featuredImage;
  const overlayTextClass = useMemo(() => getOverlayTextClass(displayImage?.thumbhash), [displayImage?.thumbhash]);
  const displayPrice = selectedVariant?.price || product.priceRange.minVariantPrice;

  return (
    <div className="relative isolate w-full aspect-[3/4] md:aspect-square bg-muted group overflow-hidden">
      <Link
        href={`/product/${product.handle}`}
        className="block size-full focus-visible:outline-none"
        aria-label={`View details for ${product.title}, price ${displayPrice.amount} ${displayPrice.currencyCode}`}
        prefetch
      >
        <Suspense fallback={null}>
          <ProductImage product={product} />
        </Suspense>
      </Link>

      {/* Interactive Overlay */}
      <div className="absolute inset-0 p-2 w-full pointer-events-none">
        <div
          className={`flex gap-6 justify-between items-baseline px-3 py-1 w-full font-semibold transition-all duration-300 translate-y-0 max-md:hidden group-hover:opacity-0 group-focus-visible:opacity-0 group-hover:-translate-y-full group-focus-visible:-translate-y-full ${overlayTextClass}`}
        >
          <p className="text-sm uppercase 2xl:text-base text-balance">{product.title}</p>
          <div className="flex gap-2 items-center justify-end ml-auto text-right text-sm uppercase 2xl:text-base">
            {formatPrice(displayPrice.amount, displayPrice.currencyCode)}
            {product.compareAtPrice && (
              <span className="line-through opacity-30">
                {formatPrice(product.compareAtPrice.amount, product.compareAtPrice.currencyCode)}
              </span>
            )}
          </div>
        </div>

        <div className="flex absolute inset-x-3 bottom-3 flex-col gap-8 px-2 py-3 rounded-md transition-all duration-300 pointer-events-none bg-popover md:opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 md:translate-y-1/3 group-hover:translate-y-0 group-focus-visible:translate-y-0 group-hover:pointer-events-auto group-focus-visible:pointer-events-auto max-md:pointer-events-auto">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 md:gap-x-4 gap-y-4 items-start">
            <p className="text-lg font-semibold leading-tight break-keep">{product.title}</p>
            <div className="flex gap-1 md:gap-2 items-center justify-end place-self-end text-right text-base md:text-lg font-semibold whitespace-nowrap">
              {formatPrice(displayPrice.amount, displayPrice.currencyCode)}
              {product.compareAtPrice && (
                <span className="text-base line-through opacity-30">
                  {formatPrice(product.compareAtPrice.amount, product.compareAtPrice.currencyCode)}
                </span>
              )}
            </div>
            <Suspense fallback={null}>
              <div className="self-start">
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
