import type { Product, ProductFulfillmentEstimate, ProductVariant } from '@/lib/swell/types';

const DEFAULT_BACKORDER_THRESHOLD = 0;
const LOW_STOCK_THRESHOLD = 3;
export const READY_TO_SHIP_LABEL = 'Ships in 2-3 days';
export const HIGH_DEMAND_SHIPPING_LABEL = 'Ships in about 1 week due to high demand';
export const BACK_IN_STOCK_LABEL = 'Get notified when available';

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
  isHighDemand: boolean;
  isLowStock: boolean;
  label: 'In stock' | 'Low stock' | 'High demand' | 'Backorder';
  shortLabel: 'Ready' | 'Low stock' | 'High demand' | 'Get notified';
  message: string;
  shippingLeadTimeLabel: string;
};

export function resolveInternalAvailableQuantity(product: Product, variant?: ProductVariant | null): number | null {
  if (typeof variant?.availableToShipNow === 'number') {
    return Math.max(0, variant.availableToShipNow);
  }

  if (typeof product.availableToShipNow === 'number') {
    return Math.max(0, product.availableToShipNow);
  }

  return null;
}

export function resolveSwellAvailableQuantity(product: Product, variant?: ProductVariant | null): number | null {
  if (typeof variant?.stockLevel === 'number') {
    return Math.max(0, variant.stockLevel);
  }

  if (typeof product.stockLevel === 'number') {
    return Math.max(0, product.stockLevel);
  }

  return null;
}

export function isSwellBackorder(product: Product, variant?: ProductVariant | null): boolean {
  const subject = variant ?? product;
  const stockStatus = normalizeStockStatus(subject.stockStatus ?? product.stockStatus);
  const availableQuantity = resolveSwellAvailableQuantity(product, variant);
  const explicitlyBackordered = ['backorder', 'preorder', 'out_of_stock', 'sold_out'].includes(stockStatus || '');

  return (
    explicitlyBackordered ||
    subject.availableForSale === false ||
    (availableQuantity !== null && availableQuantity <= getBackorderThreshold())
  );
}

export function resolveAvailableQuantity(product: Product, variant?: ProductVariant | null): number | null {
  return resolveInternalAvailableQuantity(product, variant);
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
  const backorderThreshold = getBackorderThreshold();
  const internalAvailableQuantity = resolveInternalAvailableQuantity(product, variant);
  const swellAvailableQuantity = resolveSwellAvailableQuantity(product, variant);
  const backorder = isSwellBackorder(product, variant);

  if (backorder) {
    return {
      availableQuantity: swellAvailableQuantity,
      isBackorder: true,
      isHighDemand: false,
      isLowStock: false,
      label: 'Backorder',
      shortLabel: 'Get notified',
      message: BACK_IN_STOCK_LABEL,
      shippingLeadTimeLabel: BACK_IN_STOCK_LABEL,
    };
  }

  const hasExactAvailability =
    typeof variant?.availableToShipNow === 'number' ||
    typeof product.availableToShipNow === 'number' ||
    typeof variant?.internalInventoryMatched === 'boolean' ||
    typeof product.internalInventoryMatched === 'boolean';
  const isHighDemand =
    hasExactAvailability &&
    (internalAvailableQuantity === null || internalAvailableQuantity <= backorderThreshold);

  if (isHighDemand) {
    return {
      availableQuantity: internalAvailableQuantity,
      isBackorder: false,
      isHighDemand: true,
      isLowStock: false,
      label: 'High demand',
      shortLabel: 'High demand',
      message: HIGH_DEMAND_SHIPPING_LABEL,
      shippingLeadTimeLabel: HIGH_DEMAND_SHIPPING_LABEL,
    };
  }

  const displayQuantity = internalAvailableQuantity ?? swellAvailableQuantity;
  const isLowStock = displayQuantity !== null && displayQuantity <= LOW_STOCK_THRESHOLD;

  if (isLowStock) {
    return {
      availableQuantity: displayQuantity,
      isBackorder: false,
      isHighDemand: false,
      isLowStock: true,
      label: 'Low stock',
      shortLabel: 'Low stock',
      message: `Only ${displayQuantity} ready now. ${READY_TO_SHIP_LABEL}.`,
      shippingLeadTimeLabel: READY_TO_SHIP_LABEL,
    };
  }

  return {
    availableQuantity: displayQuantity,
    isBackorder: false,
    isHighDemand: false,
    isLowStock: false,
    label: 'In stock',
    shortLabel: 'Ready',
    message: READY_TO_SHIP_LABEL,
    shippingLeadTimeLabel: READY_TO_SHIP_LABEL,
  };
}

export function getProductFulfillmentEstimate(
  product: Product,
  variant?: ProductVariant | null,
  requestedQuantity = 1,
): ProductFulfillmentEstimate {
  const inventory = getInventoryState(product, variant);
  if (inventory.isBackorder) {
    return {
      label: inventory.message,
      availableToShipNow: 0,
      isHighDemand: false,
    };
  }

  const availableToShipNow = inventory.availableQuantity ?? 0;
  const normalizedRequestedQuantity = Math.max(1, Math.floor(Number(requestedQuantity) || 1));
  const isHighDemand =
    inventory.isHighDemand ||
    (inventory.availableQuantity !== null && availableToShipNow < normalizedRequestedQuantity);

  return {
    label: isHighDemand ? HIGH_DEMAND_SHIPPING_LABEL : inventory.message,
    availableToShipNow,
    isHighDemand,
  };
}
