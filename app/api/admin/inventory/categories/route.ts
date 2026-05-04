import { z } from "zod";

import { createApiListRoute, createApiRoute } from "@/lib/api/route";
import { db } from "@/lib/db";
import { inventoryCategories } from "@/lib/db/schema";
import { createInventoryCategory } from "@/lib/inventory-management/service";

const createCategorySchema = z.object({
  name: z.string().trim().min(1),
  code: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
});

export const dynamic = "force-dynamic";

export const GET = createApiListRoute({
  route: "/api/admin/inventory/categories",
  access: "admin",
  cacheControl: "no-store",
  handler: async () => {
    const categories = await db.select().from(inventoryCategories);

    return {
      data: categories,
      page: 1,
      pageSize: categories.length,
      total: categories.length,
    };
  },
});

export const POST = createApiRoute({
  route: "/api/admin/inventory/categories",
  access: "admin",
  bodySchema: createCategorySchema,
  cacheControl: "no-store",
  handler: async ({ body }) => {
    const category = await createInventoryCategory(body);

    return {
      data: {
        category,
      },
      status: 201,
    };
  },
});
