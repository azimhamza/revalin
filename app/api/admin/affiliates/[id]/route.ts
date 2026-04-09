import { eq } from "drizzle-orm";
import { z } from "zod";

import { createApiRoute } from "@/lib/api/route";
import { apiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { affiliates } from "@/lib/db/schema";
import {
  DEFAULT_AFFILIATE_COMMISSION_RATE,
  DEFAULT_AFFILIATE_DISCOUNT_PERCENT,
  checkAffiliateAssignmentAvailability,
  deleteAffiliateRecord,
  getAffiliateCodeAssignment,
  listAffiliateDiscountChangesForAffiliate,
  removeAffiliateCodeAssignment,
  saveAffiliateCodeAssignment,
  setAffiliateCodeAssignmentActive,
} from "@/lib/checkout/affiliate-code-service";
import {
  getAffiliateCommissionOverview,
  setAffiliateCommissionOverride,
  updateAffiliateBaselineCommission,
} from "@/lib/checkout/commission-service";

const paramsSchema = z.object({
  id: z.string().trim().min(1),
});

const querySchema = z.object({
  monthKey: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

const patchSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "suspended"]).optional(),
  affiliateCode: z.string().trim().optional(),
  discountCode: z.string().trim().optional(),
  discountPercent: z.string().trim().optional(),
  commissionRate: z.string().trim().optional(),
  sendApprovalEmail: z.boolean().optional(),
  removeAssignment: z.boolean().optional(),
  changeReason: z.string().trim().optional(),
  suspensionReason: z.string().trim().optional(),
  reinstatementReason: z.string().trim().optional(),
  commissionOverrideMonthKey: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  commissionOverrideRate: z.string().trim().nullable().optional(),
  clearCommissionOverride: z.boolean().optional(),
});

const postSchema = z.object({
  action: z.literal("check_availability"),
  affiliateCode: z.string().trim().min(1),
  discountCode: z.string().trim().min(1),
});

const deleteSchema = z.object({
  removalReason: z.string().trim().optional(),
});

async function getAffiliateRow(id: string) {
  const rows = await db
    .select()
    .from(affiliates)
    .where(eq(affiliates.id, id))
    .limit(1);

  return rows[0] || null;
}

function normalizeAffiliateError(error: unknown) {
  if (!(error instanceof Error)) {
    return apiError.internal("Failed to update affiliate.");
  }

  if (error.name === "ApiError") {
    return error;
  }

  if (/Affiliate not found\./i.test(error.message)) {
    return apiError.notFound(error.message);
  }

  if (/payout history and cannot be permanently deleted/i.test(error.message)) {
    return apiError.conflict(error.message);
  }

  if (
    /requires a Swell discount code|already linked|already exists|must be/i.test(
      error.message,
    )
  ) {
    return apiError.badRequest(error.message);
  }

  return apiError.internal(error.message);
}

export const dynamic = "force-dynamic";

export const GET = createApiRoute({
  route: "/api/admin/affiliates/:id",
  access: "admin",
  paramsSchema,
  querySchema,
  cacheControl: "no-store",
  handler: async ({ params, query }) => {
    const [assignment, commission, discountHistory] = await Promise.all([
      getAffiliateCodeAssignment(params.id),
      getAffiliateCommissionOverview({
        affiliateId: params.id,
        monthKey: query.monthKey,
      }),
      listAffiliateDiscountChangesForAffiliate(params.id, 10),
    ]);

    return {
      data: {
        assignment,
        commission,
        discountHistory,
      },
    };
  },
});

export const PATCH = createApiRoute<
  "admin",
  typeof patchSchema,
  undefined,
  typeof paramsSchema,
  Record<string, unknown>
