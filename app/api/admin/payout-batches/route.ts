import { z } from "zod";

import { createApiRoute } from "@/lib/api/route";
import { generateWeeklyPayoutBatches, getWeeklyPayoutBatchPeriodOverview } from "@/lib/checkout/weekly-payout-service";
import {
  generatePromoterWeeklyPayoutBatches,
  getPromoterWeeklyPayoutBatchPeriodOverview,
} from "@/lib/checkout/promoter-weekly-payout-service";

const querySchema = z.object({
  periodDate: z.string().trim().min(1).optional(),
});

const postSchema = z.object({
  action: z.literal("generate"),
  periodDate: z.string().trim().min(1),
});

export const dynamic = "force-dynamic";

export const GET = createApiRoute({
  route: "/api/admin/payout-batches",
  access: "admin",
  querySchema,
  cacheControl: "no-store",
  handler: async ({ query }) => {
    const [affiliateOverview, promoterOverview] = await Promise.all([
      getWeeklyPayoutBatchPeriodOverview(query.periodDate),
      getPromoterWeeklyPayoutBatchPeriodOverview(query.periodDate),
    ]);

    return {
      data: {
        period: affiliateOverview.period,
        batches: affiliateOverview.batches,
        promoterBatches: promoterOverview.batches,
      },
    };
  },
});

export const POST = createApiRoute({
  route: "/api/admin/payout-batches",
  access: "admin",
  bodySchema: postSchema,
  cacheControl: "no-store",
  handler: async ({ body }) => {
    const [affiliateResult, promoterResult] = await Promise.all([
      generateWeeklyPayoutBatches({
        periodDate: body.periodDate,
      }),
      generatePromoterWeeklyPayoutBatches({
        periodDate: body.periodDate,
      }),
    ]);

    return {
      data: {
        period: affiliateResult.period,
        batches: affiliateResult.batches,
        promoterBatches: promoterResult.batches,
      },
    };
  },
});
