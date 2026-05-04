import { z } from "zod";

import { createApiListRoute, createApiRoute } from "@/lib/api/route";
import {
  createInventoryConsumptionRule,
  listInventoryConsumptionRules,
} from "@/lib/inventory-management/service";

const createRuleSchema = z.object({
  name: z.string().trim().min(1),
  consumedItemId: z.string().trim().min(1),
  appliesToItemId: z.string().trim().optional().nullable(),
  appliesToSwellProductId: z.string().trim().optional().nullable(),
  appliesToSwellVariantId: z.string().trim().optional().nullable(),
  appliesToProductHandle: z.string().trim().optional().nullable(),
  quantityPerOrder: z.coerce.number().int().min(1).default(1),
  notes: z.string().trim().optional().nullable(),
});

export const dynamic = "force-dynamic";

export const GET = createApiListRoute({
  route: "/api/admin/inventory/consumption-rules",
  access: "admin",
  cacheControl: "no-store",
  handler: async () => {
    const rules = await listInventoryConsumptionRules();

    return {
      data: rules,
      page: 1,
      pageSize: rules.length,
      total: rules.length,
    };
  },
});

export const POST = createApiRoute({
  route: "/api/admin/inventory/consumption-rules",
  access: "admin",
  bodySchema: createRuleSchema,
  cacheControl: "no-store",
  handler: async ({ body }) => {
    const rule = await createInventoryConsumptionRule(body);

    return {
      data: {
        rule,
      },
      status: 201,
    };
  },
});
