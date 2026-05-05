import type { Product, ProductFulfillmentEstimate, ProductVariant } from '@/lib/swell/types';

const DEFAULT_BACKORDER_THRESHOLD = 0;
const LOW_STOCK_THRESHOLD = 3;
export const READY_TO_SHIP_LABEL = 'Ships in 2-3 days';
export const HIGH_DEMAND_SHIPPING_LABEL = 'Ships in about 1 week due to high demand';

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
  label: 'In stock' | 'Low stock' | 'High demand';
  shortLabel: 'Ready' | 'Low stock' | 'High demand';
  message: string;
  shippingLeadTimeLabel: string;
};

export function resolveAvailableQuantity(product: Product, variant?: ProductVariant | null): number | null {
  if (typeof variant?.availableToShipNow === 'number') {
    return Math.max(0, variant.availableToShipNow);
  }

  if (typeof product.availableToShipNow === 'number') {
    return Math.max(0, product.availableToShipNow);
  }

  return 0;
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
  const availableQuantity = resolveAvailableQuantity(product, variant);
  const isHighDemand = availableQuantity === null || availableQuantity <= backorderThreshold;

  if (isHighDemand) {
    return {
      availableQuantity,
      isBackorder: true,
      isHighDemand: true,
      isLowStock: false,
      label: 'High demand',
      shortLabel: 'High demand',
      message: HIGH_DEMAND_SHIPPING_LABEL,
      shippingLeadTimeLabel: HIGH_DEMAND_SHIPPING_LABEL,
    };
  }

  const isLowStock = availableQuantity !== null && availableQuantity <= LOW_STOCK_THRESHOLD;

  if (isLowStock) {
    return {
      availableQuantity,
      isBackorder: false,
      isHighDemand: false,
      isLowStock: true,
      label: 'Low stock',
      shortLabel: 'Low stock',
      message: `Only ${availableQuantity} ready now. ${READY_TO_SHIP_LABEL}.`,
      shippingLeadTimeLabel: READY_TO_SHIP_LABEL,
    };
  }

  return {
    availableQuantity,
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
  const availableToShipNow = inventory.availableQuantity ?? 0;
  const normalizedRequestedQuantity = Math.max(1, Math.floor(Number(requestedQuantity) || 1));
  const isHighDemand = inventory.isHighDemand || availableToShipNow < normalizedRequestedQuantity;

  return {
    label: isHighDemand ? HIGH_DEMAND_SHIPPING_LABEL : inventory.message,
    availableToShipNow,
    isHighDemand,
  };
}
