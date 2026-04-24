import { NextRequest, NextResponse } from "next/server";
import {
  AFFILIATE_COOKIE_MAX_AGE_DAYS,
  AFFILIATE_COOKIE_NAME,
  AFFILIATE_DISCOUNT_COOKIE_NAME,
  AFFILIATE_LANDING_CODE_PARAM,
  AFFILIATE_LANDING_DISCOUNT_PARAM,
  AFFILIATE_LANDING_PATH_PARAM,
  AFFILIATE_LANDING_REFERRER_PARAM,
  RESERVED_SLUGS,
} from "@/lib/checkout/affiliate-constants";
import { getAffiliateAttributionByCode } from "@/lib/checkout/affiliate-service";

export const dynamic = "force-dynamic";

function notFoundResponse() {
  return new NextResponse("Not Found", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const normalizedSlug = slug.toLowerCase();

  if (RESERVED_SLUGS.has(normalizedSlug)) {
    return notFoundResponse();
  }

  const affiliate = await getAffiliateAttributionByCode(normalizedSlug);

  if (!affiliate || affiliate.status !== "approved") {
    return notFoundResponse();
  }

  const redirectUrl = new URL("/", request.url);
  request.nextUrl.searchParams.forEach((value, key) => {
    redirectUrl.searchParams.append(key, value);
  });
  redirectUrl.searchParams.set(AFFILIATE_LANDING_CODE_PARAM, affiliate.code);
  redirectUrl.searchParams.set(
    AFFILIATE_LANDING_PATH_PARAM,
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  const referrer = request.headers.get("referer")?.trim();
  if (referrer) {
    redirectUrl.searchParams.set(AFFILIATE_LANDING_REFERRER_PARAM, referrer);
  }

  if (affiliate.discountCode) {
    redirectUrl.searchParams.set(
      AFFILIATE_LANDING_DISCOUNT_PARAM,
      affiliate.discountCode,
    );
  }

  const response = NextResponse.redirect(redirectUrl, { status: 307 });
  const maxAge = AFFILIATE_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set(AFFILIATE_COOKIE_NAME, affiliate.code, {
    path: "/",
    maxAge,
    sameSite: "lax",
    secure,
  });

  if (affiliate.discountCode) {
    response.cookies.set(
      AFFILIATE_DISCOUNT_COOKIE_NAME,
      affiliate.discountCode,
      {
        path: "/",
        maxAge,
        sameSite: "lax",
        secure,
      },
    );
  } else {
    response.cookies.delete(AFFILIATE_DISCOUNT_COOKIE_NAME);
  }

  return response;
}
