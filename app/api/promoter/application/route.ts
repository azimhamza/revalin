import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { createApiRoute } from "@/lib/api/route";
import {
  createPromoter,
  getPromoterByUserIdentity,
} from "@/lib/checkout/promoter-service";
import {
  buildProfileUrl,
  SOCIAL_PLATFORMS,
} from "@/lib/checkout/affiliate-social-profiles";
import { sendPromoterApplicationReceivedEmail } from "@/lib/email/promoter-emails";

const validPlatformValues = SOCIAL_PLATFORMS.map((p) => p.value) as [string, ...string[]];

const socialProfileSchema = z
  .object({
    platform: z.enum(validPlatformValues),
    username: z.string().trim().min(1),
  })
  .transform((profile) => ({
    platform: profile.platform,
    url: buildProfileUrl(profile.platform, profile.username),
  }))
  .pipe(
    z.object({
      platform: z.string(),
      url: z.string().url(),
    }),
  );

const promoterApplicationSchema = z.object({
  socialProfiles: z.array(socialProfileSchema).min(1).max(6),
});

export const dynamic = "force-dynamic";

export const GET = createApiRoute({
  route: "/api/promoter/application",
  access: "session",
  cacheControl: "no-store",
  handler: async ({ session }) => {
    const promoter = await getPromoterByUserIdentity({
      userId: session.user.id,
      email: session.user.email,
    });

    return {
      data: {
        application: promoter
          ? {
              id: promoter.id,
              status: promoter.status,
              email: promoter.email,
            }
          : null,
      },
    };
  },
});

export const POST = createApiRoute({
  route: "/api/promoter/application",
  access: "session",
  bodySchema: promoterApplicationSchema,
  cacheControl: "no-store",
  handler: async ({ session, body }) => {
    if (!session.user.email) {
      throw apiError.unauthenticated("Sign in to request Promoter access.");
    }

    const existingByIdentity = await getPromoterByUserIdentity({
      userId: session.user.id,
      email: session.user.email,
    });

    if (existingByIdentity) {
      const statusLabel =
        existingByIdentity.status.charAt(0).toUpperCase() +
        existingByIdentity.status.slice(1);

      throw apiError.conflict(
        existingByIdentity.status === "rejected"
          ? "A promoter application already exists for that email. Contact support to re-open it."
          : `${statusLabel} promoter access already exists for that email.`,
      );
    }

    const promoter = await createPromoter({
      name: session.user.name?.trim() || "Promoter Applicant",
      email: session.user.email.toLowerCase(),
      userId: session.user.id,
      socialProfiles: body.socialProfiles,
      status: "pending",
    });

    try {
      await sendPromoterApplicationReceivedEmail({
        applicantName: session.user.name,
        applicantEmail: session.user.email.toLowerCase(),
      });
    } catch (error) {
      console.error("[PROMOTER-APPLICATION-EMAIL]", error);
    }

    return {
      data: {
        application: {
          id: promoter.id,
          email: promoter.email,
          status: promoter.status,
        },
      },
      status: 201,
    };
  },
});
