import {
  and,
  desc,
  eq,
  gte,
  inArray,
  sql,
  type InferInsertModel,
  type InferSelectModel,
} from "drizzle-orm";
import { db } from "@/lib/db";
import {
  productNotificationDispatchProducts,
  productNotificationDispatches,
  productNotificationSubscriptions,
} from "@/lib/db/schema";
import type {
  ProductNotificationAdminAnalytics,
  ProductNotificationAdminStats,
} from "./types";
import { buildProductNotificationTrend } from "./utils";

export type ProductNotificationSubscriptionRecord = InferSelectModel<
  typeof productNotificationSubscriptions
>;
export type ProductNotificationDispatchRecord = InferSelectModel<
  typeof productNotificationDispatches
>;
export type ProductNotificationDispatchProductRecord = InferSelectModel<
  typeof productNotificationDispatchProducts
>;

type ProductNotificationSubscriptionInsert = InferInsertModel<
  typeof productNotificationSubscriptions
>;
type ProductNotificationDispatchInsert = InferInsertModel<
  typeof productNotificationDispatches
>;
type ProductNotificationDispatchProductInsert = InferInsertModel<
  typeof productNotificationDispatchProducts
>;

export type ProductNotificationTargetMetrics = {
  productHandle: string;
  variantKey: string;
  totalSignupCount: number;
  pendingSignupCount: number;
  lastDispatchAt: string | null;
};

export async function findPendingProductNotificationSubscription(args: {
  normalizedEmail: string;
  productHandle: string;
  variantKey: string;
}) {
  const rows = await db
    .select()
    .from(productNotificationSubscriptions)
    .where(
      and(
        eq(
          productNotificationSubscriptions.normalizedEmail,
          args.normalizedEmail,
        ),
        eq(productNotificationSubscriptions.productHandle, args.productHandle),
        eq(productNotificationSubscriptions.variantKey, args.variantKey),
        eq(productNotificationSubscriptions.status, "pending"),
      ),
    )
    .limit(1);

  return rows[0] || null;
}

export async function createProductNotificationSubscription(
  values: ProductNotificationSubscriptionInsert,
) {
  const rows = await db
    .insert(productNotificationSubscriptions)
    .values(values)
    .returning();

  return rows[0] || null;
}

export async function updateProductNotificationSubscription(
  id: string,
  values: Partial<ProductNotificationSubscriptionInsert>,
) {
  const rows = await db
    .update(productNotificationSubscriptions)
    .set({
      ...values,
      updatedAt: new Date(),
    })
    .where(eq(productNotificationSubscriptions.id, id))
    .returning();

  return rows[0] || null;
}

export async function listPendingProductNotificationSubscriptionsForTarget(args: {
  productHandle: string;
  variantKey: string;
}) {
  return db
    .select()
    .from(productNotificationSubscriptions)
    .where(
      and(
        eq(productNotificationSubscriptions.productHandle, args.productHandle),
        eq(productNotificationSubscriptions.variantKey, args.variantKey),
        eq(productNotificationSubscriptions.status, "pending"),
      ),
    )
    .orderBy(productNotificationSubscriptions.createdAt);
}

export async function createProductNotificationDispatch(
  values: ProductNotificationDispatchInsert,
) {
  const rows = await db
    .insert(productNotificationDispatches)
    .values(values)
    .returning();

  return rows[0] || null;
}

export async function updateProductNotificationDispatch(
  id: string,
  values: Partial<ProductNotificationDispatchInsert>,
) {
  const rows = await db
    .update(productNotificationDispatches)
    .set({
      ...values,
      updatedAt: new Date(),
    })
    .where(eq(productNotificationDispatches.id, id))
    .returning();

  return rows[0] || null;
}

export async function createProductNotificationDispatchProducts(
  values: ProductNotificationDispatchProductInsert[],
) {
  if (values.length === 0) {
    return [] as ProductNotificationDispatchProductRecord[];
  }

  return db
    .insert(productNotificationDispatchProducts)
    .values(values)
    .returning();
}

export async function updateProductNotificationDispatchProduct(
  id: string,
  values: Partial<ProductNotificationDispatchProductInsert>,
) {
  const rows = await db
    .update(productNotificationDispatchProducts)
    .set({
      ...values,
      updatedAt: new Date(),
    })
    .where(eq(productNotificationDispatchProducts.id, id))
    .returning();

  return rows[0] || null;
}

