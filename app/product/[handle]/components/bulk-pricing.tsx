'use client';

import { useSelectedVariant } from '@/components/products/variant-selector';
import { Product } from '@/lib/swell/types';
import { formatPrice } from '@/lib/swell/utils';
import { useProductQuantity } from './product-quantity-context';
import { resolveDosageSubstitution } from '@/lib/dosage-substitution';

export function BulkPricing({ product }: { product: Product }) {
  const { quantity } = useProductQuantity();
  const selectedVariant = useSelectedVariant(product);
  const dosageSubstitution = resolveDosageSubstitution(product, selectedVariant);
  const displayVariant = dosageSubstitution.cartVariant;
  const displayQuantity = quantity * dosageSubstitution.quantityMultiplier;
  const displayPrice = displayVariant?.price || product.priceRange.minVariantPrice;
  const tiers = displayVariant?.bulkPriceTiers?.length ? displayVariant.bulkPriceTiers : product.bulkPriceTiers || [];

  if (tiers.length === 0) return null;

  const baseUnitAmount = Number(displayPrice.amount);
  const normalizedTiers = tiers
    .filter(tier => tier.minQuantity >= 2)
    .sort((left, right) => left.minQuantity - right.minQuantity)
    .slice(0, 2);

  if (normalizedTiers.length === 0) return null;

  const activeTier = tiers
    .filter(tier => displayQuantity >= tier.minQuantity && (!tier.maxQuantity || displayQuantity <= tier.maxQuantity))
    .sort((left, right) => right.minQuantity - left.minQuantity)[0];
  const activeRowId = activeTier ? `${activeTier.minQuantity}-${activeTier.maxQuantity ?? 'plus'}` : 'single';

  const rows: Array<{
    id: string;
    label: string;
    tag?: string;
    tagTone: 'teal' | 'gold';
    discount?: number;
    saveAmount?: string;
    unitPrice: string;
    currencyCode: string;
  }> = [
    {
      id: 'single',
      label: '1 Bottle',
      unitPrice: displayPrice.amount,
      currencyCode: displayPrice.currencyCode,
      tagTone: 'teal',
    },
  ];

  normalizedTiers.forEach((tier, index) => {
    const tierAmount = Number(tier.price.amount);
    const discount = baseUnitAmount > 0 ? Math.round(((baseUnitAmount - tierAmount) / baseUnitAmount) * 100) : 0;
    const savingsPerBottle = baseUnitAmount > tierAmount ? baseUnitAmount - tierAmount : 0;
    const quantityText = tier.maxQuantity && tier.maxQuantity >= tier.minQuantity
      ? `${tier.minQuantity}–${tier.maxQuantity} Bottles`
      : `${tier.minQuantity}+ Bottles`;

    rows.push({
      id: `${tier.minQuantity}-${tier.maxQuantity ?? 'plus'}`,
      label: quantityText,
      tag: index === 0 ? 'Popular' : 'Best Value',
      tagTone: index === 0 ? 'teal' : 'gold',
      discount: discount > 0 ? discount : undefined,
      saveAmount: savingsPerBottle > 0 ? formatPrice(savingsPerBottle.toFixed(2), tier.price.currencyCode) : undefined,
      unitPrice: tier.price.amount,
      currencyCode: tier.price.currencyCode,
    });
  });

  return (
    <div className="rounded-md bg-popover px-3 py-2">
      <p className="text-base font-semibold leading-8">Volume Pricing</p>

      <div className="mt-1 flex flex-col gap-1.5 pb-1">
        {rows.map(row => {
          const isHighlighted = row.tag != null;
          const isActive = row.id === activeRowId;

          return (
            <div
              key={row.id}
              className={`flex items-center justify-between gap-3 rounded-md px-3 py-2.5 transition-colors ${
                isActive
                  ? 'bg-[#0B2E2F]/[0.08] ring-1 ring-[#0B2E2F]/[0.2]'
                  : isHighlighted
                  ? 'bg-[#0B2E2F]/[0.04] ring-1 ring-[#0B2E2F]/[0.08]'
                  : ''
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`text-sm font-semibold ${isHighlighted ? 'text-foreground' : 'text-foreground/70'}`}>
                  {row.label}
                </span>
                {row.tag && (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${
                      row.tagTone === 'teal'
                        ? 'bg-[#0B2E2F] text-[#F4F1EA]'
                        : 'bg-[#8B7340] text-[#FAF8F2]'
                    }`}
                  >
                    {row.tag}
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-2 shrink-0">
                {row.discount && (
                  <span className="text-xs font-medium text-[#0B2E2F]/50">
                    {row.discount}% off
                  </span>
                )}
                {row.saveAmount && (
                  <span className="text-xs font-medium text-[#0B2E2F]/65">
                    Save {row.saveAmount}
                  </span>
                )}
                <span className={`text-sm font-bold tabular-nums ${isHighlighted ? 'text-foreground' : 'text-foreground/70'}`}>
                  {formatPrice(row.unitPrice, row.currencyCode)}
                </span>
                <span className="text-xs text-foreground/40">each</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
