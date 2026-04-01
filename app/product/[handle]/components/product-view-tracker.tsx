'use client';

import { useEffect } from 'react';

export function ProductViewTracker({
  handle,
  title,
  price,
  currencyCode,
}: {
  handle: string;
  title: string;
  price: string;
  currencyCode: string;
}) {
  useEffect(() => {
    try {
      const refMatch = document.cookie.match(/(?:^|;\s*)revalin_ref=([^;]+)/);
      window.op?.track('product_viewed', {
        productHandle: handle,
        productTitle: title,
        price,
        currencyCode,
        affiliate_code: refMatch?.[1] ? decodeURIComponent(refMatch[1]) : null,
      });
    } catch {}
  }, [handle, title, price, currencyCode]);

  return null;
}
