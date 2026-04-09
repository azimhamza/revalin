import { z } from "zod";

import { createApiRoute } from "@/lib/api/route";
import { listCommissionTierConfig, saveCommissionTierConfiguration } from "@/lib/checkout/commission-tier-service";

const tierSchema = z.object({
  id: z.string().optional(),
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  minRevenue: z.string().trim().min(1),
  maxRevenue: z.string().trim().nullable(),
  rate: z.string().trim().min(1),
  sortOrder: z.number().int().nonnegative(),
  active: z.boolean(),
});

const putSchema = z.object({
  tiers: z.array(tierSchema).min(1),
});

export const dynamic = "force-dynamic";

export const GET = createApiRoute({
  route: "/api/admin/affiliate-commission-tiers",
  access: "admin",
  cacheControl: "no-store",
  handler: async () => {
    const tiers = await listCommissionTierConfig({ includeInactive: true });

    return {
      data: {
        tiers,
      },
    };
  },
});

export const PUT = createApiRoute({
  route: "/api/admin/affiliate-commission-tiers",
  access: "admin",
  bodySchema: putSchema,
  cacheControl: "no-store",
  handler: async ({ body }) => {
    const tiers = await saveCommissionTierConfiguration(body.tiers);

    return {
      data: {
        tiers,
      },
    };
  },
});
