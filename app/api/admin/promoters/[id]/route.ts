import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { createApiRoute } from "@/lib/api/route";
import {
  getPromoterOpenPanelTelemetry,
  hasOpenPanelCredentials,
} from "@/lib/analytics/openpanel";
import { db } from "@/lib/db";
import { affiliates, checkoutOrders, promoterInvites, promoterPayouts } from "@/lib/db/schema";
import {
  deletePromoterRecord,
  getPromoterById,
  listPromoterInvites,
} from "@/lib/checkout/promoter-service";

const paramsSchema = z.object({
  id: z.string().trim().min(1),
});

const querySchema = z.object({
  range: z.enum(["24h", "7d", "30d", "all"]).default("30d"),
});

function getRangeStart(range: z.infer<typeof querySchema>["range"]) {
  if (range === "24h") return new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (range === "7d") return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  if (range === "30d") return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return null;
}

function getRangeLabel(range: z.infer<typeof querySchema>["range"]) {
  if (range === "24h") return "Last 1 day";
  if (range === "7d") return "Last 1 week";
  if (range === "30d") return "Last 1 month";
  return "All time";
}

function getPromoterPerformanceScope(promoterId: string, startDate: Date | null) {
  const promoterScope = eq(promoterPayouts.promoterId, promoterId);
  if (!startDate) return promoterScope;

  return and(
    promoterScope,
    sql`coalesce(${promoterPayouts.earnedAt}, ${promoterPayouts.createdAt}) >= ${startDate}`,
  );
}

function getCurrentCommissionPeriodKeys() {
  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7);

  return {
    monthKey,
    yearKey: monthKey.slice(0, 4),
  };
}

