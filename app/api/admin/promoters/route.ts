import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { createApiRoute } from "@/lib/api/route";
import {
  createPromoterInvite,
  createPromoter,
  ensurePromoterForUser,
  listPromoterInvites,
  listPromoters,
  sendPromoterReferralLinkUpdateNotification,
  updatePromoterStatus,
  type PromoterInviteRecord,
  type PromoterRecord,
} from "@/lib/checkout/promoter-service";
import { normalizeAffiliateSocialUrl } from "@/lib/checkout/affiliate-social-profiles";

const socialProfileSchema = z.object({
  platform: z.string().trim().min(1),
  url: z
    .string()
    .trim()
    .transform((value) => normalizeAffiliateSocialUrl(value))
    .pipe(z.string().url()),
});

const postSchema = z.union([
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(1),
    email: z.string().trim().email(),
    defaultCommissionRate: z.string().trim().optional(),
  }),
  z.object({
    action: z.literal("ensure_for_user"),
    userId: z.string().trim().min(1),
    defaultCommissionRate: z.string().trim().optional(),
  }),
  z.object({
    action: z.literal("create_invite"),
    promoterId: z.string().trim().min(1),
    invitedName: z.string().trim().optional(),
    invitedEmail: z.string().trim().email(),
    socialProfiles: z.array(socialProfileSchema).max(6).optional(),
    notes: z.string().trim().optional(),
  }),
  z.object({
    action: z.literal("update_status"),
    promoterId: z.string().trim().min(1),
    status: z.enum(["pending", "approved", "rejected", "suspended"]),
    reinstatementReason: z.string().trim().optional(),
    sendReinstatementEmail: z.boolean().optional(),
    removalReason: z.string().trim().optional(),
    sendRemovalEmail: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("send_link_update_email"),
    promoterId: z.string().trim().min(1),
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
    /valid email|Commission rate|reinstatement reason|removal reason|Only approved promoters/i.test(
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
  handler: async ({ body, session }) => {
    try {
      if (body.action === "create_invite") {
        const invite = await createPromoterInvite({
          promoterId: body.promoterId,
          invitedEmail: body.invitedEmail,
          invitedName: body.invitedName,
          socialProfiles: body.socialProfiles,
          notes: body.notes,
          createdByUserId: session.user.id,
        });

        return {
          data: {
            invite,
            promoter: null,
          },
          status: 201,
        };
      }

      if (body.action === "update_status") {
        const promoter = await updatePromoterStatus({
          promoterId: body.promoterId,
          status: body.status,
          reinstatementReason: body.reinstatementReason,
          sendReinstatementEmail: body.sendReinstatementEmail,
          removalReason: body.removalReason,
          sendRemovalEmail: body.sendRemovalEmail,
        });

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

      const promoter =
        body.action === "ensure_for_user"
          ? await ensurePromoterForUser({
              userId: body.userId,
              defaultCommissionRate: body.defaultCommissionRate,
            })
          : await createPromoter({
              name: body.name,
              email: body.email,
              defaultCommissionRate: body.defaultCommissionRate,
              status: "approved",
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
