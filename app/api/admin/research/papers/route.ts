import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdmin, isForbiddenError } from "@/lib/auth/assert-admin";
import { createPaper, listAllPapersAdmin } from "@/lib/research/queries";
import { createPaperSchema } from "@/lib/research/schemas";
import { researchPaperStatusEnum } from "@/lib/db/schema";

type PaperStatus = (typeof researchPaperStatusEnum.enumValues)[number];

export async function GET(request: Request) {
  try {
    await assertAdmin();
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const status =
      statusParam &&
      (researchPaperStatusEnum.enumValues as readonly string[]).includes(
        statusParam,
      )
        ? (statusParam as PaperStatus)
        : undefined;

    const papers = await listAllPapersAdmin({ status });
    return NextResponse.json({ papers });
  } catch (error) {
    if (isForbiddenError(error)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[ADMIN-RESEARCH-PAPERS-GET]", error);
    return NextResponse.json(
      { error: "Failed to load papers." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await assertAdmin();
    const body = await request.json();
    const data = createPaperSchema.parse(body);
    const paper = await createPaper(data, session.user.id);
    return NextResponse.json({ paper }, { status: 201 });
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
    if (error instanceof Error && /duplicate key/i.test(error.message)) {
      return NextResponse.json(
        { error: "Slug already exists — choose a different slug." },
        { status: 409 },
      );
    }
    console.error("[ADMIN-RESEARCH-PAPERS-POST]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create paper.",
      },
      { status: 500 },
    );
  }
}
