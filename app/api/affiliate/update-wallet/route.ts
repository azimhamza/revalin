import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getServerSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { affiliates } from "@/lib/db/schema";
import { encrypt } from "@/lib/db/encryption";
import { getAffiliateByUserIdentity } from "@/lib/checkout/affiliate-service";

const walletSchema = z.object({
  walletAddress: z
    .string()
    .trim()
    .regex(
      /^0x[a-fA-F0-9]{40}$/,
      "Enter a valid USDC Polygon wallet address (0x...).",
    ),
});

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = (session.user as any).role;
    if (role !== "affiliate" && role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { walletAddress } = walletSchema.parse(body);

    const affiliate = await getAffiliateByUserIdentity({
      userId: session.user.id,
      email: session.user.email,
    });

    if (!affiliate) {
      return NextResponse.json(
        { error: "No Growth Partner record found." },
        { status: 404 },
      );
    }

    const encrypted = encrypt(walletAddress);

    await db
      .update(affiliates)
      .set({
        encryptedWalletAddress: encrypted.ciphertext,
        walletIv: encrypted.iv,
        walletTag: encrypted.tag,
        updatedAt: new Date(),
      })
      .where(eq(affiliates.id, affiliate.id));

    revalidatePath("/affiliate/dashboard", "layout");
    revalidatePath("/affiliate/dashboard");
    revalidatePath("/affiliate/dashboard/analytics");
    revalidatePath("/affiliate/dashboard/payouts");
    revalidatePath("/account");
    revalidatePath("/admin/affiliates");
    revalidatePath("/admin/payouts");

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues.map((i) => i.message).join(" ") },
        { status: 400 },
      );
    }
    console.error("[UPDATE-WALLET]", error);
    return NextResponse.json(
      { error: "Failed to update wallet." },
      { status: 500 },
    );
  }
}
