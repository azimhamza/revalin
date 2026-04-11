import { NextResponse, type NextRequest } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import {
  PROMOTER_REFERRAL_COOKIE_MAX_AGE_DAYS,
  PROMOTER_REFERRAL_COOKIE_NAME,
  PROMOTER_REFERRAL_SOURCE_COOKIE_NAME,
} from "@/lib/checkout/affiliate-constants";
import { resolveApprovedPromoterReferralCode } from "@/lib/checkout/promoter-service";

type RouteContext = {
  params: Promise<{
    code: string;
  }>;
};

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: RouteContext) {
  const { code } = await context.params;
  const resolution = await resolveApprovedPromoterReferralCode(code);

  if (!resolution) {
    return NextResponse.json(
      { error: "Promoter referral link not found." },
      { status: 404 },
    );
  }

  const affiliateSignupPath = `/affiliate/signup?promoter=${encodeURIComponent(
    resolution.code,
  )}`;
  const session = await getServerSession();
  const redirectUrl = session?.user
    ? new URL(affiliateSignupPath, request.url)
    : new URL("/signup", request.url);

  if (!session?.user) {
    redirectUrl.searchParams.set("callbackUrl", affiliateSignupPath);
  }

  const response = NextResponse.redirect(redirectUrl, { status: 302 });
  const maxAge = PROMOTER_REFERRAL_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set(PROMOTER_REFERRAL_COOKIE_NAME, resolution.code, {
    path: "/",
    maxAge,
    sameSite: "lax",
    secure,
  });
  response.cookies.set(PROMOTER_REFERRAL_SOURCE_COOKIE_NAME, resolution.source, {
    path: "/",
    maxAge,
    sameSite: "lax",
    secure,
  });
  response.headers.set("Cache-Control", "no-store");

  return response;
}
