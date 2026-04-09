import { z } from "zod";

import { createApiRoute } from "@/lib/api/route";
import { apiError } from "@/lib/api/errors";
import { repairAffiliateRoleOrphan } from "@/lib/checkout/affiliate-service";

const paramsSchema = z.object({
  userId: z.string().trim().min(1),
});

function normalizeRepairError(error: unknown) {
  if (!(error instanceof Error)) {
    return apiError.internal("Failed to repair Growth Partner record.");
  }

  if (error.name === "ApiError") {
    return error;
  }

  if (/User not found/i.test(error.message)) {
    return apiError.notFound(error.message);
  }

  if (/not currently marked as a Growth Partner|already linked to another user/i.test(error.message)) {
    return apiError.conflict(error.message);
  }

  return apiError.internal(error.message);
}

export const dynamic = "force-dynamic";

export const POST = createApiRoute({
  route: "/api/admin/affiliates/orphan-users/:userId/repair",
  access: "admin",
  paramsSchema,
  cacheControl: "no-store",
  handler: async ({ params }) => {
    try {
      const repair = await repairAffiliateRoleOrphan({
        userId: params.userId,
      });

      return {
        data: {
          repair,
        },
      };
    } catch (error) {
      throw normalizeRepairError(error);
    }
  },
});
