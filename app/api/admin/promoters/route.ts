import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { createApiRoute } from "@/lib/api/route";
import {
  assertPromoterCodeAvailable,
  ensurePromoterForUser,
  getApprovedAffiliateCodeForPromoter,
  getPromoterById,
  getPromoterTrackingInfo,
  listPromoterInvites,
  listPromoters,
  sendPromoterReferralLinkUpdateNotification,
  updatePromoterCodeAndRate,
  updatePromoterStatus,
  type PromoterInviteRecord,
  type PromoterRecord,
} from "@/lib/checkout/promoter-service";
import { sendPromoterApprovalEmail } from "@/lib/email/promoter-emails";

const postSchema = z.union([
  z.object({
    action: z.literal("ensure_for_user"),
    userId: z.string().trim().min(1),
    defaultCommissionRate: z.string().trim().optional(),
  }),
  z.object({
    action: z.literal("update_status"),
    promoterId: z.string().trim().min(1),
    status: z.enum(["pending", "approved", "rejected", "suspended"]),
    code: z.string().trim().optional(),
    defaultCommissionRate: z.string().trim().optional(),
    sendApprovalEmail: z.boolean().optional(),
    reinstatementReason: z.string().trim().optional(),
    sendReinstatementEmail: z.boolean().optional(),
    removalReason: z.string().trim().optional(),
    sendRemovalEmail: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("send_link_update_email"),
    promoterId: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("check_code_availability"),
    code: z.string().trim().min(1),
    promoterId: z.string().trim().optional(),
  }),
  z.object({
    action: z.literal("update_promoter"),
    promoterId: z.string().trim().min(1),
    code: z.string().trim().optional(),
    defaultCommissionRate: z.string().trim().optional(),
    sendLinkUpdateEmail: z.boolean().optional(),
  }),
]);

function normalizePromoterError(error: unknown) {
  if (!(error instanceof Error)) {
    return apiError.internal("Failed to update promoter.");
  }

  if (error.name === "ApiError") {
    return error;
  }

  if (/User not found/i.test(error.message)) {
    return apiError.notFound(error.message);
  }

  if (
    /valid email|Commission rate|reinstatement reason|removal reason|Only approved promoters|promoter code|already assigned|reserved by an existing route|at least 3 characters/i.test(
      error.message,
    )
  ) {
    return apiError.badRequest(error.message);
  }

  return apiError.internal(error.message);
}

export const dynamic = "force-dynamic";

export const GET = createApiRoute({
  route: "/api/admin/promoters",
  access: "admin",
  cacheControl: "no-store",
  handler: async () => {
    const [promoters, invites] = await Promise.all([
      listPromoters(),
      listPromoterInvites(),
    ]);

    return {
      data: {
        promoters,
        invites,
      },
    };
  },
});

type AdminPromoterPostResponse = {
  invite: PromoterInviteRecord | null;
  promoter: PromoterRecord | null;
  codeAvailable?: boolean;
};

export const POST = createApiRoute<
  "admin",
  typeof postSchema,
  undefined,
  undefined,
  AdminPromoterPostResponse
>({
  route: "/api/admin/promoters",
  access: "admin",
  bodySchema: postSchema,
  cacheControl: "no-store",
  handler: async ({ body }) => {
    try {
      if (body.action === "check_code_availability") {
        try {
          await assertPromoterCodeAvailable({
            code: body.code,
            excludePromoterId: body.promoterId,
          });
          return {
            data: { invite: null, promoter: null, codeAvailable: true },
          };
        } catch {
          return {
            data: { invite: null, promoter: null, codeAvailable: false },
          };
        }
      }

      if (body.action === "update_promoter") {
        const result = await updatePromoterCodeAndRate({
          promoterId: body.promoterId,
          code: body.code,
          defaultCommissionRate: body.defaultCommissionRate,
        });

        if (result.codeChanged && body.sendLinkUpdateEmail) {
          await sendPromoterReferralLinkUpdateNotification({
            promoterId: body.promoterId,
            oldCode: result.oldCode,
            newCode: result.newCode,
          });
        }

        return {
          data: {
            invite: null,
            promoter: result.promoter,
          },
        };
      }

      if (body.action === "update_status") {
        const currentPromoter =
          body.status === "approved"
            ? await getPromoterById(body.promoterId)
            : null;
        const approvedAffiliateCode =
          currentPromoter?.status === "pending"
            ? await getApprovedAffiliateCodeForPromoter(currentPromoter)
            : null;
        const approvalCode = body.code || approvedAffiliateCode || undefined;
        const shouldUpdateApprovalCode =
          approvalCode && approvalCode !== currentPromoter?.code;

        if (
          body.status === "approved" &&
          (shouldUpdateApprovalCode || body.defaultCommissionRate)
        ) {
          await updatePromoterCodeAndRate({
            promoterId: body.promoterId,
            code: shouldUpdateApprovalCode ? approvalCode : undefined,
            defaultCommissionRate: body.defaultCommissionRate,
          });
        }

        const promoter = await updatePromoterStatus({
          promoterId: body.promoterId,
          status: body.status,
          reinstatementReason: body.reinstatementReason,
          sendReinstatementEmail: body.sendReinstatementEmail,
          removalReason: body.removalReason,
          sendRemovalEmail: body.sendRemovalEmail,
        });

        if (body.status === "approved" && body.sendApprovalEmail) {
          try {
            const trackingInfo = await getPromoterTrackingInfo(promoter);
            await sendPromoterApprovalEmail({
              promoterEmail: promoter.email,
              promoterName: promoter.name,
              referralLink: trackingInfo.primaryLink,
            });
          } catch (error) {
            console.error("[PROMOTER-APPROVAL-EMAIL]", error);
          }
        }

        return {
          data: {
            invite: null,
            promoter,
          },
        };
      }

      if (body.action === "send_link_update_email") {
        const result = await sendPromoterReferralLinkUpdateNotification(
          body.promoterId,
        );

        return {
          data: {
            invite: null,
            promoter: result.promoter,
          },
        };
      }

      const promoter = await ensurePromoterForUser({
        userId: body.userId,
        defaultCommissionRate: body.defaultCommissionRate,
      });

      return {
        data: {
          invite: null,
          promoter,
        },
        status: 201,
      };
    } catch (error) {
      throw normalizePromoterError(error);
    }
  },
});
