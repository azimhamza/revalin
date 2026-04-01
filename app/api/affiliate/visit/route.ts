import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getApprovedAffiliateByCode } from "@/lib/checkout/affiliate-service";
import {
  AFFILIATE_VISITOR_COOKIE_MAX_AGE_DAYS,
  AFFILIATE_VISITOR_COOKIE_NAME,
} from "@/lib/checkout/affiliate-constants";
import { createAffiliateVisit } from "@/lib/checkout/affiliate-visit-service";

const visitSchema = z.object({
  code: z.string().trim().min(3),
  discountCode: z.string().trim().min(1).nullable().optional(),
  referralPath: z.string().trim().max(512).nullable().optional(),
  referrer: z.string().trim().max(2048).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const body = visitSchema.parse(await request.json());
    const affiliate = await getApprovedAffiliateByCode(body.code);

    if (!affiliate) {
      return NextResponse.json(
        { error: "Affiliate not found." },
        { status: 404 },
      );
    }

    const cookieStore = await cookies();
    const existingVisitorId = cookieStore
      .get(AFFILIATE_VISITOR_COOKIE_NAME)
      ?.value?.trim();
    const visitorId = existingVisitorId || randomUUID();

    await createAffiliateVisit({
      affiliateId: affiliate.id,
      affiliateCode: affiliate.code,
      visitorId,
      referralPath: body.referralPath,
      referrer: body.referrer,
      userAgent: request.headers.get("user-agent"),
    });

    const response = NextResponse.json({ recorded: true });

    if (!existingVisitorId) {
      response.cookies.set({
        name: AFFILIATE_VISITOR_COOKIE_NAME,
        value: visitorId,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: AFFILIATE_VISITOR_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60,
      });
    }

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "Invalid visit payload." },
        { status: 400 },
      );
    }

    console.error("[AFFILIATE-VISIT]", error);
    return NextResponse.json(
      { error: "Failed to record affiliate visit." },
      { status: 500 },
    );
  }
}
