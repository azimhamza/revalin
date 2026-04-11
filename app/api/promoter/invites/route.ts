import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { createApiRoute } from "@/lib/api/route";
import {
  createPromoterInvite,
  getPromoterByUserIdentity,
  listPromoterInvites,
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

const inviteSchema = z.object({
  invitedName: z.string().trim().optional(),
  invitedEmail: z.string().trim().email(),
  socialProfiles: z.array(socialProfileSchema).max(6).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const dynamic = "force-dynamic";

export const GET = createApiRoute({
  route: "/api/promoter/invites",
  access: "promoter-or-admin",
  cacheControl: "no-store",
  handler: async ({ session }) => {
    const promoter = await getPromoterByUserIdentity({
      userId: session.user.id,
      email: session.user.email,
    });

    if (!promoter) {
      throw apiError.notFound("No promoter record found.");
    }

    return {
      data: {
        invites: await listPromoterInvites({ promoterId: promoter.id }),
      },
    };
  },
});

export const POST = createApiRoute({
  route: "/api/promoter/invites",
  access: "promoter-or-admin",
  bodySchema: inviteSchema,
  cacheControl: "no-store",
  handler: async ({ session, body }) => {
    const promoter = await getPromoterByUserIdentity({
      userId: session.user.id,
      email: session.user.email,
    });

    if (!promoter) {
      throw apiError.notFound("No promoter record found.");
    }

    const invite = await createPromoterInvite({
      promoterId: promoter.id,
      invitedEmail: body.invitedEmail,
      invitedName: body.invitedName,
      socialProfiles: body.socialProfiles,
      notes: body.notes,
      createdByUserId: session.user.id,
    });

    return {
      data: {
        invite,
      },
      status: 201,
    };
  },
});
