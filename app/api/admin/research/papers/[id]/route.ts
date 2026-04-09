import { z } from "zod";

import { createApiRoute } from "@/lib/api/route";
import { apiError } from "@/lib/api/errors";
import {
  deletePaper,
  getPaperByIdAdmin,
  updatePaper,
} from "@/lib/research/queries";
import { updatePaperSchema } from "@/lib/research/schemas";

const paramsSchema = z.object({
  id: z.string().trim().min(1),
});

export const dynamic = "force-dynamic";

export const GET = createApiRoute({
  route: "/api/admin/research/papers/:id",
  access: "admin",
  paramsSchema,
  cacheControl: "no-store",
  handler: async ({ params }) => {
    const paper = await getPaperByIdAdmin(params.id);
    if (!paper) {
      throw apiError.notFound("Paper not found");
    }

    return {
      data: {
        paper,
      },
    };
  },
});

export const PATCH = createApiRoute({
  route: "/api/admin/research/papers/:id",
  access: "admin",
  paramsSchema,
  bodySchema: updatePaperSchema,
  cacheControl: "no-store",
  handler: async ({ params, body }) => {
    try {
      const paper = await updatePaper(params.id, body);

      return {
        data: {
          paper,
        },
      };
    } catch (error) {
      if (error instanceof Error && /duplicate key/i.test(error.message)) {
        throw apiError.conflict("Slug already exists — choose a different slug.");
      }

      throw error;
    }
  },
});

export const DELETE = createApiRoute({
  route: "/api/admin/research/papers/:id",
  access: "admin",
  paramsSchema,
  cacheControl: "no-store",
  handler: async ({ params }) => {
    await deletePaper(params.id);

    return {
      data: {
        success: true,
      },
    };
  },
});
