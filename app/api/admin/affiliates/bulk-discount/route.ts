import { z } from "zod";
import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import { bulkUpdateAffiliateDiscountPercent } from "@/lib/checkout/affiliate-code-service";

const bulkSchema = z.object({
  mode: z.enum(["selected", "filtered"]),
  affiliateIds: z.array(z.string().uuid()).min(1),
  discountPercent: z.string().trim().min(1),
  changeReason: z.string().trim().optional(),
  dryRun: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session?.user || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const data = bulkSchema.parse(body);

    const summary = await bulkUpdateAffiliateDiscountPercent({
      affiliateIds: data.affiliateIds,
      discountPercent: data.discountPercent,
      mode: data.mode,
      changedByUserId: session.user.id,
      changeReason: data.changeReason ?? null,
      dryRun: data.dryRun,
    });

    return NextResponse.json({ success: true, summary });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues.map((issue) => issue.message).join(" ") },
        { status: 400 },
      );
    }

    console.error("[ADMIN-AFFILIATE-BULK-DISCOUNT]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to run the bulk discount update.",
      },
      { status: 500 },
    );
  }
}
