import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { createApiRoute } from "@/lib/api/route";
import {
  createPromoter,
  getPromoterByUserIdentity,
} from "@/lib/checkout/promoter-service";
import { sendPromoterApplicationReceivedEmail } from "@/lib/email/promoter-emails";

const promoterApplicationSchema = z.object({});

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
  handler: async ({ session }) => {
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
