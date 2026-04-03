import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerSession } from "@/lib/auth-server";
import { ensureAffiliateSetupForUser } from "@/lib/checkout/affiliate-service";

const requestSchema = z.object({
  affiliateCode: z.string().trim().min(1).optional(),
});

async function assertAdmin() {
  const session = await getServerSession();
  if (!session?.user || (session.user as any).role !== "admin") {
    throw new Error("forbidden");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    await assertAdmin();

    const { userId } = await params;
    const payload = requestSchema.parse(await request.json().catch(() => ({})));
    const setup = await ensureAffiliateSetupForUser({
      userId,
      affiliateCode: payload.affiliateCode,
    });

    return NextResponse.json({ success: true, setup });
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

    if (
      error instanceof Error &&
      /User not found|already linked to another user|cannot be converted to Growth Partners/i.test(
        error.message,
      )
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("[ADMIN-USER-AFFILIATE-CONVERT]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to prepare Growth Partner setup.",
      },
      { status: 500 },
    );
  }
}
