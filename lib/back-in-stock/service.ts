import crypto from "crypto";
import { getProducts, getLiveProduct } from "@/lib/swell";
import { createSwellCoupon } from "@/lib/checkout/swell-order-management";
import { hasLoopsConfig, sendTransactionalEmail } from "@/lib/email/loops";
import type { Product } from "@/lib/swell/types";
import type {
  ProductNotificationAdminData,
  ProductNotificationAdminProduct,
  ProductNotificationSelection,
  ProductNotificationSendResult,
} from "./types";
import {
  buildProductNotificationSelectionKey,
  buildProductNotificationVariantKey,
  normalizeProductNotificationEmail,
  ProductNotificationError,
  PRODUCT_NOTIFICATION_DISCOUNT_PERCENT,
  PRODUCT_NOTIFICATION_DISCOUNT_WINDOW_HOURS,
  resolveProductNotificationTarget,
} from "./utils";
import {
  createProductNotificationDispatch,
  createProductNotificationDispatchProducts,
  createProductNotificationSubscription,
  findPendingProductNotificationSubscription,
  getProductNotificationAdminAnalytics,
  getProductNotificationAdminStats,
  getProductNotificationTargetMetricsByHandles,
  listPendingProductNotificationSubscriptionsForTarget,
  updateProductNotificationDispatch,
  updateProductNotificationDispatchProduct,
  updateProductNotificationSubscription,
  type ProductNotificationSubscriptionRecord,
} from "./store";

function getSiteUrl() {
  const explicit =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/\/$/, "")}`;
  }

  return "http://localhost:3000";
}

function createProductNotificationCouponCode() {
  return `READY20-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

function getErrorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof Error ? error.message : fallback;
}

function getCustomerSignupTransactionalId() {
  return process.env.LOOPS_TRANSACTIONAL_PRODUCT_NOTIFICATION_SIGNUP?.trim();
}

function getCustomerReadyTransactionalId() {
  return process.env.LOOPS_TRANSACTIONAL_BACK_IN_STOCK?.trim();
}

function assertCustomerSignupEmailConfig() {
  if (!hasLoopsConfig()) {
    throw new ProductNotificationError(
      "loops_not_configured",
      "Loops is not configured for customer signup emails.",
      500,
    );
  }

  if (!getCustomerSignupTransactionalId()) {
    throw new ProductNotificationError(
      "missing_signup_template",
      "LOOPS_TRANSACTIONAL_PRODUCT_NOTIFICATION_SIGNUP is not configured.",
      500,
    );
  }
}

function assertCustomerReadyEmailConfig() {
  if (!hasLoopsConfig()) {
    throw new ProductNotificationError(
      "loops_not_configured",
      "Loops is not configured for customer restock emails.",
      500,
    );
  }

  if (!getCustomerReadyTransactionalId()) {
    throw new ProductNotificationError(
      "missing_customer_template",
      "LOOPS_TRANSACTIONAL_BACK_IN_STOCK is not configured.",
      500,
    );
  }
}

async function sendCustomerSignupEmail(args: {
  email: string;
  productHandle: string;
  productName: string;
}) {
  assertCustomerSignupEmailConfig();

  const transactionalId = getCustomerSignupTransactionalId();
  if (!transactionalId) {
    throw new Error("Missing customer signup template.");
  }

  const siteUrl = getSiteUrl();
  const productUrl = `${siteUrl}/product/${args.productHandle}`;

  await sendTransactionalEmail({
    email: args.email,
    transactionalId,
    dataVariables: {
      product_name: args.productName,
      product_url: productUrl,
    },
  });
}