export async function getProductNotificationTargetMetricsByHandles(
  productHandles: string[],
) {
  if (productHandles.length === 0) {
    return [] as ProductNotificationTargetMetrics[];
  }

  const rows = await db
    .select({
      productHandle: productNotificationSubscriptions.productHandle,
      variantKey: productNotificationSubscriptions.variantKey,
      totalSignupCount: sql<number>`count(*)`,
      pendingSignupCount: sql<number>`sum(case when ${productNotificationSubscriptions.status} = 'pending' then 1 else 0 end)`,
      lastDispatchAt:
        sql<string | null>`max(${productNotificationSubscriptions.lastAttemptedAt})`,
    })
    .from(productNotificationSubscriptions)
    .where(
      inArray(productNotificationSubscriptions.productHandle, productHandles),
    )
    .groupBy(
      productNotificationSubscriptions.productHandle,
      productNotificationSubscriptions.variantKey,
    );

  return rows.map((row) => ({
    productHandle: row.productHandle,
    variantKey: row.variantKey,
    totalSignupCount: Number(row.totalSignupCount ?? 0),
    pendingSignupCount: Number(row.pendingSignupCount ?? 0),
    lastDispatchAt: row.lastDispatchAt,
  }));
}

export async function getProductNotificationAdminStats(): Promise<ProductNotificationAdminStats> {
  const [rows] = await db
    .select({
      pendingSignups:
        sql<number>`sum(case when ${productNotificationSubscriptions.status} = 'pending' then 1 else 0 end)`,
      notifiedSignups:
        sql<number>`sum(case when ${productNotificationSubscriptions.status} = 'notified' then 1 else 0 end)`,
      uniqueEmails:
        sql<number>`count(distinct ${productNotificationSubscriptions.normalizedEmail})`,
      productsWithPendingDemand:
        sql<number>`count(distinct case when ${productNotificationSubscriptions.status} = 'pending' then ${productNotificationSubscriptions.productHandle} end)`,
      variantsWithPendingDemand:
        sql<number>`count(distinct case when ${productNotificationSubscriptions.status} = 'pending' then ${productNotificationSubscriptions.productHandle} || '::' || ${productNotificationSubscriptions.variantKey} end)`,
    })
    .from(productNotificationSubscriptions);

  return {
    pendingSignups: Number(rows?.pendingSignups ?? 0),
    notifiedSignups: Number(rows?.notifiedSignups ?? 0),
    uniqueEmails: Number(rows?.uniqueEmails ?? 0),
    productsWithPendingDemand: Number(rows?.productsWithPendingDemand ?? 0),
    variantsWithPendingDemand: Number(rows?.variantsWithPendingDemand ?? 0),
  };
}

export async function getProductNotificationAdminAnalytics(): Promise<ProductNotificationAdminAnalytics> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setUTCHours(0, 0, 0, 0);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 29);

  const [topProducts, topVariants, trendRows] = await Promise.all([
    db
      .select({
        name: productNotificationSubscriptions.productTitle,
        value: sql<number>`count(*)`,
      })
      .from(productNotificationSubscriptions)
      .groupBy(
        productNotificationSubscriptions.productHandle,
        productNotificationSubscriptions.productTitle,
      )
      .orderBy(desc(sql`count(*)`), productNotificationSubscriptions.productTitle)
      .limit(8),
    db
      .select({
        productTitle: productNotificationSubscriptions.productTitle,
        variantTitle: productNotificationSubscriptions.variantTitle,
        value: sql<number>`count(*)`,
      })
      .from(productNotificationSubscriptions)
      .groupBy(
        productNotificationSubscriptions.productHandle,
        productNotificationSubscriptions.productTitle,
        productNotificationSubscriptions.variantKey,
        productNotificationSubscriptions.variantTitle,
      )
      .orderBy(desc(sql`count(*)`), productNotificationSubscriptions.productTitle)
      .limit(8),
    db
      .select({
        date:
          sql<string>`to_char(date_trunc('day', ${productNotificationSubscriptions.createdAt}), 'YYYY-MM-DD')`,
        signupCount: sql<number>`count(*)`,
      })
      .from(productNotificationSubscriptions)
      .where(gte(productNotificationSubscriptions.createdAt, thirtyDaysAgo))
      .groupBy(sql`date_trunc('day', ${productNotificationSubscriptions.createdAt})`)
      .orderBy(sql`date_trunc('day', ${productNotificationSubscriptions.createdAt})`),
  ]);

  return {
    topProducts: topProducts.map((row) => ({
      name: row.name,
      value: Number(row.value ?? 0),
    })),
    topVariants: topVariants.map((row) => ({
      name: row.variantTitle
        ? `${row.productTitle} - ${row.variantTitle}`
        : row.productTitle,
      value: Number(row.value ?? 0),
    })),
    signupTrend: buildProductNotificationTrend(
      trendRows.map((row) => ({
        date: row.date,
        signupCount: Number(row.signupCount ?? 0),
      })),
    ),
  };
}
