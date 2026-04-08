import { z } from "zod";
import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import {
  generateWeeklyPayoutBatches,
  getWeeklyPayoutBatchPeriodOverview,
} from "@/lib/checkout/weekly-payout-service";

const postSchema = z.object({
  action: z.literal("generate"),
  periodDate: z.string().trim().min(1),
});

async function assertAdmin() {
  const session = await getServerSession();
  if (!session?.user || (session.user as any).role !== "admin") {
    throw new Error("forbidden");
  }
}

export async function GET(request: Request) {
  try {
    await assertAdmin();

    const periodDate = new URL(request.url).searchParams.get("periodDate") || undefined;
    const overview = await getWeeklyPayoutBatchPeriodOverview(periodDate);

    return NextResponse.json(overview);
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    console.error("[ADMIN-WEEKLY-PAYOUTS-GET]", error);
    return NextResponse.json(
      { error: "Failed to load weekly payout batches." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await assertAdmin();

    const body = await request.json();
    const data = postSchema.parse(body);
    const result = await generateWeeklyPayoutBatches({
      periodDate: data.periodDate,
    });

    return NextResponse.json({ success: true, ...result });
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

    console.error("[ADMIN-WEEKLY-PAYOUTS-POST]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate weekly payout batches.",
      },
      { status: 500 },
    );
  }
}
