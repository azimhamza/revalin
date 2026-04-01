import { thumbHashToDataURL } from 'thumbhash';
import type { Money, Product, ProductCollectionSortKey, ProductSortKey, ProductVariant } from './types';

const DEFAULT_BLUR_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop stop-color='#d9d6ce' offset='0'/><stop stop-color='#c8c4ba' offset='1'/></linearGradient></defs><rect width='24' height='24' fill='url(#g)'/></svg>`;
export const DEFAULT_BLUR_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(DEFAULT_BLUR_SVG)}`;

export const getImageBlurDataURL = (thumbhash?: string) => thumbhash || DEFAULT_BLUR_DATA_URL;

// Format price utility
export const formatPrice = (price: string, currencyCode: string): string => {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currencyCode,
    currencyDisplay: 'narrowSymbol',
  }).format(parseFloat(price));
};

// Helper for returning the expected error state to actions instead of throwing.
export const handleFormActionError = (error: unknown, defaultMessage: string) => {
  return {
    errors: {
      formErrors: [(error as Error)?.message || defaultMessage],
    },
  };
};

// Thumbhash utilities
export function thumbhashToDataURL(thumbhash: string): string {
  try {
    // Convert base64 thumbhash to Uint8Array
    const thumbhashData = Uint8Array.from(atob(thumbhash), c => c.charCodeAt(0));

    // Convert thumbhash to data URL
    return thumbHashToDataURL(thumbhashData);
  } catch (error) {
    console.error('Error converting thumbhash to data URL:', error);
    return '';
  }
}

export function mapSortKeys(
  sortKey: string | undefined,
  type: 'product'
): { sortKey: ProductSortKey; reverse: boolean };
export function mapSortKeys(
  sortKey: string | undefined,
  type: 'collection'
): { sortKey: ProductCollectionSortKey; reverse: boolean };
export function mapSortKeys(
  sortKey: string | undefined,
  type: 'product' | 'collection' = 'product'
): { sortKey: ProductSortKey | ProductCollectionSortKey; reverse: boolean } {
  switch (sortKey) {
    case 'price-asc':
      return { sortKey: 'PRICE', reverse: false };
    case 'price-desc':
      return { sortKey: 'PRICE', reverse: true };
    case 'newest':
      if (type === 'collection') {
        return { sortKey: 'CREATED', reverse: false };
      }
      return { sortKey: 'CREATED_AT', reverse: false };
    case 'oldest':
      if (type === 'collection') {
        return { sortKey: 'CREATED', reverse: true };
      }
      return { sortKey: 'CREATED_AT', reverse: true };
    default:
      return { sortKey: 'RELEVANCE', reverse: false };
  }
}

export const getSwellProductId = (gid: string) => {
  return gid.split('/').pop() || '';
};

export function getDisplayPrice(product: Product, selectedVariant?: ProductVariant | null): Money {
  return selectedVariant?.price || product.priceRange.minVariantPrice;
}

export function getDisplayCompareAtPrice(
  product: Product,
  selectedVariant?: ProductVariant | null,
  currentPrice?: Money
): Money | null {
  const resolvedPrice = currentPrice || getDisplayPrice(product, selectedVariant);
  const candidate = selectedVariant ? selectedVariant.compareAtPrice ?? null : product.compareAtPrice;

  if (!candidate) return null;

  return Number(candidate.amount || 0) > Number(resolvedPrice.amount || 0) ? candidate : null;
}

export function getDiscountPercentage(compareAtPrice: Money | null | undefined, currentPrice: Money): number | null {
  if (!compareAtPrice) return null;

  const compareAmount = Number(compareAtPrice.amount || 0);
  const currentAmount = Number(currentPrice.amount || 0);

  if (!Number.isFinite(compareAmount) || !Number.isFinite(currentAmount) || compareAmount <= currentAmount) {
    return null;
  }

  return Math.round(((compareAmount - currentAmount) / compareAmount) * 100);
}

/**
 * Resolve the effective per-unit price given a quantity and optional bulk pricing tiers.
 * Returns the base price when no tier matches.
 */
export function resolveUnitPrice(
  basePrice: string,
  quantity: number,
  tiers?: { minQuantity: number; maxQuantity?: number; price: { amount: string } }[]
): string {
  if (!tiers?.length || quantity <= 0) return basePrice;

  const matchingTier = tiers
    .filter(t => quantity >= t.minQuantity && (!t.maxQuantity || quantity <= t.maxQuantity))
    .sort((a, b) => b.minQuantity - a.minQuantity)[0];

  return matchingTier?.price.amount ?? basePrice;
}
