import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { checkoutOrders } from '@/lib/db/schema';
import { hasAnyVariantInStock } from '@/lib/inventory';
import type { Product } from '@/lib/swell/types';

type OrderLineLike = {
  productHandle?: unknown;
  quantity?: unknown;
  lineTotal?: {
    amount?: unknown;
  };
};

export type ProductPurchaseMetrics = {
  quantity: number;
  revenue: number;
  orderCount: number;
};

export type ProductPurchaseMetricsByHandle = Map<string, ProductPurchaseMetrics>;

function normalizeHandle(value?: string | null): string {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function parsePositiveNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getLineQuantity(line: OrderLineLike): number {
  const quantity = parsePositiveNumber(line.quantity);
  return quantity > 0 ? quantity : 1;
}

function getLineRevenue(line: OrderLineLike): number {
  return parsePositiveNumber(line.lineTotal?.amount);
}

function getProductStockQuantity(product: Product): number {
  const variantStockLevels = product.variants
    .map(variant => (typeof variant.availableToShipNow === 'number' ? Math.max(0, variant.availableToShipNow) : null))
    .filter((value): value is number => value !== null);

  if (variantStockLevels.length > 0) {
    return variantStockLevels.reduce((sum, value) => sum + value, 0);
  }

  if (typeof product.availableToShipNow === 'number') {
    return Math.max(0, product.availableToShipNow);
  }

  return 0;
}

function getProductPurchaseQuantity(
  product: Product,
  purchaseMetricsByHandle: ProductPurchaseMetricsByHandle
): number {
  const localMetric = purchaseMetricsByHandle.get(normalizeHandle(product.handle));
  if (localMetric && localMetric.quantity > 0) {
    return localMetric.quantity;
  }

  return Number(product.purchaseCount ?? 0) || 0;
}

export async function getProductPurchaseMetricsByHandle(): Promise<ProductPurchaseMetricsByHandle> {
  try {
    const rows = await db
      .select({
        orderId: checkoutOrders.orderId,
        lines: checkoutOrders.lines,
      })
      .from(checkoutOrders)
      .where(
        sql`lower(coalesce(${checkoutOrders.paymentStatus}, '')) in ('finished', 'paid')`
      );

    const metrics = new Map<string, ProductPurchaseMetrics>();

    for (const row of rows) {
      const lines = Array.isArray(row.lines) ? (row.lines as OrderLineLike[]) : [];
      const countedHandles = new Set<string>();

      for (const line of lines) {
        const handle = normalizeHandle(
          typeof line.productHandle === 'string' ? line.productHandle : null
        );
        if (!handle) continue;

        const existing = metrics.get(handle) ?? {
          quantity: 0,
          revenue: 0,
          orderCount: 0,
        };

        existing.quantity += getLineQuantity(line);
        existing.revenue += getLineRevenue(line);
        if (!countedHandles.has(handle)) {
          existing.orderCount += 1;
          countedHandles.add(handle);
        }

        metrics.set(handle, existing);
      }
    }

    return metrics;
  } catch (error) {
    console.error('Failed to load product purchase metrics:', error);
    return new Map();
  }
}

export function sortProductsForMerchandising(
  products: Product[],
  purchaseMetricsByHandle: ProductPurchaseMetricsByHandle = new Map()
): Product[] {
  return [...products].sort((a, b) => {
    const aHasStock = hasAnyVariantInStock(a) ? 0 : 1;
    const bHasStock = hasAnyVariantInStock(b) ? 0 : 1;
    if (aHasStock !== bHasStock) return aHasStock - bHasStock;

    const purchaseDifference =
      getProductPurchaseQuantity(b, purchaseMetricsByHandle) -
      getProductPurchaseQuantity(a, purchaseMetricsByHandle);
    if (purchaseDifference !== 0) return purchaseDifference;

    const stockDifference = getProductStockQuantity(b) - getProductStockQuantity(a);
    if (stockDifference !== 0) return stockDifference;

    return a.title.localeCompare(b.title);
  });
}
