import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { createApiRoute } from "@/lib/api/route";
import { deletePromoterRecord } from "@/lib/checkout/promoter-service";

const paramsSchema = z.object({
  id: z.string().trim().min(1),
});

export const dynamic = "force-dynamic";

export const DELETE = createApiRoute({
  route: "/api/admin/promoters/:id",
  access: "admin",
  paramsSchema,
  cacheControl: "no-store",
  handler: async ({ params }) => {
    try {
      const result = await deletePromoterRecord({
        promoterId: params.id,
      });

      return {
        data: {
          result,
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        if (/not found/i.test(error.message)) {
          throw apiError.notFound(error.message);
        }
        if (/payout history/i.test(error.message)) {
          throw apiError.badRequest(error.message);
        }
      }
      throw apiError.internal(
        error instanceof Error ? error.message : "Failed to delete promoter.",
      );
    }
  },
});
