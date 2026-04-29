"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  AFFILIATE_LANDING_CODE_PARAM,
  AFFILIATE_LANDING_DISCOUNT_PARAM,
  AFFILIATE_LANDING_PATH_PARAM,
  AFFILIATE_LANDING_REFERRER_PARAM,
} from "@/lib/checkout/affiliate-constants";

function buildCleanUrl(pathname: string, searchParams: URLSearchParams) {
  const nextParams = new URLSearchParams(searchParams.toString());
  nextParams.delete(AFFILIATE_LANDING_CODE_PARAM);
  nextParams.delete(AFFILIATE_LANDING_DISCOUNT_PARAM);
  nextParams.delete(AFFILIATE_LANDING_PATH_PARAM);
  nextParams.delete(AFFILIATE_LANDING_REFERRER_PARAM);
  const nextQuery = nextParams.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

function getNullableSearchParam(
  searchParams: URLSearchParams,
  key: string,
) {
  return searchParams.get(key)?.trim() || null;
}

function getTrafficSource(searchParams: URLSearchParams) {
  const explicitSource =
    getNullableSearchParam(searchParams, "utm_source") ||
    getNullableSearchParam(searchParams, "source") ||
    getNullableSearchParam(searchParams, "ref") ||
    getNullableSearchParam(searchParams, "referrer_source");

  if (explicitSource) return explicitSource;
  if (getNullableSearchParam(searchParams, "ttclid")) return "tiktok";

  return null;
}

export function AffiliateLandingTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastProcessedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const code = searchParams.get(AFFILIATE_LANDING_CODE_PARAM)?.trim();
    if (!code) {
      lastProcessedKeyRef.current = null;
      return;
    }

    const discountCode =
      searchParams.get(AFFILIATE_LANDING_DISCOUNT_PARAM)?.trim() || null;
    const referralPath =
      searchParams.get(AFFILIATE_LANDING_PATH_PARAM)?.trim() || null;
    const referrer =
      searchParams.get(AFFILIATE_LANDING_REFERRER_PARAM)?.trim() ||
      document.referrer ||
      null;
    const utmSource = getNullableSearchParam(searchParams, "utm_source");
    const utmMedium = getNullableSearchParam(searchParams, "utm_medium");
    const utmCampaign = getNullableSearchParam(searchParams, "utm_campaign");
    const trafficSource = getTrafficSource(searchParams);

    const processingKey = JSON.stringify({
      code,
      discountCode,
      pathname,
      referralPath,
      referrer,
      search: searchParams.toString(),
      trafficSource,
      utmCampaign,
      utmMedium,
      utmSource,
    });

    if (lastProcessedKeyRef.current === processingKey) {
      return;
    }

    lastProcessedKeyRef.current = processingKey;

    fetch("/api/affiliate/visits", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      keepalive: true,
      body: JSON.stringify({
        code,
        discountCode,
        referralPath,
        referrer,
        trafficSource,
        utmCampaign,
        utmMedium,
        utmSource,
      }),
    }).catch(() => {});

    try {
      window.op?.track("affiliate_visit", {
        affiliate_code: code,
        discount_code: discountCode,
        referrer,
        referral_path: referralPath,
        source: trafficSource,
        utm_campaign: utmCampaign,
        utm_medium: utmMedium,
        utm_source: utmSource,
      });
      window.op?.setGlobalProperties({ affiliate_code: code });
    } catch {}

    const cleanUrl = buildCleanUrl(
      pathname,
      new URLSearchParams(searchParams.toString()),
    );
    window.history.replaceState(window.history.state, "", cleanUrl);
  }, [pathname, searchParams]);

  return null;
}
