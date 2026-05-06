import 'server-only';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { checkoutOrders, inventoryItems, inventoryMovements } from '@/lib/db/schema';
import { HIGH_DEMAND_SHIPPING_LABEL, READY_TO_SHIP_LABEL } from '@/lib/inventory';
import type {
  CatalogAvailabilityProduct,
  CatalogAvailabilityProductInput,
} from '@/lib/catalog/availability-types';
import type { Product, ProductVariant } from '@/lib/swell/types';

type InventoryItemRow = typeof inventoryItems.$inferSelect;

type MatchSubject = {
  productId: string | null;
  variantId: string | null;
  sku: string | null;
  productHandle: string | null;
};

type AvailabilityEstimate = {
  internalOnHand: number | null;
  internalAllocated: number;
  availableToShipNow: number;
  isHighDemand: boolean;
  shippingLeadTimeLabel: string;
  internalInventoryMatched: boolean;
  matchedItemId: string | null;
};

type CheckoutLineLike = {
  merchandiseId?: unknown;
  skuNumber?: unknown;
  productHandle?: unknown;
  quantity?: unknown;
};

type SwellVariantLike = {
  id: string;
  sku?: string;
  selectedOptions?: Array<{ name: string; value: string }>;
  internalOnHand?: number | null;
  internalAllocated?: number;
  availableToShipNow?: number;
  isHighDemand?: boolean;
  shippingLeadTimeLabel?: string;
  internalInventoryMatched?: boolean;
};

type SwellProductLike = {
  id: string;
  handle: string;
  variants: {
    edges: Array<{
      node: SwellVariantLike;
    }>;
  };
  internalOnHand?: number | null;
  internalAllocated?: number;
  availableToShipNow?: number;
  isHighDemand?: boolean;
  shippingLeadTimeLabel?: string;
  internalInventoryMatched?: boolean;
};

type CatalogAvailabilityProductSubject = {
  handle: string;
  productId: string | null;
  variants: Array<{
    id: string;
    sku: string | null;
  }>;
};

