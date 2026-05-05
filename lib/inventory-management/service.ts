import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  checkoutOrders,
  inventoryCategories,
  inventoryConsumptionRules,
  inventoryItems,
  inventoryMovements,
  inventoryVendors,
  purchaseOrderLines,
  purchaseOrders,
  purchaseReceiptLines,
  purchaseReceipts,
} from "@/lib/db/schema";
import type { CheckoutOrderLine, CheckoutOrderRecord } from "@/lib/checkout/types";
import { getProducts } from "@/lib/swell";
import type { Product, ProductVariant } from "@/lib/swell/types";

export type InventoryStockStatus =
  | "in_stock"
  | "low_stock"
  | "out_of_stock"
  | "negative";

export type InventoryItemType =
  | "sellable_product"
  | "packaging"
  | "label"
  | "sticker"
  | "card"
  | "insert"
  | "supply"
  | "other";

export type PurchaseOrderStatus =
  | "draft"
  | "ordered"
  | "partially_received"
  | "received"
  | "cancelled";

export type PurchasePaymentStatus =
  | "unpaid"
  | "partially_paid"
  | "paid"
  | "refunded"
  | "void";

type InventoryItemRow = typeof inventoryItems.$inferSelect;
type InventoryMovementRow = typeof inventoryMovements.$inferSelect;
type PurchaseOrderRow = typeof purchaseOrders.$inferSelect;

