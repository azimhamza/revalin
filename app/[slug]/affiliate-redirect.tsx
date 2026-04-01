"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  AFFILIATE_COOKIE_NAME,
  AFFILIATE_DISCOUNT_COOKIE_NAME,
  AFFILIATE_COOKIE_MAX_AGE_DAYS,
} from "@/lib/checkout/affiliate-constants";

export function AffiliateRedirect({
  code,
  discountCode,
}: {
  code: string;
  discountCode: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const maxAge = AFFILIATE_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;

    document.cookie = `${AFFILIATE_COOKIE_NAME}=${code}; path=/; max-age=${maxAge}; SameSite=Lax`;

    if (discountCode) {
      document.cookie = `${AFFILIATE_DISCOUNT_COOKIE_NAME}=${discountCode}; path=/; max-age=${maxAge}; SameSite=Lax`;
    }

    const recordVisit = async () => {
      try {
        await Promise.race([
          fetch("/api/affiliate/visit", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "same-origin",
            keepalive: true,
            body: JSON.stringify({
              code,
              discountCode,
              referralPath: `${window.location.pathname}${window.location.search}`,
              referrer: document.referrer || null,
            }),
          }),
          new Promise((resolve) => window.setTimeout(resolve, 800)),
        ]);
      } catch {}

      try {
        window.op?.track("affiliate_visit", {
          affiliate_code: code,
          discount_code: discountCode,
        });
        window.op?.setGlobalProperties({ affiliate_code: code });
      } catch {}

      if (!cancelled) {
        router.replace("/");
      }
    };

    recordVisit();

    return () => {
      cancelled = true;
    };
  }, [code, discountCode, router]);

  return null;
}
