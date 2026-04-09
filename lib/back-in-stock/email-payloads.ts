import { buildProductNotificationName } from "./formatting.ts";

export function buildProductNotificationReadyEmailVariables(args: {
  productTitle: string;
  variantTitle?: string | null;
  discountPercent: number;
  discountCode: string;
  discountExpiresAt: string;
  productUrl: string;
  checkoutUrl: string;
}) {
  const productName = buildProductNotificationName({
    productTitle: args.productTitle,
    variantTitle: args.variantTitle,
  });

  return {
    product_name: productName,
    variant_name: args.variantTitle || "",
    discount_percent: args.discountPercent,
    discount_code: args.discountCode,
    discount_expires_at: args.discountExpiresAt,
    product_url: args.productUrl,
    checkout_url: args.checkoutUrl,
    productTitle: args.productTitle,
    variantTitle: args.variantTitle || "",
    discountPercent: args.discountPercent,
    discountCode: args.discountCode,
    discountExpiresAt: args.discountExpiresAt,
    productUrl: args.productUrl,
    checkoutUrl: args.checkoutUrl,
  };
}