export type InventoryItemSummary = {
  id: string;
  name: string;
  code: string;
  sku: string | null;
  barcode: string | null;
  itemType: InventoryItemType;
  unit: string;
  location: string | null;
  reorderPoint: number;
  active: boolean;
  category: { id: string; name: string; code: string } | null;
  vendor: { id: string; name: string; code: string } | null;
  swellProductId: string | null;
  swellVariantId: string | null;
  productHandle: string | null;
  currentQuantity: number;
  stockStatus: InventoryStockStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InventoryMovementSummary = {
  id: string;
  itemId: string;
  itemName: string;
  itemCode: string;
  movementType: string;
  quantityDelta: number;
  quantityAfter: number;
  unitCost: string | null;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
  purchaseReceiptId: string | null;
  checkoutOrderId: string | null;
  checkoutOrderNumber: string | null;
  notes: string | null;
  metadata: unknown;
  createdAt: string;
};

export type InventoryDashboardData = {
  items: InventoryItemSummary[];
  movements: InventoryMovementSummary[];
  categories: Array<typeof inventoryCategories.$inferSelect>;
  vendors: Array<typeof inventoryVendors.$inferSelect>;
  rules: InventoryConsumptionRuleSummary[];
  stats: {
    totalItems: number;
    lowStock: number;
    outOfStock: number;
    negativeStock: number;
    activeRules: number;
  };
};

export type InventoryConsumptionRuleSummary = {
  id: string;
  name: string;
  consumedItemId: string;
  consumedItemName: string;
  consumedItemCode: string;
  appliesToItemId: string | null;
  appliesToSwellProductId: string | null;
  appliesToSwellVariantId: string | null;
  appliesToProductHandle: string | null;
  quantityPerOrder: number;
  active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseOrderSummary = {
  id: string;
  poNumber: string;
  vendor: { id: string; name: string; code: string } | null;
  status: PurchaseOrderStatus;
  paymentStatus: PurchasePaymentStatus;
  currencyCode: string;
  totalAmount: string;
  amountPaid: string;
  lineCount: number;
  orderedQuantity: number;
  receivedQuantity: number;
  paymentMethod: string | null;
  paymentReference: string | null;
  proofUrls: string[];
  expectedAt: string | null;
  orderedAt: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lines: PurchaseOrderLineSummary[];
};

export type PurchaseOrderLineSummary = {
  id: string;
  itemId: string;
  itemName: string;
  itemCode: string;
  quantityOrdered: number;
  quantityReceived: number;
  quantityRemaining: number;
  unitCost: string;
  lineTotal: string;
  notes: string | null;
};

export type PurchasingDashboardData = {
  purchaseOrders: PurchaseOrderSummary[];
  vendors: Array<typeof inventoryVendors.$inferSelect>;
  inventoryItems: InventoryItemSummary[];
  stats: {
    totalPurchaseOrders: number;
    openPurchaseOrders: number;
    unpaidPurchaseOrders: number;
    partiallyReceived: number;
  };
};

export type FulfillmentInventoryConsumption = {
  itemId: string;
  itemName: string;
  itemCode: string;
  itemType: InventoryItemType;
  unit: string;
  quantityDelta: number;
  quantityAfter: number;
  movementId: string;
};

export type FulfillmentConsumptionResult = {
  consumed: FulfillmentInventoryConsumption[];
  warnings: string[];
};

export type SwellInventorySyncResult = {
  productsSeen: number;
  variantsSeen: number;
  created: number;
  updated: number;
};

function normalizeCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCodeWithLimit(value: string, maxLength = 96) {
  const normalized = normalizeCode(value);
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength).replace(/[-_]+$/g, "");
}

function normalizeOptionalString(value?: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}

function normalizeComparable(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function extractBackendProductId(productId: string) {
  const match = productId.match(/^swell:\/\/product\/(.+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : productId;
}

function extractBackendVariantId(variantId: string) {
  const match = variantId.match(/^swell:product:[^:]+:variant:(.+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : variantId;
}

function normalizeMoneyString(value?: string | number | null) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Amount must be a valid non-negative number.");
  }

  return amount.toFixed(2);
}

function normalizeQuantity(value: number, fieldName = "quantity") {
  const quantity = Math.floor(Number(value));
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(`${fieldName} must be a positive whole number.`);
  }

  return quantity;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function toProofUrls(value?: string[] | null) {
  return Array.from(
    new Set(
      (value || [])
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
}

function getStockStatus(quantity: number, reorderPoint: number): InventoryStockStatus {
  if (quantity < 0) return "negative";
  if (quantity === 0) return "out_of_stock";
  if (reorderPoint > 0 && quantity <= reorderPoint) return "low_stock";
  return "in_stock";
}

async function getItemBalances(itemIds?: string[]) {
  if (itemIds && itemIds.length === 0) {
    return new Map<string, number>();
  }

  const conditions = itemIds?.length
    ? [inArray(inventoryMovements.itemId, itemIds)]
    : [];

  const rows = await db
    .select({
      itemId: inventoryMovements.itemId,
      balance: sql<number>`coalesce(sum(${inventoryMovements.quantityDelta}), 0)::int`,
    })
    .from(inventoryMovements)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(inventoryMovements.itemId);

  return new Map(rows.map((row) => [row.itemId, Number(row.balance || 0)]));
}

async function getItemBalance(itemId: string) {
  return (await getItemBalances([itemId])).get(itemId) || 0;
}

function mapInventoryItemRow(args: {
  item: InventoryItemRow;
  balance: number;
  category?: typeof inventoryCategories.$inferSelect | null;
  vendor?: typeof inventoryVendors.$inferSelect | null;
}): InventoryItemSummary {
  return {
    id: args.item.id,
    name: args.item.name,
    code: args.item.code,
    sku: args.item.sku,
    barcode: args.item.barcode,
    itemType: args.item.itemType as InventoryItemType,
    unit: args.item.unit,
    location: args.item.location,
    reorderPoint: args.item.reorderPoint,
    active: args.item.active,
    category: args.category
      ? {
          id: args.category.id,
          name: args.category.name,
          code: args.category.code,
        }
      : null,
    vendor: args.vendor
      ? {
          id: args.vendor.id,
          name: args.vendor.name,
          code: args.vendor.code,
        }
      : null,
    swellProductId: args.item.swellProductId,
    swellVariantId: args.item.swellVariantId,
    productHandle: args.item.productHandle,
    currentQuantity: args.balance,
    stockStatus: getStockStatus(args.balance, args.item.reorderPoint),
    notes: args.item.notes,
    createdAt: args.item.createdAt.toISOString(),
    updatedAt: args.item.updatedAt.toISOString(),
  };
}

function mapMovementRow(args: {
  movement: InventoryMovementRow;
  item: Pick<InventoryItemRow, "name" | "code">;
  purchaseOrder?: Pick<PurchaseOrderRow, "poNumber"> | null;
}): InventoryMovementSummary {
  return {
    id: args.movement.id,
    itemId: args.movement.itemId,
    itemName: args.item.name,
    itemCode: args.item.code,
    movementType: args.movement.movementType,
    quantityDelta: args.movement.quantityDelta,
    quantityAfter: args.movement.quantityAfter,
    unitCost: args.movement.unitCost,
    purchaseOrderId: args.movement.purchaseOrderId,
    purchaseOrderNumber: args.purchaseOrder?.poNumber || null,
    purchaseReceiptId: args.movement.purchaseReceiptId,
    checkoutOrderId: args.movement.checkoutOrderId,
    checkoutOrderNumber: args.movement.checkoutOrderNumber,
    notes: args.movement.notes,
    metadata: args.movement.metadata,
    createdAt: args.movement.createdAt.toISOString(),
  };
}

function parseSwellMerchandiseId(value: string) {
  const match = value.match(/^swell:product:([^:]+)(?::variant:(.+))?$/);
  return {
    productId: match?.[1] || null,
    variantId: match?.[2] || null,
  };
}

function orderLineMatchesItem(line: CheckoutOrderLine, item: InventoryItemRow) {
  const parsed = parseSwellMerchandiseId(line.merchandiseId);
  const lineSku = line.skuNumber?.trim().toLowerCase();

  if (item.swellVariantId && parsed.variantId === item.swellVariantId) return true;
  if (item.swellProductId && parsed.productId === item.swellProductId) return true;
  if (item.sku && lineSku && item.sku.trim().toLowerCase() === lineSku) return true;
  if (
    item.productHandle &&
    line.productHandle &&
    item.productHandle.trim().toLowerCase() === line.productHandle.trim().toLowerCase()
  ) {
    return true;
  }

  return false;
}

function ruleMatchesOrder(args: {
  rule: typeof inventoryConsumptionRules.$inferSelect;
  lines: CheckoutOrderLine[];
  matchedInventoryItemIds: Set<string>;
}) {
  const isGlobal =
    !args.rule.appliesToItemId &&
    !args.rule.appliesToSwellProductId &&
    !args.rule.appliesToSwellVariantId &&
    !args.rule.appliesToProductHandle;

  if (isGlobal) return true;

  if (
    args.rule.appliesToItemId &&
    args.matchedInventoryItemIds.has(args.rule.appliesToItemId)
  ) {
    return true;
  }

  return args.lines.some((line) => {
    const parsed = parseSwellMerchandiseId(line.merchandiseId);

    if (
      args.rule.appliesToSwellVariantId &&
      parsed.variantId === args.rule.appliesToSwellVariantId
    ) {
      return true;
    }

    if (
      args.rule.appliesToSwellProductId &&
      parsed.productId === args.rule.appliesToSwellProductId
    ) {
      return true;
    }

    if (
      args.rule.appliesToProductHandle &&
      line.productHandle.trim().toLowerCase() ===
        args.rule.appliesToProductHandle.trim().toLowerCase()
    ) {
      return true;
    }

    return false;
  });
}

async function insertMovement(args: {
  itemId: string;
  movementType: "initial_stock" | "purchase_received" | "manual_adjustment" | "fulfillment_consumed";
  quantityDelta: number;
  currentQuantity?: number;
  unitCost?: string | null;
  purchaseOrderId?: string | null;
  purchaseReceiptId?: string | null;
  purchaseReceiptLineId?: string | null;
  checkoutOrderId?: string | null;
  checkoutOrderNumber?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  idempotencyKey?: string | null;
  createdByUserId?: string | null;
  notes?: string | null;
  metadata?: unknown;
}) {
  const currentQuantity =
    typeof args.currentQuantity === "number"
      ? args.currentQuantity
      : await getItemBalance(args.itemId);
  const quantityAfter = currentQuantity + args.quantityDelta;

  const [movement] = await db
    .insert(inventoryMovements)
    .values({
      itemId: args.itemId,
      movementType: args.movementType,
      quantityDelta: args.quantityDelta,
      quantityAfter,
      unitCost: args.unitCost ?? null,
      purchaseOrderId: args.purchaseOrderId ?? null,
      purchaseReceiptId: args.purchaseReceiptId ?? null,
      purchaseReceiptLineId: args.purchaseReceiptLineId ?? null,
      checkoutOrderId: args.checkoutOrderId ?? null,
      checkoutOrderNumber: args.checkoutOrderNumber ?? null,
      sourceType: args.sourceType ?? null,
      sourceId: args.sourceId ?? null,
      idempotencyKey: args.idempotencyKey ?? null,
      createdByUserId: args.createdByUserId ?? null,
      notes: args.notes ?? null,
      metadata: args.metadata,
    })
    .onConflictDoNothing()
    .returning();

  return movement || null;
}

export async function createInventoryCategory(input: {
  name: string;
  code?: string | null;
  description?: string | null;
}) {
  const name = input.name.trim();
  if (!name) throw new Error("Category name is required.");

  const code = normalizeCode(input.code || name);
  if (!code) throw new Error("Category code is required.");

  const [category] = await db
    .insert(inventoryCategories)
    .values({
      name,
      code,
      description: normalizeOptionalString(input.description),
    })
    .returning();

  return category!;
}

export async function createInventoryVendor(input: {
  name: string;
  code?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
}) {
  const name = input.name.trim();
  if (!name) throw new Error("Vendor name is required.");

  const code = normalizeCode(input.code || name);
  if (!code) throw new Error("Vendor code is required.");

  const [vendor] = await db
    .insert(inventoryVendors)
    .values({
      name,
      code,
      contactName: normalizeOptionalString(input.contactName),
      email: normalizeOptionalString(input.email)?.toLowerCase() ?? null,
      phone: normalizeOptionalString(input.phone),
      website: normalizeOptionalString(input.website),
      paymentTerms: normalizeOptionalString(input.paymentTerms),
      notes: normalizeOptionalString(input.notes),
    })
    .returning();

  return vendor!;
}

export async function createInventoryItem(input: {
  name: string;
  code?: string | null;
  categoryId?: string | null;
  defaultVendorId?: string | null;
  sku?: string | null;
  barcode?: string | null;
  itemType?: InventoryItemType | null;
  unit?: string | null;
  location?: string | null;
  reorderPoint?: number | null;
  swellProductId?: string | null;
  swellVariantId?: string | null;
  productHandle?: string | null;
  notes?: string | null;
  initialQuantity?: number | null;
  createdByUserId?: string | null;
}) {
  const name = input.name.trim();
  if (!name) throw new Error("Item name is required.");

  const code = normalizeCode(input.code || name);
  if (!code) throw new Error("Item code is required.");

  return db.transaction(async (tx) => {
    const [item] = await tx
      .insert(inventoryItems)
      .values({
        name,
        code,
        categoryId: normalizeOptionalString(input.categoryId),
        defaultVendorId: normalizeOptionalString(input.defaultVendorId),
        sku: normalizeOptionalString(input.sku),
        barcode: normalizeOptionalString(input.barcode),
        itemType: input.itemType || "supply",
        unit: normalizeOptionalString(input.unit) || "unit",
        location: normalizeOptionalString(input.location),
        reorderPoint: Math.max(0, Math.floor(Number(input.reorderPoint || 0))),
        swellProductId: normalizeOptionalString(input.swellProductId),
        swellVariantId: normalizeOptionalString(input.swellVariantId),
        productHandle: normalizeOptionalString(input.productHandle),
        notes: normalizeOptionalString(input.notes),
      })
      .returning();

    if (!item) throw new Error("Failed to create inventory item.");

    const initialQuantity = Math.floor(Number(input.initialQuantity || 0));
    if (initialQuantity !== 0) {
      await tx.insert(inventoryMovements).values({
        itemId: item.id,
        movementType: "initial_stock",
        quantityDelta: initialQuantity,
        quantityAfter: initialQuantity,
        sourceType: "initial_stock",
        sourceId: item.id,
        createdByUserId: input.createdByUserId ?? null,
        notes: "Opening inventory balance",
      });
    }

    return item;
  });
}

export async function updateInventoryItem(
  id: string,
  input: Partial<{
    name: string;
    code: string;
    categoryId: string | null;
    defaultVendorId: string | null;
    sku: string | null;
    barcode: string | null;
    itemType: InventoryItemType;
    unit: string;
    location: string | null;
    reorderPoint: number;
    swellProductId: string | null;
    swellVariantId: string | null;
    productHandle: string | null;
    notes: string | null;
    active: boolean;
  }>,
) {
  const values: Partial<typeof inventoryItems.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) values.name = input.name.trim();
  if (input.code !== undefined) values.code = normalizeCode(input.code);
  if (input.categoryId !== undefined) values.categoryId = normalizeOptionalString(input.categoryId);
  if (input.defaultVendorId !== undefined) values.defaultVendorId = normalizeOptionalString(input.defaultVendorId);
  if (input.sku !== undefined) values.sku = normalizeOptionalString(input.sku);
  if (input.barcode !== undefined) values.barcode = normalizeOptionalString(input.barcode);
  if (input.itemType !== undefined) values.itemType = input.itemType;
  if (input.unit !== undefined) values.unit = input.unit.trim() || "unit";
  if (input.location !== undefined) values.location = normalizeOptionalString(input.location);
  if (input.reorderPoint !== undefined) {
    values.reorderPoint = Math.max(0, Math.floor(Number(input.reorderPoint || 0)));
  }
  if (input.swellProductId !== undefined) values.swellProductId = normalizeOptionalString(input.swellProductId);
  if (input.swellVariantId !== undefined) values.swellVariantId = normalizeOptionalString(input.swellVariantId);
  if (input.productHandle !== undefined) values.productHandle = normalizeOptionalString(input.productHandle);
  if (input.notes !== undefined) values.notes = normalizeOptionalString(input.notes);
  if (input.active !== undefined) values.active = input.active;

  const [item] = await db
    .update(inventoryItems)
    .set(values)
    .where(eq(inventoryItems.id, id))
    .returning();

  if (!item) throw new Error("Inventory item not found.");
  return item;
}

function buildSwellSyncCode(args: {
  product: Product;
  variant: ProductVariant;
  productId: string;
  variantId: string | null;
}) {
  const raw =
    args.variant.sku ||
    `${args.product.handle}-${args.variant.title}` ||
    `${args.productId}-${args.variantId || "product"}`;

  return normalizeCodeWithLimit(raw);
}

function buildUniqueInventoryCode(baseCode: string, usedCodes: Set<string>, fallbackId: string) {
  const normalizedBase = normalizeCodeWithLimit(baseCode || fallbackId || "SWELL-ITEM");
  if (!usedCodes.has(normalizedBase)) {
    usedCodes.add(normalizedBase);
    return normalizedBase;
  }

  const suffix = normalizeCodeWithLimit(fallbackId || cryptoRandomSuffix(), 12);
  const prefix = normalizeCodeWithLimit(normalizedBase, Math.max(1, 95 - suffix.length));
  let candidate = `${prefix}-${suffix}`;
  let attempt = 2;

  while (usedCodes.has(candidate)) {
    const attemptSuffix = `${suffix}-${attempt}`;
    const attemptPrefix = normalizeCodeWithLimit(normalizedBase, Math.max(1, 95 - attemptSuffix.length));
    candidate = `${attemptPrefix}-${attemptSuffix}`;
    attempt += 1;
  }

  usedCodes.add(candidate);
  return candidate;
}

function cryptoRandomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}

function buildSwellSyncName(product: Product, variant: ProductVariant, hasMultipleVariants: boolean) {
  const variantTitle = variant.title?.trim();
  if (!hasMultipleVariants || !variantTitle || variantTitle.toLowerCase() === "default") {
    return product.title;
  }

  return `${product.title} - ${variantTitle}`.slice(0, 256);
}

function findExistingSwellInventoryItem(args: {
  existingItems: InventoryItemRow[];
  product: Product;
  variant: ProductVariant;
  productId: string;
  variantId: string | null;
  hasMultipleVariants: boolean;
}) {
  const sku = normalizeComparable(args.variant.sku);
  const handle = normalizeComparable(args.product.handle);

  if (args.variantId) {
    const match = args.existingItems.find(
      item => item.swellVariantId === args.variantId,
    );
    if (match) return match;
  }

  if (sku) {
    const match = args.existingItems.find(
      item => normalizeComparable(item.sku) === sku,
    );
    if (match) return match;
  }

  if (!args.hasMultipleVariants) {
    const productMatch = args.existingItems.find(
      item => item.swellProductId === args.productId,
    );
    if (productMatch) return productMatch;

    const handleMatch = args.existingItems.find(
      item => normalizeComparable(item.productHandle) === handle,
    );
    if (handleMatch) return handleMatch;
  }

  return null;
}

export async function syncSwellProductsToInventory(): Promise<SwellInventorySyncResult> {
  const products = await getProducts({
    limit: 1000,
    live: true,
  });
  const existingItems = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.itemType, "sellable_product"));
  const usedCodes = new Set(existingItems.map(item => item.code));
  const result: SwellInventorySyncResult = {
    productsSeen: products.length,
    variantsSeen: 0,
    created: 0,
    updated: 0,
  };

  for (const product of products) {
    const variants = product.variants.length > 0
      ? product.variants
      : [
          {
            id: product.id,
            title: product.title,
            sku: undefined,
            availableForSale: product.availableForSale,
            stockStatus: product.stockStatus,
            stockLevel: product.stockLevel,
            selectedOptions: [],
            price: product.priceRange.minVariantPrice,
          } satisfies ProductVariant,
        ];
    const productId = extractBackendProductId(product.id);
    const hasMultipleVariants = variants.length > 1;

    for (const variant of variants) {
      result.variantsSeen += 1;

      const variantId = variant.id === product.id ? null : extractBackendVariantId(variant.id);
      const existingItem = findExistingSwellInventoryItem({
        existingItems,
        product,
        variant,
        productId,
        variantId,
        hasMultipleVariants,
      });
      const itemName = buildSwellSyncName(product, variant, hasMultipleVariants);

      if (existingItem) {
        await updateInventoryItem(existingItem.id, {
          name: itemName,
          sku: variant.sku || null,
          itemType: "sellable_product",
          unit: existingItem.unit || "unit",
          swellProductId: productId,
          swellVariantId: variantId,
          productHandle: product.handle,
          active: true,
        });
        existingItem.name = itemName;
        existingItem.sku = variant.sku || null;
        existingItem.swellProductId = productId;
        existingItem.swellVariantId = variantId;
        existingItem.productHandle = product.handle;
        existingItem.active = true;
        result.updated += 1;
        continue;
      }

      const baseCode = buildSwellSyncCode({
        product,
        variant,
        productId,
        variantId,
      });
      const uniqueCode = buildUniqueInventoryCode(
        baseCode,
        usedCodes,
        variantId || productId,
      );
      const created = await createInventoryItem({
        name: itemName,
        code: uniqueCode,
        sku: variant.sku || null,
        itemType: "sellable_product",
        unit: "unit",
        reorderPoint: 0,
        swellProductId: productId,
        swellVariantId: variantId,
        productHandle: product.handle,
        initialQuantity: 0,
        notes: "Synced from Swell catalog. Internal inventory quantity remains controlled by ledger movements.",
      });

      existingItems.push(created);
      result.created += 1;
    }
  }

  return result;
}

export async function createManualInventoryAdjustment(input: {
  itemId: string;
  quantityDelta: number;
  notes?: string | null;
  createdByUserId?: string | null;
}) {
  const quantityDelta = Math.floor(Number(input.quantityDelta));
  if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
    throw new Error("Adjustment quantity must be a non-zero whole number.");
  }

  const item = await db.query.inventoryItems.findFirst({
    where: eq(inventoryItems.id, input.itemId),
  });
  if (!item) throw new Error("Inventory item not found.");

  const movement = await insertMovement({
    itemId: input.itemId,
    movementType: "manual_adjustment",
    quantityDelta,
    sourceType: "manual_adjustment",
    sourceId: input.itemId,
    createdByUserId: input.createdByUserId,
    notes: normalizeOptionalString(input.notes),
  });

  if (!movement) throw new Error("Failed to create inventory adjustment.");
  return movement;
}

export async function createInventoryConsumptionRule(input: {
  name: string;
  consumedItemId: string;
  appliesToItemId?: string | null;
  appliesToSwellProductId?: string | null;
  appliesToSwellVariantId?: string | null;
  appliesToProductHandle?: string | null;
  quantityPerOrder: number;
  notes?: string | null;
}) {
  const quantityPerOrder = normalizeQuantity(
    input.quantityPerOrder,
    "Quantity per order",
  );

  const [rule] = await db
    .insert(inventoryConsumptionRules)
    .values({
      name: input.name.trim(),
      consumedItemId: input.consumedItemId,
      appliesToItemId: normalizeOptionalString(input.appliesToItemId),
      appliesToSwellProductId: normalizeOptionalString(input.appliesToSwellProductId),
      appliesToSwellVariantId: normalizeOptionalString(input.appliesToSwellVariantId),
      appliesToProductHandle: normalizeOptionalString(input.appliesToProductHandle),
      quantityPerOrder,
      notes: normalizeOptionalString(input.notes),
    })
    .returning();

  return rule!;
}

export async function listInventoryConsumptionRules() {
  const rows = await db
    .select({
      rule: inventoryConsumptionRules,
      item: inventoryItems,
    })
    .from(inventoryConsumptionRules)
    .innerJoin(
      inventoryItems,
      eq(inventoryConsumptionRules.consumedItemId, inventoryItems.id),
    )
    .orderBy(desc(inventoryConsumptionRules.updatedAt));

  return rows.map(
    ({ rule, item }): InventoryConsumptionRuleSummary => ({
      id: rule.id,
      name: rule.name,
      consumedItemId: rule.consumedItemId,
      consumedItemName: item.name,
      consumedItemCode: item.code,
      appliesToItemId: rule.appliesToItemId,
      appliesToSwellProductId: rule.appliesToSwellProductId,
      appliesToSwellVariantId: rule.appliesToSwellVariantId,
      appliesToProductHandle: rule.appliesToProductHandle,
      quantityPerOrder: rule.quantityPerOrder,
      active: rule.active,
      notes: rule.notes,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    }),
  );
}

export async function listInventoryItems(args: {
  query?: string | null;
  categoryId?: string | null;
  itemType?: InventoryItemType | "all" | null;
  stockStatus?: InventoryStockStatus | "all" | null;
  includeInactive?: boolean;
  limit?: number;
} = {}) {
  const conditions = [];
  const query = args.query?.trim();

  if (!args.includeInactive) {
    conditions.push(eq(inventoryItems.active, true));
  }

  if (query) {
    const pattern = `%${query}%`;
    conditions.push(
      or(
        ilike(inventoryItems.name, pattern),
        ilike(inventoryItems.code, pattern),
        ilike(inventoryItems.sku, pattern),
        ilike(inventoryItems.barcode, pattern),
        ilike(inventoryItems.productHandle, pattern),
      ),
    );
  }

  if (args.categoryId) {
    conditions.push(eq(inventoryItems.categoryId, args.categoryId));
  }

  if (args.itemType && args.itemType !== "all") {
    conditions.push(eq(inventoryItems.itemType, args.itemType));
  }

  const rows = await db
    .select({
      item: inventoryItems,
      category: inventoryCategories,
      vendor: inventoryVendors,
    })
    .from(inventoryItems)
    .leftJoin(
      inventoryCategories,
      eq(inventoryItems.categoryId, inventoryCategories.id),
    )
    .leftJoin(
      inventoryVendors,
      eq(inventoryItems.defaultVendorId, inventoryVendors.id),
    )
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(inventoryItems.name))
    .limit(args.limit || 500);

  const balances = await getItemBalances(rows.map((row) => row.item.id));
  const items = rows.map((row) =>
    mapInventoryItemRow({
      item: row.item,
      category: row.category,
      vendor: row.vendor,
      balance: balances.get(row.item.id) || 0,
    }),
  );

  if (args.stockStatus && args.stockStatus !== "all") {
    return items.filter((item) => item.stockStatus === args.stockStatus);
  }

  return items;
}

