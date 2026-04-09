import { z } from "zod";

import { createApiRoute } from "@/lib/api/route";
import { bulkUpdateAffiliateDiscountPercent } from "@/lib/checkout/affiliate-code-service";

const bulkSchema = z.object({
  mode: z.enum(["selected", "filtered"]),
  affiliateIds: z.array(z.string().uuid()).min(1),
  discountPercent: z.string().trim().min(1),
  changeReason: z.string().trim().optional(),
  dryRun: z.boolean().optional(),
});

export const dynamic = "force-dynamic";

export const POST = createApiRoute({
  route: "/api/admin/affiliates/bulk-discount",
  access: "admin",
  bodySchema: bulkSchema,
  cacheControl: "no-store",
  handler: async ({ body, session }) => {
    const summary = await bulkUpdateAffiliateDiscountPercent({
      affiliateIds: body.affiliateIds,
      discountPercent: body.discountPercent,
      mode: body.mode,
      changedByUserId: session.user.id,
      changeReason: body.changeReason ?? null,
      dryRun: body.dryRun,
    });

    return {
      data: {
        summary,
      },
    };
  },
});
