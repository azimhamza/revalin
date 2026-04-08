import { z } from "zod";
import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import {
  listCommissionTierConfig,
  saveCommissionTierConfiguration,
} from "@/lib/checkout/commission-tier-service";

const tierSchema = z.object({
  id: z.string().optional(),
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  minRevenue: z.string().trim().min(1),
  maxRevenue: z.string().trim().nullable(),
  rate: z.string().trim().min(1),
  sortOrder: z.number().int().nonnegative(),
  active: z.boolean(),
});

const putSchema = z.object({
  tiers: z.array(tierSchema).min(1),
});

async function assertAdmin() {
  const session = await getServerSession();
  if (!session?.user || (session.user as any).role !== "admin") {
    throw new Error("forbidden");
  }
}

export async function GET() {
  try {
    await assertAdmin();
    const tiers = await listCommissionTierConfig({ includeInactive: true });
    return NextResponse.json({ tiers });
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    console.error("[ADMIN-COMMISSION-TIERS-GET]", error);
    return NextResponse.json(
      { error: "Failed to load commission tiers." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    await assertAdmin();
    const body = await request.json();
    const data = putSchema.parse(body);
    const tiers = await saveCommissionTierConfiguration(data.tiers);
    return NextResponse.json({ success: true, tiers });
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

    console.error("[ADMIN-COMMISSION-TIERS-PUT]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save commission tiers.",
      },
      { status: 500 },
    );
  }
}
