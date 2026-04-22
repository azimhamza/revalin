import { z } from "zod";

import { createApiRoute } from "@/lib/api/route";
import { apiError } from "@/lib/api/errors";
import { getWeeklyPayoutBatchById, markWeeklyPayoutBatchPaid, rejectWeeklyPayoutBatch } from "@/lib/checkout/weekly-payout-service";
import {
  getPromoterWeeklyPayoutBatchById,
  markPromoterWeeklyPayoutBatchPaid,
  rejectPromoterWeeklyPayoutBatch,
} from "@/lib/checkout/promoter-weekly-payout-service";

const paramsSchema = z.object({
  id: z.string().trim().min(1),
});

const patchSchema = z.object({
  partnerType: z.enum(["affiliate", "promoter"]).default("affiliate"),
  action: z.enum(["mark_paid", "reject"]),
  txHash: z.string().trim().min(1).optional(),
  paymentReference: z.string().trim().min(1).optional(),
  notes: z.string().trim().optional(),
});

function normalizeBatchError(error: unknown) {
  if (!(error instanceof Error)) {
    return apiError.internal("Failed to update weekly payout batch.");
  }

  if (error.name === "ApiError") {
    return error;
  }

  if (/not found/i.test(error.message)) {
    return apiError.notFound(error.message);
  }

  if (/already been marked paid|cannot be marked paid|cannot be rejected|wallet is missing|payout destination is missing/i.test(error.message)) {
    return apiError.conflict(error.message);
  }

  return apiError.internal(error.message);
}

export const dynamic = "force-dynamic";

export const GET = createApiRoute({
  route: "/api/admin/payout-batches/:id",
  access: "admin",
  paramsSchema,
  cacheControl: "no-store",
  handler: async ({ params }) => {
    const batch =
      (await getWeeklyPayoutBatchById(params.id)) ||
      (await getPromoterWeeklyPayoutBatchById(params.id));

    if (!batch) {
      throw apiError.notFound("Weekly payout batch not found.");
    }

    return {
      data: {
        batch,
      },
    };
  },
});

export const PATCH = createApiRoute({
  route: "/api/admin/payout-batches/:id",
  access: "admin",
  paramsSchema,
  bodySchema: patchSchema,
  cacheControl: "no-store",
  handler: async ({ params, body }) => {
    try {
      if (body.action === "mark_paid") {
        const paymentReference = body.paymentReference ?? body.txHash;
        if (!paymentReference) {
          throw apiError.badRequest(
            "paymentReference is required for mark_paid.",
          );
        }

        if (body.partnerType === "promoter") {
          await markPromoterWeeklyPayoutBatchPaid(params.id, paymentReference);
        } else {
          await markWeeklyPayoutBatchPaid(params.id, paymentReference);
        }
      } else {
        if (body.partnerType === "promoter") {
          await rejectPromoterWeeklyPayoutBatch(params.id, body.notes);
        } else {
          await rejectWeeklyPayoutBatch(params.id, body.notes);
        }
      }

      return {
        data: {
          success: true,
        },
      };
    } catch (error) {
      throw normalizeBatchError(error);
    }
  },
});
