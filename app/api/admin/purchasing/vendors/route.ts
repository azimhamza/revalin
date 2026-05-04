import { z } from "zod";

import { createApiListRoute, createApiRoute } from "@/lib/api/route";
import { db } from "@/lib/db";
import { inventoryVendors } from "@/lib/db/schema";
import { createInventoryVendor } from "@/lib/inventory-management/service";

const createVendorSchema = z.object({
  name: z.string().trim().min(1),
  code: z.string().trim().optional().nullable(),
  contactName: z.string().trim().optional().nullable(),
  email: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  website: z.string().trim().optional().nullable(),
  paymentTerms: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export const dynamic = "force-dynamic";

export const GET = createApiListRoute({
  route: "/api/admin/purchasing/vendors",
  access: "admin",
  cacheControl: "no-store",
  handler: async () => {
    const vendors = await db.select().from(inventoryVendors);

    return {
      data: vendors,
      page: 1,
      pageSize: vendors.length,
      total: vendors.length,
    };
  },
});

export const POST = createApiRoute({
  route: "/api/admin/purchasing/vendors",
  access: "admin",
  bodySchema: createVendorSchema,
  cacheControl: "no-store",
  handler: async ({ body }) => {
    const vendor = await createInventoryVendor(body);

    return {
      data: {
        vendor,
      },
      status: 201,
    };
  },
});
