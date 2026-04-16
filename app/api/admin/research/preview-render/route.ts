import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { createApiRoute } from "@/lib/api/route";
import { renderMdxPreview } from "@/lib/research/mdx";

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
    let content: Awaited<ReturnType<typeof renderMdxPreview>>;
    try {
      content = await renderMdxPreview(body.mdx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Surface the real MDX compile error in server logs so the author can
      // see what broke (the shared route wrapper otherwise hides details).
      console.error("[preview-render] MDX compile failed:", message);
      if (err instanceof Error && err.stack) {
        console.error(err.stack);
      }
      throw apiError.badRequest(`MDX compile failed: ${message}`);
    }

    if (!content) {
      return {
        data: {
          html: "",
        },
      };
    }

    try {
      const { renderToStaticMarkup } = await import("react-dom/server");
      const html = renderToStaticMarkup(content as React.ReactElement);
      return {
        data: {
          html,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[preview-render] render failed:", message);
      if (err instanceof Error && err.stack) {
        console.error(err.stack);
      }
      throw apiError.badRequest(`Render failed: ${message}`);
    }
  },
});
