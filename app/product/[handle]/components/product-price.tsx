'use client';

import { useSelectedVariant } from '@/components/products/variant-selector';
import { Product } from '@/lib/swell/types';
import { formatPrice, getDiscountPercentage, getDisplayCompareAtPrice, getDisplayPrice, resolveUnitPrice } from '@/lib/swell/utils';
import { useProductQuantity } from './product-quantity-context';
import { useProductAvailabilityProduct } from './product-availability-context';
import { resolveDosageSubstitution } from '@/lib/dosage-substitution';

export function ProductPrice({ product }: { product: Product }) {
  const { product: availabilityProduct } = useProductAvailabilityProduct(product);
  const { quantity } = useProductQuantity();
  const selectedVariant = useSelectedVariant(availabilityProduct);
  const selectedOrDefaultVariant = selectedVariant || (availabilityProduct.variants.length === 1 ? availabilityProduct.variants[0] : null);
  const dosageSubstitution = resolveDosageSubstitution(availabilityProduct, selectedOrDefaultVariant);
  const displayVariant = dosageSubstitution.cartVariant;
  const displayQuantity = quantity * dosageSubstitution.quantityMultiplier;
  const basePrice = getDisplayPrice(availabilityProduct, displayVariant);
  const tiers = displayVariant?.bulkPriceTiers?.length ? displayVariant.bulkPriceTiers : availabilityProduct.bulkPriceTiers;
  const effectiveAmount = resolveUnitPrice(basePrice.amount, displayQuantity, tiers);
  const hasQuantityDiscount = Number(effectiveAmount) < Number(basePrice.amount || 0);
  const compareAtPrice = getDisplayCompareAtPrice(availabilityProduct, displayVariant, basePrice);

  const comparePrice = hasQuantityDiscount
    ? [compareAtPrice, basePrice]
        .filter((price): price is typeof basePrice => Boolean(price))
        .sort((left, right) => Number(right.amount) - Number(left.amount))[0] || null
    : compareAtPrice;
  const discountPercentage = comparePrice
    ? getDiscountPercentage(comparePrice, {
        amount: effectiveAmount,
        currencyCode: basePrice.currencyCode,
      })
    : null;

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <p className="flex min-w-0 items-center gap-3 text-2xl leading-none font-bold md:text-lg lg:text-xl 2xl:text-2xl">
        {formatPrice(effectiveAmount, basePrice.currencyCode)}
        {comparePrice ? (
          <span className="text-xl line-through opacity-30 md:text-base">
            {formatPrice(comparePrice.amount, comparePrice.currencyCode)}
          </span>
        ) : null}
      </p>
      {discountPercentage ? (
        <span className="text-[10px] leading-none font-semibold uppercase tracking-[0.08em] text-red-800 md:text-[9px]">
          {discountPercentage}% off
        </span>
      ) : null}
    </div>
  );
}
