import { z } from "zod";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { affiliates } from "@/lib/db/schema";
import {
  getAffiliateCodeAssignment,
  saveAffiliateCodeAssignment,
  setAffiliateCodeAssignmentActive,
} from "@/lib/checkout/affiliate-code-service";

const patchSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "suspended"]).optional(),
  discountCode: z.string().trim().optional(),
  discountPercent: z.string().trim().optional(),
  commissionRate: z.string().trim().optional(),
  sendApprovalEmail: z.boolean().optional(),
});

async function assertAdmin() {
  const session = await getServerSession();
  if (!session?.user || (session.user as any).role !== "admin") {
    throw new Error("forbidden");
  }
}

async function getAffiliateRow(id: string) {
  const rows = await db
    .select()
    .from(affiliates)
    .where(eq(affiliates.id, id))
    .limit(1);

  return rows[0] || null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await assertAdmin();
    const { id } = await params;
    const assignment = await getAffiliateCodeAssignment(id);

    return NextResponse.json({ assignment });
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    console.error("[ADMIN-AFFILIATE-GET]", error);
    return NextResponse.json(
      { error: "Failed to load affiliate assignment." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await assertAdmin();

    const { id } = await params;
    const current = await getAffiliateRow(id);
    if (!current) {
      return NextResponse.json(
        { error: "Affiliate not found." },
        { status: 404 },
      );
    }

    const body = await request.json();
    const data = patchSchema.parse(body);
    const hasAssignmentMutation =
      data.discountCode !== undefined ||
      data.discountPercent !== undefined ||
      data.sendApprovalEmail !== undefined;

    if (hasAssignmentMutation || data.status === "approved") {
      const effectiveDiscountCode = data.discountCode ?? current.discountCode;
      const effectiveDiscountPercent =
        data.discountPercent ?? current.discountPercent;

      if (!effectiveDiscountCode || !effectiveDiscountPercent) {
        return NextResponse.json(
          {
            error:
              "Approving an affiliate requires both a Swell discount code and a discount percent.",
          },
          { status: 400 },
        );
      }

      const assignment = await saveAffiliateCodeAssignment({
        affiliateId: id,
        discountCode: effectiveDiscountCode,
        discountPercent: effectiveDiscountPercent,
        commissionRate: data.commissionRate ?? current.commissionRate,
        approve: data.status === "approved",
        sendEmail: data.sendApprovalEmail ?? data.status === "approved",
      });

      return NextResponse.json({ success: true, assignment });
    }

    if (data.status) {
      const assignment = await setAffiliateCodeAssignmentActive({
        affiliateId: id,
        active: false,
        status: data.status,
      });

      if (data.commissionRate !== undefined) {
        await db
          .update(affiliates)
          .set({ commissionRate: data.commissionRate, updatedAt: new Date() })
          .where(eq(affiliates.id, id));
      }

      return NextResponse.json({ success: true, assignment });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.commissionRate !== undefined)
      updates.commissionRate = data.commissionRate;

    await db.update(affiliates).set(updates).where(eq(affiliates.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues.map((i) => i.message).join(" ") },
        { status: 400 },
      );
    }

    console.error("[ADMIN-AFFILIATE-PATCH]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update affiliate.",
      },
      { status: 500 },
    );
  }
}
