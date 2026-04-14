import { z } from "zod";

import { createApiRoute } from "@/lib/api/route";
import { apiError } from "@/lib/api/errors";
import {
  checkNewAffiliateAssignmentAvailability,
  createAffiliateCodeAssignmentForUser,
} from "@/lib/checkout/affiliate-code-service";

const paramsSchema = z.object({
  userId: z.string().trim().min(1),
});

const availabilityRequestSchema = z.object({
  action: z.literal("check_availability"),
  affiliateCode: z.string().trim().min(1),
  discountCode: z.string().trim().min(1),
});

const saveRequestSchema = z.object({
  action: z.literal("save_assignment"),
  affiliateCode: z.string().trim().min(1),
  discountCode: z.string().trim().min(1),
  discountPercent: z.string().trim().min(1),
  commissionRate: z.string().trim().optional(),
  sendApprovalEmail: z.boolean().optional(),
  changeReason: z.string().trim().optional(),
  reinstatementReason: z.string().trim().optional(),
});

const requestSchema = z.union([availabilityRequestSchema, saveRequestSchema]);

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

  if (
    /already linked to another user|cannot be converted to Growth Partners/i.test(
      error.message,
    )
  ) {
    return apiError.conflict(error.message);
  }

  if (
    /reserved by an existing route|already assigned|already in use|requires a Swell discount code|must be/i.test(
      error.message,
    )
  ) {
    return apiError.badRequest(error.message);
  }

  return apiError.internal(error.message);
}

export const dynamic = "force-dynamic";

export const POST = createApiRoute<
  "admin",
  typeof requestSchema,
  undefined,
  typeof paramsSchema,
  Record<string, unknown>
>({
  route: "/api/admin/users/:userId/affiliate-assignment",
  access: "admin",
  paramsSchema,
  bodySchema: requestSchema,
  cacheControl: "no-store",
  handler: async ({ params, body, session }) => {
    try {
      if ("action" in body && body.action === "check_availability") {
        return {
          data: {
            availability: await checkNewAffiliateAssignmentAvailability({
              affiliateCode: body.affiliateCode,
              discountCode: body.discountCode,
            }),
          },
        };
      }

      if ("action" in body && body.action === "save_assignment") {
        return {
          data: {
            assignment: await createAffiliateCodeAssignmentForUser({
              userId: params.userId,
              affiliateCode: body.affiliateCode,
              discountCode: body.discountCode,
              discountPercent: body.discountPercent,
              commissionRate: body.commissionRate,
              sendEmail: body.sendApprovalEmail,
              changedByUserId: session.user.id,
              changeReason: body.changeReason ?? null,
              reinstatementReason: body.reinstatementReason ?? null,
            }),
          },
        };
      }

      throw apiError.badRequest("Unsupported affiliate assignment action.");
    } catch (error) {
      throw normalizeAssignmentError(error);
    }
  },
});
