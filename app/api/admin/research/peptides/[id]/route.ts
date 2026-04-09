import { z } from "zod";

import { createApiRoute } from "@/lib/api/route";
import { apiError } from "@/lib/api/errors";
import {
  deletePeptide,
  getPeptideByIdAdmin,
  updatePeptide,
} from "@/lib/research/queries";
import { updatePeptideSchema } from "@/lib/research/schemas";

const paramsSchema = z.object({
  id: z.string().trim().min(1),
});

const querySchema = z.object({
  force: z.string().trim().optional(),
});

export const dynamic = "force-dynamic";

export const GET = createApiRoute({
  route: "/api/admin/research/peptides/:id",
  access: "admin",
  paramsSchema,
  cacheControl: "no-store",
  handler: async ({ params }) => {
    const peptide = await getPeptideByIdAdmin(params.id);
    if (!peptide) {
      throw apiError.notFound("Peptide not found");
    }

    return {
      data: {
        peptide,
      },
    };
  },
});

export const PATCH = createApiRoute({
  route: "/api/admin/research/peptides/:id",
  access: "admin",
  paramsSchema,
  bodySchema: updatePeptideSchema,
  cacheControl: "no-store",
  handler: async ({ params, body }) => {
    try {
      const peptide = await updatePeptide(params.id, body);

      return {
        data: {
          peptide,
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
  route: "/api/admin/research/peptides/:id",
  access: "admin",
  paramsSchema,
  querySchema,
  cacheControl: "no-store",
  handler: async ({ params, query }) => {
    try {
      await deletePeptide(params.id, { force: query.force === "true" });

      return {
        data: {
          success: true,
        },
      };
    } catch (error) {
      if (error instanceof Error && /linked paper/i.test(error.message)) {
        throw apiError.conflict(error.message);
      }

      throw error;
    }
  },
});
