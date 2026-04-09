import { z } from "zod";

import { createApiRoute } from "@/lib/api/route";
import { generateWeeklyPayoutBatches, getWeeklyPayoutBatchPeriodOverview } from "@/lib/checkout/weekly-payout-service";

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
    const overview = await getWeeklyPayoutBatchPeriodOverview(query.periodDate);

    return {
      data: overview,
    };
  },
});

export const POST = createApiRoute({
  route: "/api/admin/payout-batches",
  access: "admin",
  bodySchema: postSchema,
  cacheControl: "no-store",
  handler: async ({ body }) => {
    const result = await generateWeeklyPayoutBatches({
      periodDate: body.periodDate,
    });

    return {
      data: result,
    };
  },
});
