import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdmin, isForbiddenError } from "@/lib/auth/assert-admin";
import { createPeptide, listPeptides } from "@/lib/research/queries";
import { createPeptideSchema } from "@/lib/research/schemas";

export async function GET() {
  try {
    await assertAdmin();
    const peptides = await listPeptides({ includeDraft: true });
    return NextResponse.json({ peptides });
  } catch (error) {
    if (isForbiddenError(error)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[ADMIN-RESEARCH-PEPTIDES-GET]", error);
    return NextResponse.json(
      { error: "Failed to load peptides." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await assertAdmin();
    const body = await request.json();
    const data = createPeptideSchema.parse(body);
    const peptide = await createPeptide(data);
    return NextResponse.json({ peptide }, { status: 201 });
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
    console.error("[ADMIN-RESEARCH-PEPTIDES-POST]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create peptide.",
      },
      { status: 500 },
    );
  }
}
