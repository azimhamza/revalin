import { z } from "zod";

import { createApiRoute } from "@/lib/api/route";
import { updateInventoryItem } from "@/lib/inventory-management/service";

const paramsSchema = z.object({
  id: z.string().trim().min(1),
});

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

const updateItemSchema = z.object({
  name: z.string().trim().min(1).optional(),
  code: z.string().trim().min(1).optional(),
  categoryId: z.string().trim().optional().nullable(),
  defaultVendorId: z.string().trim().optional().nullable(),
  sku: z.string().trim().optional().nullable(),
  barcode: z.string().trim().optional().nullable(),
  itemType: itemTypeSchema.optional(),
  unit: z.string().trim().optional(),
  location: z.string().trim().optional().nullable(),
  reorderPoint: z.coerce.number().int().min(0).optional(),
  swellProductId: z.string().trim().optional().nullable(),
  swellVariantId: z.string().trim().optional().nullable(),
  productHandle: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  active: z.boolean().optional(),
});

export const dynamic = "force-dynamic";

export const PATCH = createApiRoute({
  route: "/api/admin/inventory/items/:id",
  access: "admin",
  paramsSchema,
  bodySchema: updateItemSchema,
  cacheControl: "no-store",
  handler: async ({ params, body }) => {
    const item = await updateInventoryItem(params.id, body);

    return {
      data: {
        item,
      },
    };
  },
});