async function sendCustomerReadyEmail(args: {
  subscription: ProductNotificationSubscriptionRecord;
  discountCode: string;
  discountExpiresAt: string;
}) {
  assertCustomerReadyEmailConfig();

  const transactionalId = getCustomerReadyTransactionalId();
  if (!transactionalId) {
    throw new Error("Missing customer restock template.");
  }

  const siteUrl = getSiteUrl();
  const productUrl = `${siteUrl}/product/${args.subscription.productHandle}`;
  const checkoutUrl = `${siteUrl}/checkout?discount=${encodeURIComponent(args.discountCode)}`;

  await sendTransactionalEmail({
    email: args.subscription.email,
    transactionalId,
    dataVariables: {
      productTitle: args.subscription.productTitle,
      variantTitle: args.subscription.variantTitle || "",
      discountPercent: PRODUCT_NOTIFICATION_DISCOUNT_PERCENT,
      discountCode: args.discountCode,
      discountExpiresAt: args.discountExpiresAt,
      productUrl,
      checkoutUrl,
    },
  });
}

export async function subscribeToBackInStock(args: {
  email: string;
  product: Product;
  variantId?: string | null;
}) {
  const normalizedEmail = normalizeProductNotificationEmail(args.email);
  const target = resolveProductNotificationTarget(args.product, args.variantId);

  if (!target.inventory.isBackorder) {
    throw new ProductNotificationError(
      "already_in_stock",
      "This product is already ready to order.",
      409,
    );
  }

  const existing = await findPendingProductNotificationSubscription({
    normalizedEmail,
    productHandle: target.productHandle,
    variantKey: target.variantKey,
  });

  if (existing) {
    return {
      created: false,
      subscription: existing,
    };
  }

  let subscription: ProductNotificationSubscriptionRecord | null = null;

  try {
    subscription = await createProductNotificationSubscription({
      email: args.email.trim(),
      normalizedEmail,
      productId: target.productId,
      productHandle: target.productHandle,
      productTitle: target.productTitle,
      variantId: target.variantId,
      variantTitle: target.variantTitle,
      variantKey: target.variantKey,
      status: "pending",
      lastError: null,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const duplicate = await findPendingProductNotificationSubscription({
        normalizedEmail,
        productHandle: target.productHandle,
        variantKey: target.variantKey,
      });

      if (duplicate) {
        return {
          created: false,
          subscription: duplicate,
        };
      }
    }

    throw error;
  }

  if (!subscription) {
    throw new Error("Failed to create the product notification subscription.");
  }

  try {
    await sendCustomerSignupEmail({
      email: subscription.email,
      productHandle: target.productHandle,
      productName: target.productName,
    });
    subscription =
      (await updateProductNotificationSubscription(subscription.id, {
        signupEmailSentAt: new Date(),
        signupEmailError: null,
      })) || subscription;
  } catch (error) {
    subscription =
      (await updateProductNotificationSubscription(subscription.id, {
        signupEmailError: getErrorMessage(
          error,
          "Unable to send the signup confirmation email.",
        ),
      })) || subscription;
  }

  return {
    created: true,
    subscription,
  };
}

type PreparedNotificationTarget = ReturnType<
  typeof resolveProductNotificationTarget
> & {
  pendingSubscriptions: ProductNotificationSubscriptionRecord[];
};

export async function sendProductNotificationsBatch(args: {
  createdByUserId: string;
  selections: ProductNotificationSelection[];
}): Promise<ProductNotificationSendResult> {
  const normalizedSelections = Array.from(
    new Map(
      args.selections
        .map((selection) => ({
          productHandle: selection.productHandle.trim(),
          variantId: selection.variantId?.trim() || null,
        }))
        .filter((selection) => selection.productHandle.length > 0)
        .map((selection) => [
          buildProductNotificationSelectionKey({
            productHandle: selection.productHandle,
            variantKey: buildProductNotificationVariantKey(selection.variantId),
          }),
          selection,
        ]),
    ).values(),
  );

  if (normalizedSelections.length === 0) {
    throw new ProductNotificationError(
      "empty_selection",
      "Select at least one variant to send.",
      400,
    );
  }

  assertCustomerReadyEmailConfig();

  const productCache = new Map<string, Product | null>();
  await Promise.all(
    Array.from(
      new Set(normalizedSelections.map((selection) => selection.productHandle)),
    ).map(async (productHandle) => {
      productCache.set(productHandle, await getLiveProduct(productHandle));
    }),
  );

  const preparedTargets: PreparedNotificationTarget[] = [];
  let skippedTargetCount = 0;

  for (const selection of normalizedSelections) {
    const product = productCache.get(selection.productHandle);
    if (!product) {
      skippedTargetCount += 1;
      continue;
    }

    try {
      const target = resolveProductNotificationTarget(product, selection.variantId);
      const pendingSubscriptions =
        await listPendingProductNotificationSubscriptionsForTarget({
          productHandle: target.productHandle,
          variantKey: target.variantKey,
        });

      preparedTargets.push({
        ...target,
        pendingSubscriptions,
      });
    } catch {
      skippedTargetCount += 1;
    }
  }

  const eligibleTargets = preparedTargets.filter(
    (target) =>
      !target.inventory.isBackorder && target.pendingSubscriptions.length > 0,
  );
  skippedTargetCount += preparedTargets.length - eligibleTargets.length;

  if (eligibleTargets.length === 0) {
    throw new ProductNotificationError(
      "nothing_to_send",
      "No selected variants are back in stock with pending subscribers.",
      400,
    );
  }

  const discountCode = createProductNotificationCouponCode();
  const discountExpiresAt = new Date(
    Date.now() +
      PRODUCT_NOTIFICATION_DISCOUNT_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const swellCoupon = await createSwellCoupon({
    code: discountCode,
    name: `Restock batch ${new Date().toISOString().slice(0, 10)}`,
    percentOff: PRODUCT_NOTIFICATION_DISCOUNT_PERCENT,
    expiresAt: discountExpiresAt,
    description: `Auto-issued restock notification coupon for ${eligibleTargets.length} target(s).`,
  });

  const dispatch = await createProductNotificationDispatch({
    swellCouponId: swellCoupon.id,
    discountCode,
    discountExpiresAt: new Date(discountExpiresAt),
    createdByUserId: args.createdByUserId,
    selectedTargetCount: normalizedSelections.length,
    eligibleTargetCount: eligibleTargets.length,
    skippedTargetCount,
    subscriptionCount: eligibleTargets.reduce(
      (sum, target) => sum + target.pendingSubscriptions.length,
      0,
    ),
    status: "pending",
  });

  if (!dispatch) {
    throw new Error("Failed to create the notification dispatch record.");
  }

  const dispatchProducts = await createProductNotificationDispatchProducts(
    eligibleTargets.map((target) => ({
      dispatchId: dispatch.id,
      productId: target.productId,
      productHandle: target.productHandle,
      productTitle: target.productTitle,
      variantId: target.variantId,
      variantTitle: target.variantTitle,
      variantKey: target.variantKey,
      subscriberCount: target.pendingSubscriptions.length,
      notifiedCount: 0,
      failedCount: 0,
    })),
  );

  const dispatchProductByKey = new Map(
    dispatchProducts.map((dispatchProduct) => [
      buildProductNotificationSelectionKey({
        productHandle: dispatchProduct.productHandle,
        variantKey: dispatchProduct.variantKey,
      }),
      dispatchProduct,
    ]),
  );

  let notifiedCount = 0;
  let failedCount = 0;

  for (const target of eligibleTargets) {
    const dispatchProduct = dispatchProductByKey.get(
      buildProductNotificationSelectionKey({
        productHandle: target.productHandle,
        variantKey: target.variantKey,
      }),
    );

    if (!dispatchProduct) {
      continue;
    }

    let targetNotifiedCount = 0;
    let targetFailedCount = 0;

    for (const subscription of target.pendingSubscriptions) {
      try {
        await sendCustomerReadyEmail({
          subscription,
          discountCode,
          discountExpiresAt,
        });

        targetNotifiedCount += 1;
        notifiedCount += 1;
        await updateProductNotificationSubscription(subscription.id, {
          status: "notified",
          lastDispatchId: dispatch.id,
          lastAttemptedAt: new Date(),
          notifiedAt: new Date(),
          lastError: null,
        });
      } catch (error) {
        targetFailedCount += 1;
        failedCount += 1;
        await updateProductNotificationSubscription(subscription.id, {
          lastDispatchId: dispatch.id,
          lastAttemptedAt: new Date(),
          lastError: getErrorMessage(
            error,
            "Unable to send the restock email.",
          ),
        });
      }
    }

    await updateProductNotificationDispatchProduct(dispatchProduct.id, {
      notifiedCount: targetNotifiedCount,
      failedCount: targetFailedCount,
    });
  }

  const status =
    failedCount === 0
      ? "completed"
      : notifiedCount > 0
        ? "partial_failure"
        : "failed";

  await updateProductNotificationDispatch(dispatch.id, {
    notifiedCount,
    failedCount,
    status,
    completedAt: new Date(),
  });

  return {
    dispatchId: dispatch.id,
    discountCode,
    discountExpiresAt,
    selectedTargetCount: normalizedSelections.length,
    eligibleTargetCount: eligibleTargets.length,
    skippedTargetCount,
    subscriptionCount: dispatch.subscriptionCount,
    notifiedCount,
    failedCount,
    status,
  };
}

function buildAdminTargetsForProduct(
  product: Product,
  metrics: Map<
    string,
    {
      totalSignupCount: number;
      pendingSignupCount: number;
      lastDispatchAt: string | null;
    }
  >,
) {
  const targets =
    product.variants.length > 0
      ? product.variants.map((variant) =>
          resolveProductNotificationTarget(product, variant.id),
        )
      : [resolveProductNotificationTarget(product)];

  return targets.map((target) => {
    const selectionKey = buildProductNotificationSelectionKey({
      productHandle: target.productHandle,
      variantKey: target.variantKey,
    });
    const targetMetrics = metrics.get(selectionKey);

    return {
      productId: target.productId,
      productHandle: target.productHandle,
      productTitle: target.productTitle,
      variantId: target.variantId,
      variantTitle: target.variantTitle,
      variantKey: target.variantKey,
      displayName: target.variantTitle || "Base product",
      totalSignupCount: targetMetrics?.totalSignupCount ?? 0,
      pendingSignupCount: targetMetrics?.pendingSignupCount ?? 0,
      lastDispatchAt: targetMetrics?.lastDispatchAt ?? null,
      isBackorder: target.inventory.isBackorder,
      isLowStock: target.inventory.isLowStock,
      stockLabel: target.inventory.label,
      stockMessage: target.inventory.message,
      isReadyToSend:
        !target.inventory.isBackorder &&
        (targetMetrics?.pendingSignupCount ?? 0) > 0,
    };
  });
}

function getMostRecentTimestamp(values: Array<string | null>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.localeCompare(left))[0] || null;
}

export async function getProductNotificationAdminData(args: {
  query?: string;
} = {}): Promise<ProductNotificationAdminData> {
  const query = args.query?.trim();
  const products = await getProducts({
    limit: query ? 60 : 24,
    sortKey: "UPDATED_AT",
    reverse: true,
    query: query || undefined,
  });

  const metrics = await getProductNotificationTargetMetricsByHandles(
    products.map((product) => product.handle),
  );
  const metricsBySelection = new Map(
    metrics.map((metric) => [
      buildProductNotificationSelectionKey({
        productHandle: metric.productHandle,
        variantKey: metric.variantKey,
      }),
      metric,
    ]),
  );

  const adminProducts: ProductNotificationAdminProduct[] = products.map(
    (product) => {
      const targets = buildAdminTargetsForProduct(product, metricsBySelection);

      return {
        productId: product.id,
        productHandle: product.handle,
        productTitle: product.title,
        totalSignupCount: targets.reduce(
          (sum, target) => sum + target.totalSignupCount,
          0,
        ),
        pendingSignupCount: targets.reduce(
          (sum, target) => sum + target.pendingSignupCount,
          0,
        ),
        readyTargetCount: targets.filter((target) => target.isReadyToSend).length,
        totalTargetCount: targets.length,
        lastDispatchAt: getMostRecentTimestamp(
          targets.map((target) => target.lastDispatchAt),
        ),
        targets,
      };
    },
  );

  const [stats, analytics] = await Promise.all([
    getProductNotificationAdminStats(),
    getProductNotificationAdminAnalytics(),
  ]);

  return {
    products: adminProducts,
    stats,
    analytics,
  };
}
