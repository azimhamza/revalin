import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { createApiRoute } from "@/lib/api/route";
import { createManualAffiliatePayout } from "@/lib/checkout/manual-affiliate-payout-service";

const postSchema = z.object({
  affiliateCode: z.string().trim().min(1),
  orderAmount: z.string().trim().min(1),
  commissionPercent: z.string().trim().min(1),
  periodDate: z.string().trim().min(1),
  reference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

function normalizeManualPayoutError(error: unknown) {
  if (!(error instanceof Error)) {
    return apiError.internal("Failed to create manual payout adjustment.");
  }

  if (/not found/i.test(error.message)) {
    return apiError.notFound(error.message);
  }

  if (/required|must be|cannot exceed|greater than/i.test(error.message)) {
    return apiError.badRequest(error.message);
  }

  if (/already/i.test(error.message)) {
    return apiError.conflict(error.message);
  }

  return apiError.internal(error.message);
}

export const dynamic = "force-dynamic";

export const POST = createApiRoute({
  route: "/api/admin/manual-affiliate-payouts",
  access: "admin",
  bodySchema: postSchema,
  cacheControl: "no-store",
  handler: async ({ body }) => {
    try {
      const payout = await createManualAffiliatePayout({
        affiliateCode: body.affiliateCode,
        orderAmount: body.orderAmount,
        commissionPercent: body.commissionPercent,
        periodDate: body.periodDate,
        reference: body.reference,
        notes: body.notes,
      });

      return {
        data: {
          payout,
        },
      };
    } catch (error) {
      throw normalizeManualPayoutError(error);
    }
  },
});