async function getPromoterAdminPerformance(args: {
  promoterId: string;
  range: z.infer<typeof querySchema>["range"];
}) {
  const startDate = getRangeStart(args.range);
  const payoutScope = getPromoterPerformanceScope(args.promoterId, startDate);
  const { monthKey, yearKey } = getCurrentCommissionPeriodKeys();

  const [summaryRows, periodRows, salesRows, partnerRows, inviteRows] =
    await Promise.all([
    db
      .select({
        orderCount: sql<number>`count(*)`,
        revenue: sql<string>`coalesce(sum(coalesce(nullif(${promoterPayouts.normalizedOrderTotal}, '')::numeric, nullif(${promoterPayouts.orderTotal}, '')::numeric, 0)), 0)`,
        commission: sql<string>`coalesce(sum(coalesce(nullif(${promoterPayouts.normalizedCommissionAmount}, '')::numeric, nullif(${promoterPayouts.commissionAmount}, '')::numeric, 0)), 0)`,
      })
      .from(promoterPayouts)
      .where(payoutScope),
    db
      .select({
        currentMonthCommission: sql<string>`coalesce(sum(coalesce(nullif(${promoterPayouts.normalizedCommissionAmount}, '')::numeric, nullif(${promoterPayouts.commissionAmount}, '')::numeric, 0)) filter (where coalesce(${promoterPayouts.commissionMonthKey}, to_char(coalesce(${promoterPayouts.earnedAt}, ${promoterPayouts.createdAt}), 'YYYY-MM')) = ${monthKey}), 0)`,
        currentYearCommission: sql<string>`coalesce(sum(coalesce(nullif(${promoterPayouts.normalizedCommissionAmount}, '')::numeric, nullif(${promoterPayouts.commissionAmount}, '')::numeric, 0)) filter (where left(coalesce(${promoterPayouts.commissionMonthKey}, to_char(coalesce(${promoterPayouts.earnedAt}, ${promoterPayouts.createdAt}), 'YYYY-MM')), 4) = ${yearKey}), 0)`,
      })
      .from(promoterPayouts)
      .where(eq(promoterPayouts.promoterId, args.promoterId)),
    db
      .select({
        payoutId: promoterPayouts.id,
        orderId: promoterPayouts.orderId,
        affiliateId: promoterPayouts.affiliateId,
        affiliateCode: promoterPayouts.affiliateCode,
        affiliateName: affiliates.name,
        orderTotal: promoterPayouts.orderTotal,
        normalizedOrderTotal: promoterPayouts.normalizedOrderTotal,
        commissionAmount: promoterPayouts.commissionAmount,
        normalizedCommissionAmount: promoterPayouts.normalizedCommissionAmount,
        commissionRate: promoterPayouts.commissionRate,
        status: promoterPayouts.status,
        currencyCode: promoterPayouts.currencyCode,
        earnedAt: promoterPayouts.earnedAt,
        createdAt: promoterPayouts.createdAt,
        paymentStatus: checkoutOrders.paymentStatus,
        customerEmail: checkoutOrders.email,
        fulfillmentStatus: checkoutOrders.fulfillmentStatus,
      })
      .from(promoterPayouts)
      .innerJoin(
        checkoutOrders,
        eq(promoterPayouts.orderId, checkoutOrders.orderId),
      )
      .innerJoin(affiliates, eq(promoterPayouts.affiliateId, affiliates.id))
      .where(payoutScope)
      .orderBy(desc(promoterPayouts.createdAt)),
    db
      .select({
        affiliateCode: affiliates.code,
        affiliateName: affiliates.name,
      })
      .from(promoterInvites)
      .innerJoin(affiliates, eq(promoterInvites.invitedAffiliateId, affiliates.id))
      .where(
        and(
          eq(promoterInvites.promoterId, args.promoterId),
          eq(promoterInvites.status, "successful"),
          eq(affiliates.status, "approved"),
        ),
      ),
    listPromoterInvites({ promoterId: args.promoterId, limit: 100 }),
  ]);

  const affiliateCodes = partnerRows.map((row) => row.affiliateCode);
  const telemetry =
    hasOpenPanelCredentials() && affiliateCodes.length > 0
      ? await getPromoterOpenPanelTelemetry(affiliateCodes, args.range).catch(
          () => null,
        )
      : null;

  const sales = salesRows.map((row) => ({
    ...row,
    saleDate: row.earnedAt ?? row.createdAt,
    revenue: row.normalizedOrderTotal ?? row.orderTotal,
    commission: row.normalizedCommissionAmount ?? row.commissionAmount,
  }));
  const trackedVisits = telemetry?.trend.reduce((sum, point) => sum + point.visits, 0) ?? 0;
  const trackedPurchases =
    telemetry?.trend.reduce((sum, point) => sum + point.purchases, 0) ?? 0;
  const trackedRevenue =
    telemetry?.trend.reduce((sum, point) => sum + point.revenue, 0) ?? 0;

  return {
    range: args.range,
    rangeLabel: getRangeLabel(args.range),
    openPanelConfigured: hasOpenPanelCredentials(),
    salesSummary: {
      orderCount: Number(summaryRows[0]?.orderCount ?? 0),
      revenue: Number(summaryRows[0]?.revenue ?? 0),
      commission: Number(summaryRows[0]?.commission ?? 0),
      currentMonthCommission: Number(
        periodRows[0]?.currentMonthCommission ?? 0,
      ),
      currentYearCommission: Number(
        periodRows[0]?.currentYearCommission ?? 0,
      ),
      currentMonthKey: monthKey,
      currentYearKey: yearKey,
      activePartners: affiliateCodes.length,
      invites: inviteRows.length,
      trackedVisits,
      trackedPurchases,
      trackedRevenue,
      trackedEvents: telemetry?.events.length ?? 0,
    },
    sales,
    partnerNames: Object.fromEntries(
      partnerRows.map((row) => [row.affiliateCode, row.affiliateName]),
    ),
    invites: inviteRows,
    telemetry,
  };
}

export const dynamic = "force-dynamic";

export const GET = createApiRoute({
  route: "/api/admin/promoters/:id",
  access: "admin",
  paramsSchema,
  querySchema,
  cacheControl: "no-store",
  handler: async ({ params, query }) => {
    const promoter = await getPromoterById(params.id);
    if (!promoter) {
      throw apiError.notFound("Promoter not found.");
    }

    const performance = await getPromoterAdminPerformance({
      promoterId: params.id,
      range: query.range,
    });

    return {
      data: {
        promoter,
        performance,
      },
    };
  },
});

export const DELETE = createApiRoute({
  route: "/api/admin/promoters/:id",
  access: "admin",
  paramsSchema,
  cacheControl: "no-store",
  handler: async ({ params }) => {
    try {
      const result = await deletePromoterRecord({
        promoterId: params.id,
      });

      return {
        data: {
          result,
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        if (/not found/i.test(error.message)) {
          throw apiError.notFound(error.message);
        }
        if (/payout history/i.test(error.message)) {
          throw apiError.badRequest(error.message);
        }
      }
      throw apiError.internal(
        error instanceof Error ? error.message : "Failed to delete promoter.",
      );
    }
  },
});
