import { z } from "zod";
import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import {
  getWeeklyPayoutBatchById,
  markWeeklyPayoutBatchPaid,
  rejectWeeklyPayoutBatch,
} from "@/lib/checkout/weekly-payout-service";

const patchSchema = z.object({
  action: z.enum(["mark_paid", "reject"]),
  txHash: z.string().trim().min(1).optional(),
  notes: z.string().trim().optional(),
});

async function assertAdmin() {
  const session = await getServerSession();
  if (!session?.user || (session.user as any).role !== "admin") {
    throw new Error("forbidden");
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await assertAdmin();
    const { id } = await params;
    const batch = await getWeeklyPayoutBatchById(id);

    if (!batch) {
      return NextResponse.json(
        { error: "Weekly payout batch not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ batch });
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    console.error("[ADMIN-WEEKLY-PAYOUT-GET]", error);
    return NextResponse.json(
      { error: "Failed to load weekly payout batch." },
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
    const body = await request.json();
    const data = patchSchema.parse(body);

    if (data.action === "mark_paid") {
      if (!data.txHash) {
        return NextResponse.json(
          { error: "txHash is required for mark_paid." },
          { status: 400 },
        );
      }

      await markWeeklyPayoutBatchPaid(id, data.txHash);
    } else {
      await rejectWeeklyPayoutBatch(id, data.notes);
    }

    return NextResponse.json({ success: true });
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

    console.error("[ADMIN-WEEKLY-PAYOUT-PATCH]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update weekly payout batch.",
      },
      { status: 500 },
    );
  }
}