export async function listInventoryMovements(args: {
  itemId?: string | null;
  checkoutOrderId?: string | null;
  limit?: number;
} = {}) {
  const conditions = [];
  if (args.itemId) conditions.push(eq(inventoryMovements.itemId, args.itemId));
  if (args.checkoutOrderId) {
    conditions.push(eq(inventoryMovements.checkoutOrderId, args.checkoutOrderId));
  }

  const rows = await db
    .select({
      movement: inventoryMovements,
      item: inventoryItems,
      purchaseOrder: purchaseOrders,
    })
    .from(inventoryMovements)
    .innerJoin(inventoryItems, eq(inventoryMovements.itemId, inventoryItems.id))
    .leftJoin(
      purchaseOrders,
      eq(inventoryMovements.purchaseOrderId, purchaseOrders.id),
    )
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(args.limit || 100);

  return rows.map((row) =>
    mapMovementRow({
      movement: row.movement,
      item: row.item,
      purchaseOrder: row.purchaseOrder,
    }),
  );
}

export async function getInventoryDashboard(args: {
  query?: string | null;
  categoryId?: string | null;
  itemType?: InventoryItemType | "all" | null;
  stockStatus?: InventoryStockStatus | "all" | null;
} = {}): Promise<InventoryDashboardData> {
  const [items, movements, categories, vendors, rules] = await Promise.all([
    listInventoryItems(args),
    listInventoryMovements({ limit: 75 }),
    db
      .select()
      .from(inventoryCategories)
      .orderBy(asc(inventoryCategories.sortOrder), asc(inventoryCategories.name)),
    db.select().from(inventoryVendors).orderBy(asc(inventoryVendors.name)),
    listInventoryConsumptionRules(),
  ]);

  return {
    items,
    movements,
    categories,
    vendors,
    rules,
    stats: {
      totalItems: items.length,
      lowStock: items.filter((item) => item.stockStatus === "low_stock").length,
      outOfStock: items.filter((item) => item.stockStatus === "out_of_stock").length,
      negativeStock: items.filter((item) => item.stockStatus === "negative").length,
      activeRules: rules.filter((rule) => rule.active).length,
    },
  };
}

