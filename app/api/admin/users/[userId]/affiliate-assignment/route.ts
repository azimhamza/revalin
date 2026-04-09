import { z } from "zod";

import { createApiRoute } from "@/lib/api/route";
import { apiError } from "@/lib/api/errors";
import { ensureAffiliateSetupForUser } from "@/lib/checkout/affiliate-service";

const paramsSchema = z.object({
  userId: z.string().trim().min(1),
});

const requestSchema = z.object({
  affiliateCode: z.string().trim().min(1).optional(),
});

function normalizeAssignmentError(error: unknown) {
  if (!(error instanceof Error)) {
    return apiError.internal("Failed to prepare Growth Partner setup.");
  }

  if (error.name === "ApiError") {
    return error;
  }

  if (/User not found/i.test(error.message)) {
    return apiError.notFound(error.message);
  }

  if (/already linked to another user|cannot be converted to Growth Partners/i.test(error.message)) {
    return apiError.conflict(error.message);
  }

  return apiError.internal(error.message);
}

export const dynamic = "force-dynamic";

export const POST = createApiRoute({
  route: "/api/admin/users/:userId/affiliate-assignment",
  access: "admin",
  paramsSchema,
  bodySchema: requestSchema,
  cacheControl: "no-store",
  handler: async ({ params, body }) => {
    try {
      const setup = await ensureAffiliateSetupForUser({
        userId: params.userId,
        affiliateCode: body.affiliateCode,
      });

      return {
        data: {
          setup,
        },
      };
    } catch (error) {
      throw normalizeAssignmentError(error);
    }
  },
});
