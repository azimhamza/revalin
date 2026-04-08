import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdmin, isForbiddenError } from "@/lib/auth/assert-admin";
import {
  deletePeptide,
  getPeptideByIdAdmin,
  updatePeptide,
} from "@/lib/research/queries";
import { updatePeptideSchema } from "@/lib/research/schemas";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    await assertAdmin();
    const { id } = await params;
    const peptide = await getPeptideByIdAdmin(id);
    if (!peptide) {
      return NextResponse.json({ error: "Peptide not found" }, { status: 404 });
    }
    return NextResponse.json({ peptide });
  } catch (error) {
    if (isForbiddenError(error)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[ADMIN-RESEARCH-PEPTIDE-GET]", error);
    return NextResponse.json(
      { error: "Failed to load peptide." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    await assertAdmin();
    const { id } = await params;
    const body = await request.json();
    const data = updatePeptideSchema.parse(body);
    const peptide = await updatePeptide(id, data);
    return NextResponse.json({ peptide });
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
    console.error("[ADMIN-RESEARCH-PEPTIDE-PATCH]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update peptide.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    await assertAdmin();
    const { id } = await params;
    const force = new URL(request.url).searchParams.get("force") === "true";
    await deletePeptide(id, { force });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (isForbiddenError(error)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof Error && /linked paper/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("[ADMIN-RESEARCH-PEPTIDE-DELETE]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete peptide.",
      },
      { status: 500 },
    );
  }
}
