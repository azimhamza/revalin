import { apiError } from "@/lib/api/errors";
import { createApiRoute } from "@/lib/api/route";
import {
  getPromoterByUserIdentity,
  listPromoterInvites,
} from "@/lib/checkout/promoter-service";

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