>({
  route: "/api/admin/affiliates/:id",
  access: "admin",
  paramsSchema,
  bodySchema: patchSchema,
  cacheControl: "no-store",
  handler: async ({ params, body, session }) => {
    try {
      const current = await getAffiliateRow(params.id);
      if (!current) {
        throw apiError.notFound("Affiliate not found.");
      }

      if (body.removeAssignment) {
        const assignment = await removeAffiliateCodeAssignment({
          affiliateId: params.id,
          changedByUserId: session.user.id,
          changeReason: body.changeReason ?? null,
        });

        return {
          data: {
            assignment,
          },
        };
      }

      if (body.commissionOverrideMonthKey) {
        const commission = await setAffiliateCommissionOverride({
          affiliateId: params.id,
          monthKey: body.commissionOverrideMonthKey,
          overrideRate:
            body.clearCommissionOverride ||
            body.commissionOverrideRate === undefined
              ? null
              : body.commissionOverrideRate,
          reason: body.changeReason ?? null,
          actorUserId: session.user.id,
        });

        return {
          data: {
            commission,
          },
        };
      }

      const hasAssignmentMutation =
        body.affiliateCode !== undefined ||
        body.discountCode !== undefined ||
        body.discountPercent !== undefined ||
        body.sendApprovalEmail !== undefined;

      if (hasAssignmentMutation || body.status === "approved") {
        const effectiveDiscountCode = body.discountCode ?? current.discountCode;
        const effectiveDiscountPercent =
          body.discountPercent ??
          current.discountPercent ??
          DEFAULT_AFFILIATE_DISCOUNT_PERCENT;

        if (!effectiveDiscountCode) {
          throw apiError.badRequest(
            "Approving an affiliate requires a Swell discount code.",
          );
        }

        const assignment = await saveAffiliateCodeAssignment({
          affiliateId: params.id,
          affiliateCode: body.affiliateCode ?? current.code,
          discountCode: effectiveDiscountCode,
          discountPercent: effectiveDiscountPercent,
          commissionRate:
            body.commissionRate ??
            current.commissionRate ??
            DEFAULT_AFFILIATE_COMMISSION_RATE,
          approve: body.status === "approved",
          sendEmail: body.sendApprovalEmail ?? body.status === "approved",
          changedByUserId: session.user.id,
          changeReason: body.changeReason ?? null,
          reinstatementReason: body.reinstatementReason ?? null,
        });

        return {
          data: {
            assignment,
          },
        };
      }

      if (body.status) {
        const assignment = await setAffiliateCodeAssignmentActive({
          affiliateId: params.id,
          active: false,
          status: body.status,
          changedByUserId: session.user.id,
          changeReason: body.changeReason ?? null,
          suspensionReason: body.suspensionReason ?? null,
        });

        if (body.commissionRate !== undefined) {
          await updateAffiliateBaselineCommission({
            affiliateId: params.id,
            commissionRate: body.commissionRate,
            actorUserId: session.user.id,
            notes: body.changeReason ?? null,
          });
        }

        return {
          data: {
            assignment,
          },
        };
      }

      if (body.commissionRate !== undefined) {
        const commissionRate = await updateAffiliateBaselineCommission({
          affiliateId: params.id,
          commissionRate: body.commissionRate,
          actorUserId: session.user.id,
          notes: body.changeReason ?? null,
        });

        return {
          data: {
            commissionRate,
          },
        };
      }

      return {
        data: {
          assignment: await getAffiliateCodeAssignment(params.id),
        },
      };
    } catch (error) {
      throw normalizeAffiliateError(error);
    }
  },
});

export const POST = createApiRoute({
  route: "/api/admin/affiliates/:id",
  access: "admin",
  paramsSchema,
  bodySchema: postSchema,
  cacheControl: "no-store",
  handler: async ({ params, body }) => {
    const availability = await checkAffiliateAssignmentAvailability({
      affiliateId: params.id,
      affiliateCode: body.affiliateCode,
      discountCode: body.discountCode,
    });

    return {
      data: {
        availability,
      },
    };
  },
});

export const DELETE = createApiRoute({
  route: "/api/admin/affiliates/:id",
  access: "admin",
  paramsSchema,
  bodySchema: deleteSchema,
  cacheControl: "no-store",
  handler: async ({ params, body }) => {
    try {
      const result = await deleteAffiliateRecord({
        affiliateId: params.id,
        removalReason: body.removalReason ?? null,
      });

      return {
        data: {
          result,
        },
      };
    } catch (error) {
      throw normalizeAffiliateError(error);
    }
  },
});
