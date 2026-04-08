import type { InventoryState } from "@/lib/inventory";
import { getInventoryState } from "@/lib/inventory";
import type { Product, ProductVariant } from "@/lib/swell/types";
import {
  buildProductNotificationName,
  buildProductNotificationSelectionKey,
  buildProductNotificationTrend,
  buildProductNotificationVariantKey,
  normalizeVariantTitle,
  PRODUCT_NOTIFICATION_DISCOUNT_PERCENT,
  PRODUCT_NOTIFICATION_DISCOUNT_WINDOW_HOURS,
  PRODUCT_NOTIFICATION_PRODUCT_VARIANT_KEY,
} from "./formatting";

export {
  buildProductNotificationName,
  buildProductNotificationSelectionKey,
  buildProductNotificationTrend,
  buildProductNotificationVariantKey,
  normalizeVariantTitle,
  PRODUCT_NOTIFICATION_DISCOUNT_PERCENT,
  PRODUCT_NOTIFICATION_DISCOUNT_WINDOW_HOURS,
  PRODUCT_NOTIFICATION_PRODUCT_VARIANT_KEY,
};

export class ProductNotificationError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ProductNotificationError";
    this.code = code;
    this.status = status;
  }
}

export type ResolvedProductNotificationTarget = {
  productId: string;
  productHandle: string;
  productTitle: string;
  variant: ProductVariant | null;
  variantId: string | null;
  variantTitle: string | null;
  variantKey: string;
  productName: string;
  inventory: InventoryState;
};

export function normalizeProductNotificationEmail(email: string) {
  return email.trim().toLowerCase();
}

export function resolveProductNotificationTarget(
  product: Product,
  variantId?: string | null,
): ResolvedProductNotificationTarget {
  const requestedVariantId = variantId?.trim() || null;
  const normalizedVariants = product.variants.map((variant) => ({
    ...variant,
    title: normalizeVariantTitle(variant.title) || variant.title,
  }));
  const hasVariants = normalizedVariants.length > 0;
  const hasMultipleVariants = normalizedVariants.length > 1;

  if (!hasVariants) {
    return {
      productId: product.id,
      productHandle: product.handle,
      productTitle: product.title,
      variant: null,
      variantId: null,
      variantTitle: null,
      variantKey: PRODUCT_NOTIFICATION_PRODUCT_VARIANT_KEY,
      productName: buildProductNotificationName({
        productTitle: product.title,
      }),
      inventory: getInventoryState(product, null),
    };
  }

  let variant =
    (requestedVariantId
      ? normalizedVariants.find((candidate) => candidate.id === requestedVariantId)
      : null) || null;

  if (!variant && !requestedVariantId && normalizedVariants.length === 1) {
    variant = normalizedVariants[0] || null;
  }

  if (!variant && requestedVariantId) {
    throw new ProductNotificationError(
      "variant_not_found",
      "The selected dosage is no longer available.",
      404,
    );
  }

  if (!variant && hasMultipleVariants) {
    throw new ProductNotificationError(
      "variant_required",
      "Select a dosage before requesting a restock notification.",
      400,
    );
  }

  if (!variant) {
    throw new ProductNotificationError(
      "variant_unresolved",
      "Unable to resolve the selected product option.",
      400,
    );
  }

  const variantTitle = normalizeVariantTitle(variant.title);

  return {
    productId: product.id,
    productHandle: product.handle,
    productTitle: product.title,
    variant,
    variantId: variant.id,
    variantTitle,
    variantKey: buildProductNotificationVariantKey(variant.id),
    productName: buildProductNotificationName({
      productTitle: product.title,
      variantTitle,
    }),
    inventory: getInventoryState(product, variant),
  };
}
