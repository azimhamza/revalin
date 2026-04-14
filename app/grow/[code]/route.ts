import { NextResponse, type NextRequest } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import {
  PROMOTER_REFERRAL_COOKIE_MAX_AGE_DAYS,
  PROMOTER_REFERRAL_COOKIE_NAME,
  PROMOTER_REFERRAL_SOURCE_COOKIE_NAME,
} from "@/lib/checkout/affiliate-constants";
import { getAffiliateByUserIdentity } from "@/lib/checkout/affiliate-service";
import { resolveApprovedPromoterReferralCode } from "@/lib/checkout/promoter-service";
import {
  getFirstName,
  resolveGrowRedirect,
} from "@/lib/checkout/promoter-referral-logic";

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

  const promoterFirstName = getFirstName(resolution.promoter.name) ?? "";
  const session = await getServerSession();

  const affiliateRecord =
    session?.user
      ? await getAffiliateByUserIdentity({
          userId: session.user.id,
          email: session.user.email,
        })
      : null;

  const redirect = resolveGrowRedirect({
    isLoggedIn: Boolean(session?.user),
    affiliateStatus: affiliateRecord?.status ?? null,
    promoterCode: resolution.code,
    promoterFirstName,
  });

  let redirectUrl: URL;

  switch (redirect.destination) {
    case "affiliate_dashboard":
      redirectUrl = new URL("/affiliate/dashboard", request.url);
      break;
    case "account_no_boost":
      redirectUrl = new URL("/account", request.url);
      break;
    case "affiliate_signup":
      redirectUrl = new URL("/affiliate/signup", request.url);
      redirectUrl.searchParams.set("promoter", redirect.promoterCode);
      break;
    case "signup":
      redirectUrl = new URL("/signup", request.url);
      redirectUrl.searchParams.set("callbackUrl", redirect.callbackUrl);
      if (redirect.promoterName) {
        redirectUrl.searchParams.set("promoter_name", redirect.promoterName);
      }
      break;
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