function buildPurchaseOrderNumber() {
  const date = new Date();
  const dayKey = date.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = date.getTime().toString(36).toUpperCase().slice(-5);
  return `PO-${dayKey}-${suffix}`;
}

function buildReceiptNumber() {
  const date = new Date();
  const dayKey = date.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = date.getTime().toString(36).toUpperCase().slice(-5);
  return `RCPT-${dayKey}-${suffix}`;
}

function resolvePurchaseOrderStatus(lines: Array<{ quantityOrdered: number; quantityReceived: number }>) {
  if (lines.length === 0) return "ordered" satisfies PurchaseOrderStatus;
  const hasReceived = lines.some((line) => line.quantityReceived > 0);
  const fullyReceived = lines.every(
    (line) => line.quantityReceived >= line.quantityOrdered,
  );

  if (fullyReceived) return "received" satisfies PurchaseOrderStatus;
  if (hasReceived) return "partially_received" satisfies PurchaseOrderStatus;
  return "ordered" satisfies PurchaseOrderStatus;
}

export async function createPurchaseOrder(input: {
  poNumber?: string | null;
  vendorId?: string | null;
  currencyCode?: string | null;
  paymentStatus?: PurchasePaymentStatus | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  amountPaid?: string | number | null;
  proofUrls?: string[] | null;
  expectedAt?: string | null;
  notes?: string | null;
  createdByUserId?: string | null;
  lines: Array<{
    itemId: string;
    quantityOrdered: number;
    unitCost?: string | number | null;
    notes?: string | null;
  }>;
}) {
  if (input.lines.length === 0) {
    throw new Error("Add at least one purchase order line.");
  }

  return db.transaction(async (tx) => {
    const normalizedLines = input.lines.map((line) => {
      const quantityOrdered = normalizeQuantity(line.quantityOrdered, "Ordered quantity");
      const unitCost = normalizeMoneyString(line.unitCost);
      const lineTotal = (quantityOrdered * Number(unitCost)).toFixed(2);
      return {
        itemId: line.itemId,
        quantityOrdered,
        unitCost,
        lineTotal,
        notes: normalizeOptionalString(line.notes),
      };
    });

    const totalAmount = normalizedLines
      .reduce((sum, line) => sum + Number(line.lineTotal), 0)
      .toFixed(2);

    const [order] = await tx
      .insert(purchaseOrders)
      .values({
        poNumber: normalizeOptionalString(input.poNumber) || buildPurchaseOrderNumber(),
        vendorId: normalizeOptionalString(input.vendorId),
        status: "ordered",
        paymentStatus: input.paymentStatus || "unpaid",
        currencyCode: normalizeOptionalString(input.currencyCode)?.toUpperCase() || "USD",
        totalAmount,
        amountPaid: normalizeMoneyString(input.amountPaid),
        paymentMethod: normalizeOptionalString(input.paymentMethod),
        paymentReference: normalizeOptionalString(input.paymentReference),
        proofUrls: toProofUrls(input.proofUrls),
        expectedAt: input.expectedAt ? new Date(input.expectedAt) : null,
        orderedAt: new Date(),
        notes: normalizeOptionalString(input.notes),
        createdByUserId: input.createdByUserId ?? null,
      })
      .returning();

    if (!order) throw new Error("Failed to create purchase order.");

    await tx.insert(purchaseOrderLines).values(
      normalizedLines.map((line) => ({
        purchaseOrderId: order.id,
        itemId: line.itemId,
        quantityOrdered: line.quantityOrdered,
        unitCost: line.unitCost,
        lineTotal: line.lineTotal,
        notes: line.notes,
      })),
    );

    return order;
  });
}

