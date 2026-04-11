import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { createApiRoute } from "@/lib/api/route";
import {
  listPromoterInvites,
  markPromoterInviteSuccessful,
  resendPromoterInviteEmail,
  searchAffiliateCandidatesForPromoterInvite,
  updatePromoterInviteStatus,
} from "@/lib/checkout/promoter-service";

const paramsSchema = z.object({
  id: z.string().trim().min(1),
});

const querySchema = z.object({
  q: z.string().trim().optional(),
});

const patchSchema = z.union([
  z.object({
    action: z.literal("mark_successful"),
    affiliateId: z.string().trim().min(1),
    commissionRate: z.string().trim().min(1),
    notes: z.string().trim().optional(),
  }),
  z.object({
    action: z.enum(["mark_applied", "reject", "cancel"]),
    notes: z.string().trim().optional(),
  }),
  z.object({
    action: z.literal("resend_email"),
  }),
]);

function normalizeInviteError(error: unknown) {
  if (!(error instanceof Error)) {
    return apiError.internal("Failed to update promoter invite.");
  }

  if (error.name === "ApiError") {
    return error;
  }

  if (/not found/i.test(error.message)) {
    return apiError.notFound(error.message);
  }

  if (/already mapped|already.*successful|Cancelled|Commission rate|Approve the Growth Partner/i.test(error.message)) {
    return apiError.badRequest(error.message);
  }

  return apiError.internal(error.message);
}

export const dynamic = "force-dynamic";

export const GET = createApiRoute({
  route: "/api/admin/promoter-invites/:id",
  access: "admin",
  paramsSchema,
  querySchema,
  cacheControl: "no-store",
  handler: async ({ params, query }) => {
    const [inviteRows, candidates] = await Promise.all([
      listPromoterInvites(),
      searchAffiliateCandidatesForPromoterInvite({
        inviteId: params.id,
        q: query.q,
      }),
    ]);
    const invite = inviteRows.find((row) => row.invite.id === params.id);

    if (!invite) {
      throw apiError.notFound("Promoter invite not found.");
    }

    return {
      data: {
        invite,
        candidates,
      },
    };
  },
});

export const PATCH = createApiRoute({
  route: "/api/admin/promoter-invites/:id",
  access: "admin",
  paramsSchema,
  bodySchema: patchSchema,
  cacheControl: "no-store",
  handler: async ({ params, body, session }) => {
    try {
      if (body.action === "mark_successful") {
        const invite = await markPromoterInviteSuccessful({
          inviteId: params.id,
          affiliateId: body.affiliateId,
          commissionRate: body.commissionRate,
          notes: body.notes,
          actorUserId: session.user.id,
        });

        return {
          data: {
            invite,
          },
        };
      }

      if (body.action === "resend_email") {
        const invite = await resendPromoterInviteEmail(params.id);
        return {
          data: {
            invite,
          },
        };
      }

      const status =
        body.action === "mark_applied"
          ? "applied"
          : body.action === "reject"
            ? "rejected"
            : "cancelled";
      const invite = await updatePromoterInviteStatus({
        inviteId: params.id,
        status,
        notes: body.notes,
      });

      return {
        data: {
          invite,
        },
      };
    } catch (error) {
      throw normalizeInviteError(error);
    }
  },
});