function normalizeComparable(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function normalizeProductMatchId(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const storefrontProductMatch = trimmed.match(/^swell:\/\/product\/(.+)$/);
  if (storefrontProductMatch?.[1]) {
    return decodeURIComponent(storefrontProductMatch[1]);
  }

  const merchandiseProductMatch = trimmed.match(/^swell:product:([^:]+)/);
  if (merchandiseProductMatch?.[1]) {
    return decodeURIComponent(merchandiseProductMatch[1]);
  }

  return trimmed;
}

function normalizeVariantMatchId(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const merchandiseVariantMatch = trimmed.match(/^swell:product:[^:]+:variant:(.+)$/);
  if (merchandiseVariantMatch?.[1]) {
    return decodeURIComponent(merchandiseVariantMatch[1]);
  }

  return trimmed;
}

function extractBackendProductId(productId: string): string | null {
  const match = productId.match(/^swell:\/\/product\/(.+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function parseSwellMerchandiseId(value?: unknown): {
  productId: string | null;
  variantId: string | null;
} {
  if (typeof value !== 'string') {
    return { productId: null, variantId: null };
  }

  const match = value.match(/^swell:product:([^:]+)(?::variant:(.+))?$/);
  return {
    productId: match?.[1] ? decodeURIComponent(match[1]) : null,
    variantId: match?.[2] ? decodeURIComponent(match[2]) : null,
  };
}

function getVariantSubject(product: Product, variant: ProductVariant): MatchSubject {
  const parsed = parseSwellMerchandiseId(variant.id);

  return {
    productId: parsed.productId || extractBackendProductId(product.id),
    variantId: parsed.variantId,
    sku: normalizeComparable(variant.sku),
    productHandle: normalizeComparable(product.handle),
  };
}

function getProductSubject(product: Product): MatchSubject {
  return {
    productId: extractBackendProductId(product.id),
    variantId: null,
    sku: null,
    productHandle: normalizeComparable(product.handle),
  };
}

function getSwellVariantSubject(product: SwellProductLike, variant: SwellVariantLike): MatchSubject {
  const parsed = parseSwellMerchandiseId(variant.id);

  return {
    productId: parsed.productId || extractBackendProductId(product.id),
    variantId: parsed.variantId,
    sku: normalizeComparable(variant.sku),
    productHandle: normalizeComparable(product.handle),
  };
}

function getSwellProductSubject(product: SwellProductLike): MatchSubject {
  return {
    productId: extractBackendProductId(product.id),
    variantId: null,
    sku: null,
    productHandle: normalizeComparable(product.handle),
  };
}

function getCatalogProductSubject(product: CatalogAvailabilityProductSubject): MatchSubject {
  return {
    productId: product.productId,
    variantId: null,
    sku: null,
    productHandle: normalizeComparable(product.handle),
  };
}

function getCatalogVariantSubject(
  product: CatalogAvailabilityProductSubject,
  variant: CatalogAvailabilityProductSubject['variants'][number],
): MatchSubject {
  const parsed = parseSwellMerchandiseId(variant.id);

  return {
    productId: parsed.productId || product.productId,
    variantId: parsed.variantId || normalizeVariantMatchId(variant.id),
    sku: normalizeComparable(variant.sku),
    productHandle: normalizeComparable(product.handle),
  };
}

function getOrderLineSubject(line: CheckoutLineLike): MatchSubject {
  const parsed = parseSwellMerchandiseId(line.merchandiseId);

  return {
    productId: parsed.productId,
    variantId: parsed.variantId,
    sku: typeof line.skuNumber === 'string' ? normalizeComparable(line.skuNumber) : null,
    productHandle: typeof line.productHandle === 'string' ? normalizeComparable(line.productHandle) : null,
  };
}

function findMatchingInventoryItem(
  subject: MatchSubject,
  items: InventoryItemRow[],
): InventoryItemRow | null {
  if (subject.variantId) {
    const match = items.find(
      item => normalizeVariantMatchId(item.swellVariantId) === subject.variantId,
    );
    if (match) return match;
  }

  if (subject.productId) {
    const match = items.find(
      item => normalizeProductMatchId(item.swellProductId) === subject.productId,
    );
    if (match) return match;
  }

  if (subject.sku) {
    const match = items.find(
      item => item.sku && normalizeComparable(item.sku) === subject.sku,
    );
    if (match) return match;
  }

  if (subject.productHandle) {
    const match = items.find(
      item =>
        item.productHandle &&
        normalizeComparable(item.productHandle) === subject.productHandle,
    );
    if (match) return match;
  }

  return null;
}

function normalizeQuantity(value: unknown) {
  const quantity = Math.floor(Number(value));
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

async function getSellableInventoryItems() {
  return db
    .select()
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.active, true),
        eq(inventoryItems.itemType, 'sellable_product'),
      ),
    );
}

async function getItemBalances(itemIds: string[]) {
  if (itemIds.length === 0) {
    return new Map<string, number>();
  }

  const rows = await db
    .select({
      itemId: inventoryMovements.itemId,
      balance: sql<number>`coalesce(sum(${inventoryMovements.quantityDelta}), 0)::int`,
    })
    .from(inventoryMovements)
    .where(inArray(inventoryMovements.itemId, itemIds))
    .groupBy(inventoryMovements.itemId);

  return new Map(rows.map(row => [row.itemId, Number(row.balance || 0)]));
}

async function getAllocatedPaidQuantities(items: InventoryItemRow[]) {
  if (items.length === 0) {
    return new Map<string, number>();
  }

  const rows = await db
    .select({
      lines: checkoutOrders.lines,
    })
    .from(checkoutOrders)
    .where(sql`
      lower(coalesce(${checkoutOrders.paymentStatus}, '')) in ('finished', 'paid')
      and coalesce(${checkoutOrders.fulfillmentStatus}::text, 'pending') not in ('packed', 'handed_to_carrier')
    `);

  const allocated = new Map<string, number>();

  for (const row of rows) {
    const lines = Array.isArray(row.lines) ? (row.lines as CheckoutLineLike[]) : [];

    for (const line of lines) {
      const item = findMatchingInventoryItem(getOrderLineSubject(line), items);
      if (!item) continue;

      allocated.set(
        item.id,
        (allocated.get(item.id) || 0) + normalizeQuantity(line.quantity),
      );
    }
  }

  return allocated;
}

function buildEstimate(
  item: InventoryItemRow | null,
  balances: Map<string, number>,
  allocations: Map<string, number>,
): AvailabilityEstimate {
  if (!item) {
    return {
      internalOnHand: null,
      internalAllocated: 0,
      availableToShipNow: 0,
      isHighDemand: true,
      shippingLeadTimeLabel: HIGH_DEMAND_SHIPPING_LABEL,
      internalInventoryMatched: false,
      matchedItemId: null,
    };
  }

  const internalOnHand = balances.get(item.id) || 0;
  const internalAllocated = allocations.get(item.id) || 0;
  const availableToShipNow = Math.max(0, internalOnHand - internalAllocated);
  const isHighDemand = availableToShipNow <= 0;

  return {
    internalOnHand,
    internalAllocated,
    availableToShipNow,
    isHighDemand,
    shippingLeadTimeLabel: isHighDemand ? HIGH_DEMAND_SHIPPING_LABEL : READY_TO_SHIP_LABEL,
    internalInventoryMatched: true,
    matchedItemId: item.id,
  };
}

function buildAggregateEstimate(estimates: AvailabilityEstimate[]): AvailabilityEstimate {
  const matched = estimates.filter(estimate => estimate.internalInventoryMatched);

  if (matched.length === 0) {
    return buildEstimate(null, new Map(), new Map());
  }

  const uniqueByItem = new Map<string, AvailabilityEstimate>();
  for (const estimate of matched) {
    if (!estimate.matchedItemId) continue;
    if (!uniqueByItem.has(estimate.matchedItemId)) {
      uniqueByItem.set(estimate.matchedItemId, estimate);
    }
  }

  const uniqueEstimates = [...uniqueByItem.values()];
  const internalOnHand = uniqueEstimates.reduce(
    (sum, estimate) => sum + (estimate.internalOnHand || 0),
    0,
  );
  const internalAllocated = uniqueEstimates.reduce(
    (sum, estimate) => sum + estimate.internalAllocated,
    0,
  );
  const availableToShipNow = uniqueEstimates.reduce(
    (sum, estimate) => sum + estimate.availableToShipNow,
    0,
  );
  const isHighDemand = availableToShipNow <= 0;

  return {
    internalOnHand,
    internalAllocated,
    availableToShipNow,
    isHighDemand,
    shippingLeadTimeLabel: isHighDemand ? HIGH_DEMAND_SHIPPING_LABEL : READY_TO_SHIP_LABEL,
    internalInventoryMatched: true,
    matchedItemId: null,
  };
}

function toAvailabilityFields(estimate: AvailabilityEstimate) {
  return {
    internalOnHand: estimate.internalOnHand,
    internalAllocated: estimate.internalAllocated,
    availableToShipNow: estimate.availableToShipNow,
    isHighDemand: estimate.isHighDemand,
    shippingLeadTimeLabel: estimate.shippingLeadTimeLabel,
    internalInventoryMatched: estimate.internalInventoryMatched,
  };
}

function toPublicAvailabilityFields(estimate: AvailabilityEstimate) {
  return {
    availableToShipNow: estimate.availableToShipNow,
    isHighDemand: estimate.isHighDemand,
    shippingLeadTimeLabel: estimate.shippingLeadTimeLabel,
    internalInventoryMatched: estimate.internalInventoryMatched,
  };
}

function normalizeCatalogAvailabilityProducts(
  products: CatalogAvailabilityProductInput[],
): CatalogAvailabilityProductSubject[] {
  const byHandle = new Map<string, CatalogAvailabilityProductSubject>();

  for (const product of products) {
    const handle = normalizeComparable(product.handle);
    if (!handle) continue;

    const existing = byHandle.get(handle);
    const normalizedProductId =
      product.productId ? normalizeProductMatchId(product.productId) : null;
    const nextProduct: CatalogAvailabilityProductSubject =
      existing || {
        handle,
        productId: normalizedProductId,
        variants: [],
      };

    if (!nextProduct.productId && normalizedProductId) {
      nextProduct.productId = normalizedProductId;
    }

    const seenVariantKeys = new Set(nextProduct.variants.map(variant => variant.id));
    for (const variant of product.variants || []) {
      const id = variant.id?.trim();
      if (!id || seenVariantKeys.has(id)) continue;

      nextProduct.variants.push({
        id,
        sku: normalizeComparable(variant.sku),
      });
      seenVariantKeys.add(id);
    }

    byHandle.set(handle, nextProduct);
  }

  return [...byHandle.values()];
}

export async function getCatalogAvailability(
  products: CatalogAvailabilityProductInput[],
): Promise<CatalogAvailabilityProduct[]> {
  const normalizedProducts = normalizeCatalogAvailabilityProducts(products);
  if (normalizedProducts.length === 0) {
    return [];
  }

  const items = await getSellableInventoryItems();
  const [balances, allocations] = await Promise.all([
    getItemBalances(items.map(item => item.id)),
    getAllocatedPaidQuantities(items),
  ]);

  return normalizedProducts.map(product => {
    const variantAvailability = product.variants.map(variant => {
      const item = findMatchingInventoryItem(
        getCatalogVariantSubject(product, variant),
        items,
      );
      const estimate = buildEstimate(item, balances, allocations);

      return {
        variant,
        estimate,
      };
    });
    const variants = variantAvailability.map(({ variant, estimate }) => ({
      id: variant.id,
      sku: variant.sku,
      ...toPublicAvailabilityFields(estimate),
    }));
    const productItem = findMatchingInventoryItem(getCatalogProductSubject(product), items);
    const productEstimate = productItem
      ? buildEstimate(productItem, balances, allocations)
      : buildAggregateEstimate(variantAvailability.map(({ estimate }) => estimate));

    return {
      handle: product.handle,
      productId: product.productId,
      ...toPublicAvailabilityFields(productEstimate),
      variants,
    };
  });
}

export async function hydrateProductsWithInternalAvailability(
  products: Product[],
): Promise<Product[]> {
  if (products.length === 0) {
    return [];
  }

  const items = await getSellableInventoryItems();
  const [balances, allocations] = await Promise.all([
    getItemBalances(items.map(item => item.id)),
    getAllocatedPaidQuantities(items),
  ]);

  return products.map(product => {
    const variantAvailability = product.variants.map(variant => {
      const item = findMatchingInventoryItem(getVariantSubject(product, variant), items);
      const estimate = buildEstimate(item, balances, allocations);

      return {
        variant,
        estimate,
      };
    });
    const hydratedVariants = variantAvailability.map(({ variant, estimate }) => ({
      ...variant,
      ...toAvailabilityFields(estimate),
    }));

    const productItem = findMatchingInventoryItem(getProductSubject(product), items);
    const productEstimate = productItem
      ? buildEstimate(productItem, balances, allocations)
      : buildAggregateEstimate(variantAvailability.map(({ estimate }) => estimate));

    return {
      ...product,
      ...toAvailabilityFields(productEstimate),
      variants: hydratedVariants,
    };
  });
}

export async function hydrateProductWithInternalAvailability(
  product: Product | null,
): Promise<Product | null> {
  if (!product) {
    return null;
  }

  const [hydrated] = await hydrateProductsWithInternalAvailability([product]);
  return hydrated || product;
}

export async function hydrateSwellProductsWithInternalAvailability<T extends SwellProductLike>(
  products: T[],
): Promise<T[]> {
  if (products.length === 0) {
    return [];
  }

  const items = await getSellableInventoryItems();
  const [balances, allocations] = await Promise.all([
    getItemBalances(items.map(item => item.id)),
    getAllocatedPaidQuantities(items),
  ]);

  return products.map(product => {
    const variantAvailability = product.variants.edges.map(edge => {
      const item = findMatchingInventoryItem(getSwellVariantSubject(product, edge.node), items);
      const estimate = buildEstimate(item, balances, allocations);

      return {
        edge,
        estimate,
      };
    });

    const productItem = findMatchingInventoryItem(getSwellProductSubject(product), items);
    const productEstimate = productItem
      ? buildEstimate(productItem, balances, allocations)
      : buildAggregateEstimate(variantAvailability.map(({ estimate }) => estimate));

    return {
      ...product,
      ...toAvailabilityFields(productEstimate),
      variants: {
        ...product.variants,
        edges: variantAvailability.map(({ edge, estimate }) => ({
          ...edge,
          node: {
            ...edge.node,
            ...toAvailabilityFields(estimate),
          },
        })),
      },
    };
  });
}

export async function hydrateSwellProductWithInternalAvailability<T extends SwellProductLike>(
  product: T | null,
): Promise<T | null> {
  if (!product) {
    return null;
  }

  const [hydrated] = await hydrateSwellProductsWithInternalAvailability([product]);
  return hydrated || product;
}
