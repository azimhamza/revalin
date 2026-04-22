import { revalidatePath } from "next/cache";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { createApiRoute } from "@/lib/api/route";
import {
  ACH_PAYOUT_METHOD,
  CRYPTO_PAYOUT_METHOD,
} from "@/lib/checkout/payout-methods";
import {
  getPromoterByUserIdentity,
  updatePromoterPayoutSettings,
} from "@/lib/checkout/promoter-service";

const payoutSettingsSchema = z.discriminatedUnion("payoutMethod", [
  z.object({
    payoutMethod: z.literal(CRYPTO_PAYOUT_METHOD),
    walletAddress: z
      .string()
      .trim()
      .regex(
        /^0x[a-fA-F0-9]{40}$/,
        "Enter a valid USDC Polygon wallet address (0x...).",
      ),
  }),
  z.object({
    payoutMethod: z.literal(ACH_PAYOUT_METHOD),
    achAccountHolderName: z
      .string()
      .trim()
      .min(1, "Enter the account holder name."),
    achBankName: z.string().trim().min(1, "Enter the bank name."),
    achAccountType: z.enum(["checking", "savings"]),
    routingNumber: z.string().trim().optional(),
    accountNumber: z.string().trim().optional(),
  }),
]);

export const dynamic = "force-dynamic";

export const PATCH = createApiRoute({
  route: "/api/promoter/payout-settings",
  access: "promoter-or-admin",
  bodySchema: payoutSettingsSchema,
  cacheControl: "no-store",
  handler: async ({ session, body }) => {
    const promoter = await getPromoterByUserIdentity({
      userId: session.user.id,
      email: session.user.email,
    });

    if (!promoter) {
      throw apiError.notFound("No promoter record found.");
    }

    await updatePromoterPayoutSettings({
      promoterId: promoter.id,
      payoutMethod: body.payoutMethod,
      walletAddress:
        body.payoutMethod === CRYPTO_PAYOUT_METHOD
          ? body.walletAddress
          : undefined,
      achAccountHolderName:
        body.payoutMethod === ACH_PAYOUT_METHOD
          ? body.achAccountHolderName
          : undefined,
      achBankName:
        body.payoutMethod === ACH_PAYOUT_METHOD
          ? body.achBankName
          : undefined,
      achAccountType:
        body.payoutMethod === ACH_PAYOUT_METHOD
          ? body.achAccountType
          : undefined,
      routingNumber:
        body.payoutMethod === ACH_PAYOUT_METHOD
          ? body.routingNumber
          : undefined,
      accountNumber:
        body.payoutMethod === ACH_PAYOUT_METHOD
          ? body.accountNumber
          : undefined,
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
