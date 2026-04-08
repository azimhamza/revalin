import type { ProductNotificationTrendDatum } from "./types";

export const PRODUCT_NOTIFICATION_DISCOUNT_PERCENT = 20;
export const PRODUCT_NOTIFICATION_DISCOUNT_WINDOW_HOURS = 48;
export const PRODUCT_NOTIFICATION_PRODUCT_VARIANT_KEY = "__product__";

export function normalizeVariantTitle(value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (/^default(?: title)?$/i.test(normalized)) return null;
  return normalized;
}

export function buildProductNotificationVariantKey(variantId?: string | null) {
  return variantId?.trim() || PRODUCT_NOTIFICATION_PRODUCT_VARIANT_KEY;
}

export function buildProductNotificationName(args: {
  productTitle: string;
  variantTitle?: string | null;
}) {
  const variantTitle = normalizeVariantTitle(args.variantTitle);
  return variantTitle
    ? `${args.productTitle} - ${variantTitle}`
    : args.productTitle;
}

export function buildProductNotificationSelectionKey(args: {
  productHandle: string;
  variantKey: string;
}) {
  return `${args.productHandle}::${args.variantKey}`;
}

export function buildProductNotificationTrend(
  rows: Array<{ date: string; signupCount: number }>,
  days = 30,
): ProductNotificationTrendDatum[] {
  const countByDate = new Map(
    rows.map((row) => [row.date, Number(row.signupCount || 0)]),
  );
  const result: ProductNotificationTrendDatum[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - offset);
    const isoDate = date.toISOString().slice(0, 10);
    result.push({
      date: isoDate,
      signupCount: countByDate.get(isoDate) ?? 0,
    });
  }

  return result;
}
