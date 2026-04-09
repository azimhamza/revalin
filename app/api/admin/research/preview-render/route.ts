import { z } from "zod";

import { createApiRoute } from "@/lib/api/route";
import { renderMdx } from "@/lib/research/mdx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const previewSchema = z.object({
  mdx: z.string().max(200_000),
});

export const POST = createApiRoute({
  route: "/api/admin/research/preview-render",
  access: "admin",
  bodySchema: previewSchema,
  cacheControl: "no-store",
  handler: async ({ body }) => {
    const content = await renderMdx(body.mdx);
    if (!content) {
      return {
        data: {
          html: "",
        },
      };
    }

    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(content as React.ReactElement);

    return {
      data: {
        html,
      },
    };
  },
});
