import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdmin, isForbiddenError } from "@/lib/auth/assert-admin";
import {
  deletePaper,
  getPaperByIdAdmin,
  updatePaper,
} from "@/lib/research/queries";
import { updatePaperSchema } from "@/lib/research/schemas";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    await assertAdmin();
    const { id } = await params;
    const paper = await getPaperByIdAdmin(id);
    if (!paper) {
      return NextResponse.json({ error: "Paper not found" }, { status: 404 });
    }
    return NextResponse.json({ paper });
  } catch (error) {
    if (isForbiddenError(error)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[ADMIN-RESEARCH-PAPER-GET]", error);
    return NextResponse.json(
      { error: "Failed to load paper." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    await assertAdmin();
    const { id } = await params;
    const body = await request.json();
    const data = updatePaperSchema.parse(body);
    const paper = await updatePaper(id, data);
    return NextResponse.json({ paper });
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
    console.error("[ADMIN-RESEARCH-PAPER-PATCH]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update paper.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    await assertAdmin();
    const { id } = await params;
    await deletePaper(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (isForbiddenError(error)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[ADMIN-RESEARCH-PAPER-DELETE]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete paper.",
      },
      { status: 500 },
    );
  }
}
