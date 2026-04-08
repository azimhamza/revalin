import { z } from "zod";
import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { sendProductNotificationsBatch } from "@/lib/back-in-stock/service";
import { ProductNotificationError } from "@/lib/back-in-stock/utils";

const postSchema = z.object({
  selections: z
    .array(
      z.object({
        productHandle: z.string().trim().min(1),
        variantId: z.string().trim().optional().nullable(),
      }),
    )
    .min(1),
});

async function assertAdmin() {
  const session = await getServerSession();
  if (!session?.user || (session.user as any).role !== "admin") {
    throw new Error("forbidden");
  }

  return session;
}

export async function POST(request: Request) {
  try {
    const session = await assertAdmin();
    const body = await request.json();
    const data = postSchema.parse(body);

    const result = await sendProductNotificationsBatch({
      createdByUserId: session.user.id,
      selections: data.selections,
    });

    return NextResponse.json({
      success: true,
      result,
    });
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

    if (error instanceof ProductNotificationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("[ADMIN-PRODUCT-NOTIFICATIONS-POST]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to send product notifications.",
      },
      { status: 500 },
    );
  }
}
