import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import { repairAffiliateRoleOrphan } from "@/lib/checkout/affiliate-service";

async function assertAdmin() {
  const session = await getServerSession();
  if (!session?.user || (session.user as any).role !== "admin") {
    throw new Error("forbidden");
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    await assertAdmin();

    const { userId } = await params;
    const repair = await repairAffiliateRoleOrphan({ userId });

    return NextResponse.json({ success: true, repair });
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (
      error instanceof Error &&
      /User not found|not currently marked as a Growth Partner|already linked to another user/i.test(
        error.message,
      )
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("[ADMIN-AFFILIATE-REPAIR]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to repair Growth Partner record.",
      },
      { status: 500 },
    );
  }
}
