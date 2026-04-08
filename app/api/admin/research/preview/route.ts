import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdmin, isForbiddenError } from "@/lib/auth/assert-admin";
import { renderMdx } from "@/lib/research/mdx";

export const runtime = "nodejs";

const previewSchema = z.object({
  mdx: z.string().max(200_000),
});

export async function POST(request: Request) {
  try {
    await assertAdmin();
    const body = await request.json();
    const { mdx } = previewSchema.parse(body);

    const content = await renderMdx(mdx);
    if (!content) {
      return NextResponse.json({ html: "" });
    }

    // Dynamically import to keep react-dom/server out of the route's
    // static module graph (Next 15 client-component boundary check).
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(content as React.ReactElement);
    return NextResponse.json({ html });
  } catch (error) {
    if (isForbiddenError(error)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues.map((i) => i.message).join(" ") },
        { status: 400 },
      );
    }
    console.error("[ADMIN-RESEARCH-PREVIEW]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to render preview.",
      },
      { status: 500 },
    );
  }
}
