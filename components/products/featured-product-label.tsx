'use client';

import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import { Product } from '@/lib/swell/types';
import { AddToCart, AddToCartButton } from '../cart/add-to-cart';
import { Suspense } from 'react';
import Link from 'next/link';
import { VariantOptionSelector, useSelectedVariant } from './variant-selector';

export function FeaturedProductLabel({
  product,
  principal = false,
  className,
}: {
  product: Product;
  principal?: boolean;
  className?: string;
}) {
  const selectedVariant = useSelectedVariant(product);
  const displayPrice = selectedVariant?.price || product.priceRange.minVariantPrice;
  const hasSelectableOptions = product.options.length > 0 && !(product.options.length === 1 && product.options[0]?.values.length === 1);

  if (principal) {
    return (
      <div
        className={cn(
          'flex flex-col gap-y-3 p-4 w-full bg-white md:rounded-md md:grid md:grid-cols-2 md:gap-x-4',
          className
        )}
      >
        <div className="col-span-2">
          <Badge className="font-black capitalize rounded-full">Best Seller</Badge>
        </div>
        {hasSelectableOptions ? (
          <>
            <div className="col-span-2 grid grid-cols-[1fr_auto] items-start gap-3">
              <Link href={`/product/${product.handle}`} className="self-start text-2xl font-semibold leading-tight">
                {product.title}
              </Link>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {product.options.map(option => (
                  <VariantOptionSelector
                    key={option.id}
                    option={option}
                    product={product}
                    variant="condensed"
                    hideLabel
                  />
                ))}
              </div>
            </div>
            <div className="col-span-2 flex flex-wrap items-center gap-3">
              <div className="flex gap-3 items-center text-2xl font-semibold whitespace-nowrap">
                ${Number(displayPrice.amount)}
                {product.compareAtPrice && (
                  <span className="line-through opacity-30">${Number(product.compareAtPrice.amount)}</span>
                )}
              </div>
              <Suspense
                fallback={
                  <AddToCartButton
                    className="ml-auto min-w-[280px] flex gap-20 justify-between pr-2"
                    size="lg"
                    product={product}
                  />
                }
              >
                <AddToCart
                  className="ml-auto min-w-[280px] flex gap-20 justify-between pr-2"
                  size="lg"
                  product={product}
                />
              </Suspense>
            </div>
          </>
        ) : (
          <div className="col-span-2 grid grid-cols-[1fr_auto] items-start gap-3">
            <Link href={`/product/${product.handle}`} className="self-start text-2xl font-semibold leading-tight">
              {product.title}
            </Link>
            <div className="flex gap-3 items-center text-2xl font-semibold text-right whitespace-nowrap">
              ${Number(displayPrice.amount)}
              {product.compareAtPrice && (
                <span className="line-through opacity-30">${Number(product.compareAtPrice.amount)}</span>
              )}
            </div>
          </div>
        )}
        {!hasSelectableOptions && (
          <Suspense
            fallback={
              <AddToCartButton
                className="col-span-2 w-full flex gap-20 justify-between pr-2"
                size="lg"
                product={product}
              />
            }
          >
            <AddToCart className="col-span-2 w-full flex gap-20 justify-between pr-2" size="lg" product={product} />
          </Suspense>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex gap-2 items-center p-2 pl-8 bg-white rounded-md max-w-full', className)}>
      <div className="pr-6 leading-4 overflow-hidden">
        <Link
          href={`/product/${product.handle}`}
          className="inline-block w-full truncate text-base font-semibold opacity-80 mb-1.5"
        >
          {product.title}
        </Link>
        <div className="flex gap-2 items-center text-base font-semibold">
          ${Number(displayPrice.amount)}
          {product.compareAtPrice && (
            <span className="text-sm line-through opacity-30">${Number(product.compareAtPrice.amount)}</span>
          )}
        </div>
      </div>
      <Suspense fallback={<AddToCartButton product={product} iconOnly variant="default" size="icon-lg" />}>
        <AddToCart product={product} iconOnly variant="default" size="icon-lg" />
      </Suspense>
    </div>
  );
}
