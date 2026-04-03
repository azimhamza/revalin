import { z } from "zod";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { affiliates } from "@/lib/db/schema";
import {
  DEFAULT_AFFILIATE_COMMISSION_RATE,
  DEFAULT_AFFILIATE_DISCOUNT_PERCENT,
  checkAffiliateAssignmentAvailability,
  deleteAffiliateRecord,
  getAffiliateCodeAssignment,
  listAffiliateDiscountChangesForAffiliate,
  removeAffiliateCodeAssignment,
  saveAffiliateCodeAssignment,
  setAffiliateCodeAssignmentActive,
} from "@/lib/checkout/affiliate-code-service";
import {
  getAffiliateCommissionOverview,
  setAffiliateCommissionOverride,
  updateAffiliateBaselineCommission,
} from "@/lib/checkout/commission-service";

const patchSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "suspended"]).optional(),
  affiliateCode: z.string().trim().optional(),
  discountCode: z.string().trim().optional(),
  discountPercent: z.string().trim().optional(),
  commissionRate: z.string().trim().optional(),
  sendApprovalEmail: z.boolean().optional(),
  removeAssignment: z.boolean().optional(),
  changeReason: z.string().trim().optional(),
  suspensionReason: z.string().trim().optional(),
  reinstatementReason: z.string().trim().optional(),
  commissionOverrideMonthKey: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  commissionOverrideRate: z.string().trim().nullable().optional(),
  clearCommissionOverride: z.boolean().optional(),
});

const postSchema = z.object({
  action: z.literal("check_availability"),
  affiliateCode: z.string().trim().min(1),
  discountCode: z.string().trim().min(1),
});

const deleteSchema = z.object({
  removalReason: z.string().trim().optional(),
});

async function assertAdmin() {
  const session = await getServerSession();
  if (!session?.user || (session.user as any).role !== "admin") {
    throw new Error("forbidden");
  }

  return session;
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
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await assertAdmin();
    const { id } = await params;
    const monthKey =
      new URL(request.url).searchParams.get("monthKey") || undefined;
    const [assignment, commission, discountHistory] = await Promise.all([
      getAffiliateCodeAssignment(id),
      getAffiliateCommissionOverview({ affiliateId: id, monthKey }),
      listAffiliateDiscountChangesForAffiliate(id, 10),
    ]);

    return NextResponse.json({ assignment, commission, discountHistory });
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
    const session = await assertAdmin();

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

    if (data.removeAssignment) {
      const assignment = await removeAffiliateCodeAssignment({
        affiliateId: id,
        changedByUserId: session.user.id,
        changeReason: data.changeReason ?? null,
      });
      return NextResponse.json({ success: true, assignment });
    }

    if (data.commissionOverrideMonthKey) {
      const commission = await setAffiliateCommissionOverride({
        affiliateId: id,
        monthKey: data.commissionOverrideMonthKey,
        overrideRate:
          data.clearCommissionOverride ||
          data.commissionOverrideRate === undefined
            ? null
            : data.commissionOverrideRate,
        reason: data.changeReason ?? null,
        actorUserId: session.user.id,
      });

      return NextResponse.json({ success: true, commission });
    }

    const hasAssignmentMutation =
      data.affiliateCode !== undefined ||
      data.discountCode !== undefined ||
      data.discountPercent !== undefined ||
      data.sendApprovalEmail !== undefined;

    if (hasAssignmentMutation || data.status === "approved") {
      const effectiveDiscountCode = data.discountCode ?? current.discountCode;
      const effectiveDiscountPercent =
        data.discountPercent ??
        current.discountPercent ??
        DEFAULT_AFFILIATE_DISCOUNT_PERCENT;

      if (!effectiveDiscountCode) {
        return NextResponse.json(
          {
            error: "Approving an affiliate requires a Swell discount code.",
          },
          { status: 400 },
        );
      }

      const assignment = await saveAffiliateCodeAssignment({
        affiliateId: id,
        affiliateCode: data.affiliateCode ?? current.code,
        discountCode: effectiveDiscountCode,
        discountPercent: effectiveDiscountPercent,
        commissionRate:
          data.commissionRate ??
          current.commissionRate ??
          DEFAULT_AFFILIATE_COMMISSION_RATE,
        approve: data.status === "approved",
        sendEmail: data.sendApprovalEmail ?? data.status === "approved",
        changedByUserId: session.user.id,
        changeReason: data.changeReason ?? null,
        reinstatementReason: data.reinstatementReason ?? null,
      });

      return NextResponse.json({ success: true, assignment });
    }

    if (data.status) {
      const assignment = await setAffiliateCodeAssignmentActive({
        affiliateId: id,
        active: false,
        status: data.status,
        changedByUserId: session.user.id,
        changeReason: data.changeReason ?? null,
        suspensionReason: data.suspensionReason ?? null,
      });

      if (data.commissionRate !== undefined) {
        await updateAffiliateBaselineCommission({
          affiliateId: id,
          commissionRate: data.commissionRate,
          actorUserId: session.user.id,
          notes: data.changeReason ?? null,
        });
      }

      return NextResponse.json({ success: true, assignment });
    }

    if (data.commissionRate !== undefined) {
      const normalizedRate = await updateAffiliateBaselineCommission({
        affiliateId: id,
        commissionRate: data.commissionRate,
        actorUserId: session.user.id,
        notes: data.changeReason ?? null,
      });

      return NextResponse.json({
        success: true,
        commissionRate: normalizedRate,
      });
    }

    return NextResponse.json({
      success: true,
      assignment: await getAffiliateCodeAssignment(id),
    });
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await assertAdmin();

    const { id } = await params;
    const body = await request.json();
    const data = postSchema.parse(body);

    const availability = await checkAffiliateAssignmentAvailability({
      affiliateId: id,
      affiliateCode: data.affiliateCode,
      discountCode: data.discountCode,
    });

    return NextResponse.json({ availability });
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues.map((issue) => issue.message).join(" ") },
        { status: 400 },
      );
    }

    console.error("[ADMIN-AFFILIATE-POST]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to check Growth Partner code availability.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await assertAdmin();

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const data = deleteSchema.parse(body);
    const result = await deleteAffiliateRecord({
      affiliateId: id,
      removalReason: data.removalReason ?? null,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (error instanceof Error && error.message === "Affiliate not found.") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (
      error instanceof Error &&
      /payout history and cannot be permanently deleted/i.test(error.message)
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("[ADMIN-AFFILIATE-DELETE]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete affiliate.",
      },
      { status: 500 },
    );
  }
}