export async function updatePurchaseOrderPayment(
  id: string,
  input: {
    paymentStatus: PurchasePaymentStatus;
    amountPaid?: string | number | null;
    paymentMethod?: string | null;
    paymentReference?: string | null;
    proofUrls?: string[] | null;
    notes?: string | null;
  },
) {
  const [order] = await db
    .update(purchaseOrders)
    .set({
      paymentStatus: input.paymentStatus,
      amountPaid:
        input.amountPaid === undefined
          ? undefined
          : normalizeMoneyString(input.amountPaid),
      paymentMethod:
        input.paymentMethod === undefined
          ? undefined
          : normalizeOptionalString(input.paymentMethod),
      paymentReference:
        input.paymentReference === undefined
          ? undefined
          : normalizeOptionalString(input.paymentReference),
      proofUrls: input.proofUrls === undefined ? undefined : toProofUrls(input.proofUrls),
      notes: input.notes === undefined ? undefined : normalizeOptionalString(input.notes),
      paidAt: input.paymentStatus === "paid" ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(purchaseOrders.id, id))
    .returning();

  if (!order) throw new Error("Purchase order not found.");
  return order;
}

export async function receivePurchaseOrder(
  id: string,
  input: {
    receivedAt?: string | null;
    receivedByUserId?: string | null;
    proofUrls?: string[] | null;
    notes?: string | null;
    lines: Array<{
      purchaseOrderLineId: string;
      quantityReceived: number;
      notes?: string | null;
    }>;
  },
) {
  const receiveLines = input.lines
    .map((line) => ({
      purchaseOrderLineId: line.purchaseOrderLineId,
      quantityReceived: Math.floor(Number(line.quantityReceived)),
      notes: normalizeOptionalString(line.notes),
    }))
    .filter((line) => line.quantityReceived > 0);

  if (receiveLines.length === 0) {
    throw new Error("Receive at least one line quantity.");
  }

  return db.transaction(async (tx) => {
    const orderRows = await tx
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, id))
      .limit(1);
    const order = orderRows[0];
    if (!order) throw new Error("Purchase order not found.");

    if (order.status === "cancelled") {
      throw new Error("Cancelled purchase orders cannot be received.");
    }

    const orderLineRows = await tx
      .select()
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.purchaseOrderId, id));
    const lineById = new Map(orderLineRows.map((line) => [line.id, line]));

    const [receipt] = await tx
      .insert(purchaseReceipts)
      .values({
        purchaseOrderId: id,
        receiptNumber: buildReceiptNumber(),
        receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
        receivedByUserId: input.receivedByUserId ?? null,
        proofUrls: toProofUrls(input.proofUrls),
        notes: normalizeOptionalString(input.notes),
      })
      .returning();

    if (!receipt) throw new Error("Failed to create receipt.");

    const touchedLineIds = new Set<string>();
    const touchedItemIds = Array.from(
      new Set(
        receiveLines
          .map((line) => lineById.get(line.purchaseOrderLineId)?.itemId)
          .filter((itemId): itemId is string => Boolean(itemId)),
      ),
    );
    const balances = await getItemBalances(touchedItemIds);

    for (const line of receiveLines) {
      const existingLine = lineById.get(line.purchaseOrderLineId);
      if (!existingLine) {
        throw new Error("Purchase order line not found.");
      }

      const quantityReceived = normalizeQuantity(
        line.quantityReceived,
        "Received quantity",
      );
      const remaining =
        existingLine.quantityOrdered - existingLine.quantityReceived;
      if (quantityReceived > remaining) {
        throw new Error("Received quantity cannot exceed remaining quantity.");
      }

      const [receiptLine] = await tx
        .insert(purchaseReceiptLines)
        .values({
          receiptId: receipt.id,
          purchaseOrderLineId: existingLine.id,
          itemId: existingLine.itemId,
          quantityReceived,
          unitCost: existingLine.unitCost,
          notes: line.notes,
        })
        .returning();

      if (!receiptLine) throw new Error("Failed to create receipt line.");

      const currentQuantity = balances.get(existingLine.itemId) || 0;
      const quantityAfter = currentQuantity + quantityReceived;
      balances.set(existingLine.itemId, quantityAfter);

      await tx.insert(inventoryMovements).values({
        itemId: existingLine.itemId,
        movementType: "purchase_received",
        quantityDelta: quantityReceived,
        quantityAfter,
        unitCost: existingLine.unitCost,
        purchaseOrderId: id,
        purchaseReceiptId: receipt.id,
        purchaseReceiptLineId: receiptLine.id,
        sourceType: "purchase_receipt",
        sourceId: receipt.id,
        idempotencyKey: `purchase_receipt:${receiptLine.id}`,
        createdByUserId: input.receivedByUserId ?? null,
        notes: line.notes || input.notes || null,
        metadata: {
          poNumber: order.poNumber,
          receiptNumber: receipt.receiptNumber,
        },
      });

      await tx
        .update(purchaseOrderLines)
        .set({
          quantityReceived: existingLine.quantityReceived + quantityReceived,
          updatedAt: new Date(),
        })
        .where(eq(purchaseOrderLines.id, existingLine.id));

      existingLine.quantityReceived += quantityReceived;
      touchedLineIds.add(existingLine.id);
    }

    const refreshedLines = orderLineRows.map((line) =>
      touchedLineIds.has(line.id) ? lineById.get(line.id)! : line,
    );
    const status = resolvePurchaseOrderStatus(refreshedLines);

    await tx
      .update(purchaseOrders)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, id));

    return receipt;
  });
}

