import { z } from "zod";

import { createApiRoute } from "@/lib/api/route";
import { generatePayNowPayoutBatches } from "@/lib/checkout/weekly-payout-service";
import { generatePromoterPayNowPayoutBatches } from "@/lib/checkout/promoter-weekly-payout-service";

const postSchema = z.object({
  partnerType: z.enum(["all", "affiliate", "promoter"]).default("all"),
});

export const dynamic = "force-dynamic";

export const POST = createApiRoute({
  route: "/api/admin/payout-batches/pay-now",
  access: "admin",
  bodySchema: postSchema,
  cacheControl: "no-store",
  handler: async ({ body }) => {
    const includeAffiliates =
      body.partnerType === "all" || body.partnerType === "affiliate";
    const includePromoters =
      body.partnerType === "all" || body.partnerType === "promoter";

    const [affiliateResult, promoterResult] = await Promise.all([
      includeAffiliates
        ? generatePayNowPayoutBatches()
        : Promise.resolve({ batches: [] }),
      includePromoters
        ? generatePromoterPayNowPayoutBatches()
        : Promise.resolve({ batches: [] }),
    ]);

    return {
      data: {
        affiliateBatches: affiliateResult.batches,
        promoterBatches: promoterResult.batches,
      },
    };
  },
});
