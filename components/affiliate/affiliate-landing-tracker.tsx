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

    const processingKey = JSON.stringify({
      code,
      discountCode,
      pathname,
      referralPath,
      referrer,
      search: searchParams.toString(),
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
      }),
    }).catch(() => {});

    try {
      window.op?.track("affiliate_visit", {
        affiliate_code: code,
        discount_code: discountCode,
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
