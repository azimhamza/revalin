import { z } from "zod";

import { createApiRoute } from "@/lib/api/route";
import { sendProductNotificationsBatch, getProductNotificationAdminData } from "@/lib/back-in-stock/service";
import { ProductNotificationError } from "@/lib/back-in-stock/utils";
import { apiError, normalizeApiError } from "@/lib/api/errors";

const querySchema = z.object({
  q: z.string().trim().optional(),
});

const postSchema = z.object({
  selections: z
    .array(
      z.object({
        productHandle: z.string().trim().min(1),
        variantId: z.string().trim().optional().nullable(),
      }),
    )
    .min(1),
});

function normalizeProductNotificationRouteError(error: unknown) {
  if (error instanceof ProductNotificationError) {
    if (error.status >= 500) {
      return apiError.internal(error.message);
    }
    if (error.status === 404) {
      return apiError.notFound(error.message);
    }
    if (error.status === 409) {
      return apiError.conflict(error.message);
    }

    return apiError.badRequest(error.message);
  }

  return normalizeApiError(error);
}

export const dynamic = "force-dynamic";

export const GET = createApiRoute({
  route: "/api/admin/product-notification-dispatches",
  access: "admin",
  querySchema,
  cacheControl: "no-store",
  handler: async ({ query }) => {
    const data = await getProductNotificationAdminData({
      query: query.q,
    });

    return {
      data,
    };
  },
});

export const POST = createApiRoute({
  route: "/api/admin/product-notification-dispatches",
  access: "admin",
  bodySchema: postSchema,
  cacheControl: "no-store",
  handler: async ({ body, session }) => {
    try {
      const result = await sendProductNotificationsBatch({
        createdByUserId: session.user.id,
        selections: body.selections,
      });

      return {
        data: {
          result,
        },
      };
    } catch (error) {
      throw normalizeProductNotificationRouteError(error);
    }
  },
});
