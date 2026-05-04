import { z } from "zod";

import { createApiListRoute, createApiRoute } from "@/lib/api/route";
import {
  createInventoryItem,
  listInventoryItems,
} from "@/lib/inventory-management/service";

const itemTypeSchema = z.enum([
  "sellable_product",
  "packaging",
  "label",
  "sticker",
  "card",
  "insert",
  "supply",
  "other",
]);

const querySchema = z.object({
  q: z.string().trim().optional(),
  categoryId: z.string().trim().optional(),
  itemType: z.union([itemTypeSchema, z.literal("all")]).optional(),
  stockStatus: z
    .enum(["in_stock", "low_stock", "out_of_stock", "negative", "all"])
    .optional(),
  includeInactive: z.coerce.boolean().optional(),
});

const createItemSchema = z.object({
  name: z.string().trim().min(1),
  code: z.string().trim().optional().nullable(),
  categoryId: z.string().trim().optional().nullable(),
  defaultVendorId: z.string().trim().optional().nullable(),
  sku: z.string().trim().optional().nullable(),
  barcode: z.string().trim().optional().nullable(),
  itemType: itemTypeSchema.default("supply"),
  unit: z.string().trim().optional().nullable(),
  location: z.string().trim().optional().nullable(),
  reorderPoint: z.coerce.number().int().min(0).default(0),
  swellProductId: z.string().trim().optional().nullable(),
  swellVariantId: z.string().trim().optional().nullable(),
  productHandle: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  initialQuantity: z.coerce.number().int().default(0),
});

export const dynamic = "force-dynamic";

export const GET = createApiListRoute({
  route: "/api/admin/inventory/items",
  access: "admin",
  querySchema,
  cacheControl: "no-store",
  handler: async ({ query }) => {
    const items = await listInventoryItems({
      query: query.q,
      categoryId: query.categoryId,
      itemType: query.itemType,
      stockStatus: query.stockStatus,
      includeInactive: query.includeInactive,
    });

    return {
      data: items,
      page: 1,
      pageSize: items.length,
      total: items.length,
    };
  },
});

export const POST = createApiRoute({
  route: "/api/admin/inventory/items",
  access: "admin",
  bodySchema: createItemSchema,
  cacheControl: "no-store",
  handler: async ({ body, session }) => {
    const item = await createInventoryItem({
      ...body,
      createdByUserId: session.user.id,
    });

    return {
      data: {
        item,
      },
      status: 201,
    };
  },
});
