import { revalidatePath } from "next/cache";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { createApiRoute } from "@/lib/api/route";
import {
  getPromoterByUserIdentity,
  updatePromoterWallet,
} from "@/lib/checkout/promoter-service";

const walletSchema = z.object({
  walletAddress: z
    .string()
    .trim()
    .regex(
      /^0x[a-fA-F0-9]{40}$/,
      "Enter a valid USDC Polygon wallet address (0x...).",
    ),
});

export const dynamic = "force-dynamic";

export const PATCH = createApiRoute({
  route: "/api/promoter/payout-settings",
  access: "promoter-or-admin",
  bodySchema: walletSchema,
  cacheControl: "no-store",
  handler: async ({ session, body }) => {
    const promoter = await getPromoterByUserIdentity({
      userId: session.user.id,
      email: session.user.email,
    });

    if (!promoter) {
      throw apiError.notFound("No promoter record found.");
    }

    await updatePromoterWallet({
      promoterId: promoter.id,
      walletAddress: body.walletAddress,
    });

    revalidatePath("/promoter/dashboard");
    revalidatePath("/account");
    revalidatePath("/admin/promoters");
    revalidatePath("/admin/payouts");

    return {
      data: {
        saved: true,
      },
    };
  },
});