function mapPurchaseOrderRows(args: {
  order: typeof purchaseOrders.$inferSelect;
  vendor: typeof inventoryVendors.$inferSelect | null;
  lines: Array<{
    line: typeof purchaseOrderLines.$inferSelect;
    item: typeof inventoryItems.$inferSelect;
  }>;
}): PurchaseOrderSummary {
  const orderedQuantity = args.lines.reduce(
    (sum, row) => sum + row.line.quantityOrdered,
    0,
  );
  const receivedQuantity = args.lines.reduce(
    (sum, row) => sum + row.line.quantityReceived,
    0,
  );

  return {
    id: args.order.id,
    poNumber: args.order.poNumber,
    vendor: args.vendor
      ? {
          id: args.vendor.id,
          name: args.vendor.name,
          code: args.vendor.code,
        }
      : null,
    status: args.order.status as PurchaseOrderStatus,
    paymentStatus: args.order.paymentStatus as PurchasePaymentStatus,
    currencyCode: args.order.currencyCode,
    totalAmount: args.order.totalAmount,
    amountPaid: args.order.amountPaid,
    lineCount: args.lines.length,
    orderedQuantity,
    receivedQuantity,
    paymentMethod: args.order.paymentMethod,
    paymentReference: args.order.paymentReference,
    proofUrls: args.order.proofUrls || [],
    expectedAt: formatDate(args.order.expectedAt),
    orderedAt: formatDate(args.order.orderedAt),
    paidAt: formatDate(args.order.paidAt),
    notes: args.order.notes,
    createdAt: args.order.createdAt.toISOString(),
    updatedAt: args.order.updatedAt.toISOString(),
    lines: args.lines.map(({ line, item }) => ({
      id: line.id,
      itemId: item.id,
      itemName: item.name,
      itemCode: item.code,
      quantityOrdered: line.quantityOrdered,
      quantityReceived: line.quantityReceived,
      quantityRemaining: Math.max(0, line.quantityOrdered - line.quantityReceived),
      unitCost: line.unitCost,
      lineTotal: line.lineTotal,
      notes: line.notes,
    })),
  };
}

