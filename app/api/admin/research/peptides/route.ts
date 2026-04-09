import { z } from "zod";

import { createApiListRoute, createApiRoute } from "@/lib/api/route";
import { apiError } from "@/lib/api/errors";
import { createPeptide, listPeptides } from "@/lib/research/queries";
import { createPeptideSchema } from "@/lib/research/schemas";

export const dynamic = "force-dynamic";

export const GET = createApiListRoute({
  route: "/api/admin/research/peptides",
  access: "admin",
  cacheControl: "no-store",
  handler: async () => {
    const peptides = await listPeptides({ includeDraft: true });

    return {
      data: peptides,
      page: 1,
      pageSize: peptides.length,
      total: peptides.length,
    };
  },
});

export const POST = createApiRoute({
  route: "/api/admin/research/peptides",
  access: "admin",
  bodySchema: createPeptideSchema,
  cacheControl: "no-store",
  handler: async ({ body }) => {
    try {
      const peptide = await createPeptide(body);

      return {
        data: {
          peptide,
        },
        status: 201,
      };
    } catch (error) {
      if (error instanceof Error && /duplicate key/i.test(error.message)) {
        throw apiError.conflict("Slug already exists — choose a different slug.");
      }

      throw error;
    }
  },
});
