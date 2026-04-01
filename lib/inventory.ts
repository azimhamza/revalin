import type { Product, ProductVariant } from '@/lib/swell/types';

const DEFAULT_BACKORDER_THRESHOLD = 0;
const LOW_STOCK_THRESHOLD = 3;

function normalizeStockStatus(value?: string) {
  return value?.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function getBackorderThreshold() {
  const rawValue = Number(process.env.NEXT_PUBLIC_BACKORDER_STOCK_THRESHOLD);
  return Number.isFinite(rawValue) ? rawValue : DEFAULT_BACKORDER_THRESHOLD;
}

export type InventoryState = {
  availableQuantity: number | null;
  isBackorder: boolean;
  isLowStock: boolean;
  label: 'In stock' | 'Low stock' | 'Backorder';
  shortLabel: 'Ready' | 'Low stock' | 'Backorder';
  message: string;
};

export function resolveAvailableQuantity(product: Product, variant?: ProductVariant | null): number | null {
  if (typeof variant?.stockLevel === 'number') {
    return variant.stockLevel;
  }

  if (!variant || product.variants.length <= 1) {
    return typeof product.stockLevel === 'number' ? product.stockLevel : null;
  }

  return null;
}

/**
 * Returns true if the product has at least one variant that is not backordered.
 * Useful for sorting product listings where some variants may be in stock
 * even when the product-level stock status says out_of_stock.
 */
export function hasAnyVariantInStock(product: Product): boolean {
  if (product.variants.length === 0) {
    return !getInventoryState(product).isBackorder;
  }
  return product.variants.some(variant => {
    const state = getInventoryState(product, variant);
    return !state.isBackorder;
  });
}

export function getInventoryState(product: Product, variant?: ProductVariant | null): InventoryState {
  const subject = variant ?? product;
  const stockStatus = normalizeStockStatus(subject.stockStatus ?? product.stockStatus);
  const backorderThreshold = getBackorderThreshold();
  const availableQuantity = resolveAvailableQuantity(product, variant);
  const explicitlyBackordered = ['backorder', 'preorder', 'out_of_stock', 'sold_out'].includes(stockStatus || '');
  const isBackorder =
    explicitlyBackordered ||
    subject.availableForSale === false ||
    (availableQuantity !== null && availableQuantity <= backorderThreshold);

  if (isBackorder) {
    return {
      availableQuantity,
      isBackorder: true,
      isLowStock: false,
      label: 'Backorder',
      shortLabel: 'Backorder',
      message: 'This item is on backorder. Leave your email and we will notify you as soon as it is ready again.',
    };
  }

  const isLowStock = availableQuantity !== null && availableQuantity <= LOW_STOCK_THRESHOLD;

  if (isLowStock) {
    return {
      availableQuantity,
      isBackorder: false,
      isLowStock: true,
      label: 'Low stock',
      shortLabel: 'Low stock',
      message: `Only ${availableQuantity} ${availableQuantity === 1 ? 'unit is' : 'units are'} ready to ship.`,
    };
  }

  if (availableQuantity !== null) {
    return {
      availableQuantity,
      isBackorder: false,
      isLowStock: false,
      label: 'In stock',
      shortLabel: 'Ready',
      message: `${availableQuantity} ${availableQuantity === 1 ? 'unit is' : 'units are'} ready to ship.`,
    };
  }

  return {
    availableQuantity: null,
    isBackorder: false,
    isLowStock: false,
    label: 'In stock',
    shortLabel: 'Ready',
    message: 'This item is ready to ship.',
  };
}