export async function listPurchaseOrders(args: {
  status?: PurchaseOrderStatus | "all" | null;
  paymentStatus?: PurchasePaymentStatus | "all" | null;
  query?: string | null;
  limit?: number;
} = {}) {
  const conditions = [];
  if (args.status && args.status !== "all") {
    conditions.push(eq(purchaseOrders.status, args.status));
  }
  if (args.paymentStatus && args.paymentStatus !== "all") {
    conditions.push(eq(purchaseOrders.paymentStatus, args.paymentStatus));
  }
  if (args.query?.trim()) {
    const pattern = `%${args.query.trim()}%`;
    conditions.push(
      or(
        ilike(purchaseOrders.poNumber, pattern),
        ilike(purchaseOrders.paymentReference, pattern),
        ilike(inventoryVendors.name, pattern),
      ),
    );
  }

  const orderRows = await db
    .select({
      order: purchaseOrders,
      vendor: inventoryVendors,
    })
    .from(purchaseOrders)
    .leftJoin(inventoryVendors, eq(purchaseOrders.vendorId, inventoryVendors.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(purchaseOrders.updatedAt))
    .limit(args.limit || 100);

  const orderIds = orderRows.map((row) => row.order.id);
  const lineRows = orderIds.length
    ? await db
        .select({
          line: purchaseOrderLines,
          item: inventoryItems,
        })
        .from(purchaseOrderLines)
        .innerJoin(inventoryItems, eq(purchaseOrderLines.itemId, inventoryItems.id))
        .where(inArray(purchaseOrderLines.purchaseOrderId, orderIds))
        .orderBy(asc(inventoryItems.name))
    : [];

  const linesByOrder = new Map<string, typeof lineRows>();
  for (const row of lineRows) {
    const rows = linesByOrder.get(row.line.purchaseOrderId) || [];
    rows.push(row);
    linesByOrder.set(row.line.purchaseOrderId, rows);
  }

  return orderRows.map((row) =>
    mapPurchaseOrderRows({
      order: row.order,
      vendor: row.vendor,
      lines: linesByOrder.get(row.order.id) || [],
    }),
  );
}

export async function getPurchasingDashboard(args: {
  status?: PurchaseOrderStatus | "all" | null;
  paymentStatus?: PurchasePaymentStatus | "all" | null;
  query?: string | null;
} = {}): Promise<PurchasingDashboardData> {
  const [purchaseOrdersList, vendors, inventoryItemList] = await Promise.all([
    listPurchaseOrders(args),
    db.select().from(inventoryVendors).orderBy(asc(inventoryVendors.name)),
    listInventoryItems({ includeInactive: false, limit: 500 }),
  ]);

  return {
    purchaseOrders: purchaseOrdersList,
    vendors,
    inventoryItems: inventoryItemList,
    stats: {
      totalPurchaseOrders: purchaseOrdersList.length,
      openPurchaseOrders: purchaseOrdersList.filter((order) =>
        ["ordered", "partially_received"].includes(order.status),
      ).length,
      unpaidPurchaseOrders: purchaseOrdersList.filter(
        (order) => order.paymentStatus === "unpaid" || order.paymentStatus === "partially_paid",
      ).length,
      partiallyReceived: purchaseOrdersList.filter(
        (order) => order.status === "partially_received",
      ).length,
    },
  };
}

export async function consumeInventoryForFulfillment(args: {
  order: CheckoutOrderRecord;
  adminUserId?: string | null;
}): Promise<FulfillmentConsumptionResult> {
  const existing = await getFulfillmentInventoryConsumptionForOrders([
    args.order.orderId,
  ]);
  const existingForOrder = existing.get(args.order.orderId) || [];

  const [sellableItems, ruleRows] = await Promise.all([
    db
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.active, true),
          eq(inventoryItems.itemType, "sellable_product"),
        ),
      ),
    db
      .select({
        rule: inventoryConsumptionRules,
        consumedItem: inventoryItems,
      })
      .from(inventoryConsumptionRules)
      .innerJoin(
        inventoryItems,
        eq(inventoryConsumptionRules.consumedItemId, inventoryItems.id),
      )
      .where(eq(inventoryConsumptionRules.active, true)),
  ]);

  const warnings: string[] = [];
  const consumptionDrafts: Array<{
    item: InventoryItemRow;
    quantityDelta: number;
    idempotencyKey: string;
    notes: string;
    metadata: Record<string, unknown>;
  }> = [];
  const matchedInventoryItemIds = new Set<string>();

  for (const line of args.order.lines) {
    const item = sellableItems.find((candidate) =>
      orderLineMatchesItem(line, candidate),
    );

    if (!item) {
      warnings.push(
        `No internal inventory item matched ${line.productTitle}${
          line.variantTitle ? ` (${line.variantTitle})` : ""
        }.`,
      );
      continue;
    }

    matchedInventoryItemIds.add(item.id);
    consumptionDrafts.push({
      item,
      quantityDelta: -Math.max(1, Math.floor(line.quantity || 1)),
      idempotencyKey: `fulfillment:${args.order.orderId}:line:${line.id}:item:${item.id}`,
      notes: `Fulfillment consumed ${line.productTitle}`,
      metadata: {
        kind: "sellable_product",
        checkoutLineId: line.id,
        merchandiseId: line.merchandiseId,
        productHandle: line.productHandle,
        productTitle: line.productTitle,
        variantTitle: line.variantTitle,
        skuNumber: line.skuNumber,
      },
    });
  }

  for (const { rule, consumedItem } of ruleRows) {
    if (
      !ruleMatchesOrder({
        rule,
        lines: args.order.lines,
        matchedInventoryItemIds,
      })
    ) {
      continue;
    }

    consumptionDrafts.push({
      item: consumedItem,
      quantityDelta: -Math.max(1, rule.quantityPerOrder),
      idempotencyKey: `fulfillment:${args.order.orderId}:rule:${rule.id}:item:${consumedItem.id}`,
      notes: `Fulfillment consumed ${rule.name}`,
      metadata: {
        kind: "consumption_rule",
        ruleId: rule.id,
        ruleName: rule.name,
      },
    });
  }

  if (consumptionDrafts.length === 0) {
    return { consumed: existingForOrder, warnings };
  }

  const balances = await getItemBalances(
    Array.from(new Set(consumptionDrafts.map((draft) => draft.item.id))),
  );
  const consumed: FulfillmentInventoryConsumption[] = [];

  for (const draft of consumptionDrafts) {
    const currentQuantity = balances.get(draft.item.id) || 0;
    const movement = await insertMovement({
      itemId: draft.item.id,
      movementType: "fulfillment_consumed",
      quantityDelta: draft.quantityDelta,
      currentQuantity,
      checkoutOrderId: args.order.orderId,
      checkoutOrderNumber: args.order.swell.orderNumber || args.order.orderId,
      sourceType: "fulfillment",
      sourceId: args.order.orderId,
      idempotencyKey: draft.idempotencyKey,
      createdByUserId: args.adminUserId,
      notes: draft.notes,
      metadata: draft.metadata,
    });

    const quantityAfter = movement?.quantityAfter ?? currentQuantity;
    balances.set(draft.item.id, quantityAfter);

    if (quantityAfter < 0) {
      warnings.push(`${draft.item.code} is now negative (${quantityAfter}).`);
    } else if (quantityAfter === 0) {
      warnings.push(`${draft.item.code} is now out of stock.`);
    } else if (draft.item.reorderPoint > 0 && quantityAfter <= draft.item.reorderPoint) {
      warnings.push(`${draft.item.code} is at or below reorder point (${quantityAfter}).`);
    }

    if (movement) {
      consumed.push({
        itemId: draft.item.id,
        itemName: draft.item.name,
        itemCode: draft.item.code,
        itemType: draft.item.itemType as InventoryItemType,
        unit: draft.item.unit,
        quantityDelta: movement.quantityDelta,
        quantityAfter: movement.quantityAfter,
        movementId: movement.id,
      });
    }
  }

  const refreshed = await getFulfillmentInventoryConsumptionForOrders([
    args.order.orderId,
  ]);

  return {
    consumed: refreshed.get(args.order.orderId) || consumed,
    warnings,
  };
}

