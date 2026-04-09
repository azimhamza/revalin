import { z } from "zod";

import { createApiListRoute, createApiRoute } from "@/lib/api/route";
import { apiError } from "@/lib/api/errors";
import { createPaper, listAllPapersAdmin } from "@/lib/research/queries";
import { createPaperSchema } from "@/lib/research/schemas";
import { researchPaperStatusEnum } from "@/lib/db/schema";

type PaperStatus = (typeof researchPaperStatusEnum.enumValues)[number];

const querySchema = z.object({
  status: z.enum(researchPaperStatusEnum.enumValues).optional(),
});

export const dynamic = "force-dynamic";

export const GET = createApiListRoute({
  route: "/api/admin/research/papers",
  access: "admin",
  querySchema,
  cacheControl: "no-store",
  handler: async ({ query }) => {
    const papers = await listAllPapersAdmin({ status: query.status as PaperStatus | undefined });

    return {
      data: papers,
      page: 1,
      pageSize: papers.length,
      total: papers.length,
    };
  },
});

export const POST = createApiRoute({
  route: "/api/admin/research/papers",
  access: "admin",
  bodySchema: createPaperSchema,
  cacheControl: "no-store",
  handler: async ({ body, session }) => {
    try {
      const paper = await createPaper(body, session.user.id);

      return {
        data: {
          paper,
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
