import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerSession } from "@/lib/auth-server";
import { RESERVED_SLUGS } from "@/lib/checkout/affiliate-constants";
import {
  createAffiliate,
  getAffiliateByCode,
  getAffiliateByEmail,
} from "@/lib/checkout/affiliate-service";

const affiliateSignupSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name."),
  email: z.string().trim().email("Enter a valid email address."),
  code: z.string().trim().min(3, "Choose a referral code with at least 3 characters."),
  walletAddress: z.string().trim().min(12, "Enter the wallet address for payouts."),
});

function normalizeCode(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(request: Request) {
  try {
    const payload = affiliateSignupSchema.parse(await request.json());
    const normalizedCode = normalizeCode(payload.code);
    const normalizedEmail = payload.email.toLowerCase();

    if (normalizedCode.length < 3) {
      return NextResponse.json(
        { error: "Referral codes must be at least 3 characters after cleanup." },
        { status: 400 },
      );
    }

    if (RESERVED_SLUGS.has(normalizedCode)) {
      return NextResponse.json(
        { error: "That referral code is reserved by an existing route. Choose another one." },
        { status: 400 },
      );
    }

    const [existingByEmail, existingByCode, session] = await Promise.all([
      getAffiliateByEmail(normalizedEmail),
      getAffiliateByCode(normalizedCode),
      getServerSession(),
    ]);

    if (existingByEmail) {
      const statusLabel =
        existingByEmail.status.charAt(0).toUpperCase() + existingByEmail.status.slice(1);

      return NextResponse.json(
        {
          error:
            existingByEmail.status === "rejected"
              ? "An affiliate application already exists for that email. Contact support to re-open it."
              : `${statusLabel} affiliate access already exists for that email.`,
        },
        { status: 409 },
      );
    }

    if (existingByCode) {
      return NextResponse.json(
        { error: "That referral code is already taken. Choose another one." },
        { status: 409 },
      );
    }

    const affiliate = await createAffiliate({
      code: normalizedCode,
      name: payload.name,
      email: normalizedEmail,
      walletAddress: payload.walletAddress,
      userId:
        session?.user?.email?.toLowerCase() === normalizedEmail
          ? session.user.id
          : null,
    });

    return NextResponse.json(
      {
        application: {
          id: affiliate.id,
          code: affiliate.code,
          email: affiliate.email,
          status: affiliate.status,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "Invalid affiliate application." },
        { status: 400 },
      );
    }

    console.error("[AFFILIATE-SIGNUP]", error);
    return NextResponse.json(
      { error: "Unable to submit your application right now." },
      { status: 500 },
    );
  }
}
