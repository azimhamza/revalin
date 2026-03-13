'use client';

import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import { Product } from '@/lib/swell/types';
import { AddToCart, AddToCartButton } from '../cart/add-to-cart';
import { Suspense } from 'react';
import Link from 'next/link';
import { VariantOptionSelector, useSelectedVariant } from './variant-selector';
import { PlusIcon } from 'lucide-react';

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
    const ctaIcon = (
      <span className="flex size-8 items-center justify-center rounded-full border border-current md:size-7">
        <PlusIcon className="size-4 md:size-3.5" strokeWidth={2.5} />
      </span>
    );

    return (
      <div
        className={cn(
          'grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-4 bg-white px-5 py-6',
          'md:max-w-[56rem] md:rounded-md md:gap-x-6 md:p-5',
          className
        )}
      >
        {/* Badge — full width */}
        <div className="md:col-span-2">
          <Badge
            className="w-fit rounded-full border-transparent px-3.5 py-1 text-xs font-black uppercase tracking-[0.04em]"
            style={{ backgroundColor: '#0B2E2F', color: '#F4F1EA' }}
          >
            Best Seller
          </Badge>
        </div>

        {/* Title — left column on desktop */}
        <Link
          href={`/product/${product.handle}`}
          className="col-span-2 mt-4 block text-[1.625rem] font-bold leading-[1.15] tracking-[-0.015em] text-[#0B2E2F] md:col-span-1 md:mt-2.5 md:self-start"
        >
          {product.title}
        </Link>

        {/* Variants — top right on desktop */}
        {hasSelectableOptions && (
          <div className="col-start-2 row-start-3 mt-6 flex w-fit flex-wrap items-center gap-2 self-end justify-self-end md:row-start-2 md:mt-2.5 [&_button]:h-9 [&_button]:px-3.5 [&_button]:text-lg md:[&_button]:h-8 md:[&_button]:px-3 md:[&_button]:text-base">
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
        )}

        {/* Price — left column, same row as CTA on desktop */}
        <div className="col-start-1 row-start-3 mt-6 flex items-baseline gap-3 md:mt-4 md:self-end">
          <span className="text-[2rem] font-bold leading-none tracking-tight text-[#0B2E2F] md:text-[1.75rem]">
            ${Number(displayPrice.amount)}
          </span>
          {product.compareAtPrice && (
            <span className="text-base line-through opacity-30">
              ${Number(product.compareAtPrice.amount)}
            </span>
          )}
        </div>

        {/* Add to Cart — right column, aligned with dosage column on desktop */}
        <div className="col-span-2 row-start-4 mt-4 w-full md:col-span-1 md:col-start-2 md:row-start-3 md:mt-4 md:w-fit md:self-end md:justify-self-end">
          <Suspense
            fallback={
              <AddToCartButton
                className="w-full text-base font-semibold md:w-fit md:min-w-0 md:text-sm [&>button]:w-full [&>button]:rounded-xl [&>button]:py-3.5 [&>button]:pl-5 [&>button]:pr-2 md:[&>button]:w-fit md:[&>button]:h-11 md:[&>button]:rounded-lg md:[&>button]:py-2.5 md:[&>button]:pl-4 md:[&>button]:pr-1.5"
                contentClassName="items-center gap-3"
                product={product}
                size="lg"
                icon={ctaIcon}
                style={{ backgroundColor: '#0B2E2F', color: '#F4F1EA' }}
              />
            }
          >
            <AddToCart
              className="w-full text-base font-semibold md:w-fit md:min-w-0 md:text-sm [&>button]:w-full [&>button]:rounded-xl [&>button]:py-3.5 [&>button]:pl-5 [&>button]:pr-2 md:[&>button]:w-fit md:[&>button]:h-11 md:[&>button]:rounded-lg md:[&>button]:py-2.5 md:[&>button]:pl-4 md:[&>button]:pr-1.5"
              contentClassName="items-center gap-3"
              size="lg"
              product={product}
              icon={ctaIcon}
              style={{ backgroundColor: '#0B2E2F', color: '#F4F1EA' }}
            />
          </Suspense>
        </div>
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
