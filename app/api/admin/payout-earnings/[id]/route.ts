import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { createApiRoute } from "@/lib/api/route";
import { updateManualPayoutOrderReference } from "@/lib/checkout/manual-affiliate-payout-service";
import { rejectPromoterWeeklyPayoutEarning } from "@/lib/checkout/promoter-weekly-payout-service";
import { rejectWeeklyPayoutEarning } from "@/lib/checkout/weekly-payout-service";

const paramsSchema = z.object({
  id: z.string().trim().min(1),
});

const patchSchema = z.object({
  partnerType: z.enum(["affiliate", "promoter"]).default("affiliate"),
  action: z.enum(["reject", "update_order"]),
  reference: z.string().trim().min(1).max(128).optional(),
  notes: z.string().trim().optional(),
});

function normalizeEarningError(error: unknown) {
  if (!(error instanceof Error)) {
    return apiError.internal("Failed to update payout earning.");
  }

  if (error.name === "ApiError") {
    return error;
  }

  if (/not found/i.test(error.message)) {
    return apiError.notFound(error.message);
  }

  if (/cannot be rejected/i.test(error.message)) {
    return apiError.conflict(error.message);
  }
  if (
    /only manual payout adjustments/i.test(error.message) ||
    /cannot be edited/i.test(error.message) ||
    /already exists for order/i.test(error.message) ||
    /no existing checkout order matched/i.test(error.message)
  ) {
    return apiError.conflict(error.message);
  }

  return apiError.internal(error.message);
}

export const dynamic = "force-dynamic";

export const PATCH = createApiRoute({
  route: "/api/admin/payout-earnings/:id",
  access: "admin",
  paramsSchema,
  bodySchema: patchSchema,
  cacheControl: "no-store",
  handler: async ({ params, body }) => {
    try {
      if (body.action === "update_order") {
        if (!body.reference) {
          throw apiError.badRequest("Order ID or reference is required.");
        }

        const result = await updateManualPayoutOrderReference({
          earningId: params.id,
          partnerType: body.partnerType,
          reference: body.reference,
          notes: body.notes,
        });

        return {
          data: {
            success: true,
            orderId: result.orderId,
            orderAccessKey: result.orderAccessKey,
          },
        };
      }

      if (body.partnerType === "promoter") {
        await rejectPromoterWeeklyPayoutEarning(params.id, body.notes);
      } else {
        await rejectWeeklyPayoutEarning(params.id, body.notes);
      }

      return {
        data: {
          success: true,
          orderId: "",
          orderAccessKey: "",
        },
      };
    } catch (error) {
      throw normalizeEarningError(error);
    }
  },
});