export async function getFulfillmentInventoryConsumptionForOrders(orderIds: string[]) {
  if (orderIds.length === 0) {
    return new Map<string, FulfillmentInventoryConsumption[]>();
  }

  const rows = await db
    .select({
      movement: inventoryMovements,
      item: inventoryItems,
    })
    .from(inventoryMovements)
    .innerJoin(inventoryItems, eq(inventoryMovements.itemId, inventoryItems.id))
    .where(
      and(
        inArray(inventoryMovements.checkoutOrderId, orderIds),
        eq(inventoryMovements.movementType, "fulfillment_consumed"),
      ),
    )
    .orderBy(asc(inventoryMovements.createdAt));

  const byOrder = new Map<string, FulfillmentInventoryConsumption[]>();

  for (const row of rows) {
    const orderId = row.movement.checkoutOrderId;
    if (!orderId) continue;

    const items = byOrder.get(orderId) || [];
    items.push({
      itemId: row.item.id,
      itemName: row.item.name,
      itemCode: row.item.code,
      itemType: row.item.itemType as InventoryItemType,
      unit: row.item.unit,
      quantityDelta: row.movement.quantityDelta,
      quantityAfter: row.movement.quantityAfter,
      movementId: row.movement.id,
    });
    byOrder.set(orderId, items);
  }

  return byOrder;
}

export async function getInventoryHealthCounts() {
  const [total] = await db.select({ count: count() }).from(inventoryItems);
  const items = await listInventoryItems({ includeInactive: false, limit: 1000 });

  return {
    totalItems: total?.count || 0,
    lowStock: items.filter((item) => item.stockStatus === "low_stock").length,
    outOfStock: items.filter((item) => item.stockStatus === "out_of_stock").length,
    negativeStock: items.filter((item) => item.stockStatus === "negative").length,
  };
}
