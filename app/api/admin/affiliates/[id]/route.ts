import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { createApiRoute } from "@/lib/api/route";
import { apiError } from "@/lib/api/errors";
import {
  getAffiliateOpenPanelTelemetry,
  hasOpenPanelCredentials,
} from "@/lib/analytics/openpanel";
import { db } from "@/lib/db";
import { affiliatePayouts, affiliateVisits, affiliates, checkoutOrders } from "@/lib/db/schema";
import {
  DEFAULT_AFFILIATE_DISCOUNT_PERCENT,
  checkAffiliateAssignmentAvailability,
  deleteAffiliateRecord,
  getAffiliateCodeAssignment,
  listAffiliateDiscountChangesForAffiliate,
  removeAffiliateCodeAssignment,
  saveAffiliateCodeAssignment,
  setAffiliateCodeAssignmentActive,
} from "@/lib/checkout/affiliate-code-service";
import {
  getAffiliateCommissionOverview,
  setAffiliateCommissionOverride,
  updateAffiliateBaselineCommission,
} from "@/lib/checkout/commission-service";
import {
  payoutAmountSql,
  sumPayoutAmountSql,
} from "@/lib/checkout/payout-amount-sql";

const paramsSchema = z.object({
  id: z.string().trim().min(1),
});

const querySchema = z.object({
  monthKey: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  range: z.enum(["24h", "7d", "30d", "all"]).default("30d"),
});

const patchSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "suspended"]).optional(),
  affiliateCode: z.string().trim().optional(),
  discountCode: z.string().trim().optional(),
  discountPercent: z.string().trim().optional(),
  commissionRate: z.string().trim().optional(),
  sendApprovalEmail: z.boolean().optional(),
  removeAssignment: z.boolean().optional(),
  changeReason: z.string().trim().optional(),
  suspensionReason: z.string().trim().optional(),
  reinstatementReason: z.string().trim().optional(),
  commissionOverrideMonthKey: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  commissionOverrideRate: z.string().trim().nullable().optional(),
  clearCommissionOverride: z.boolean().optional(),
});

const postSchema = z.object({
  action: z.literal("check_availability"),
  affiliateCode: z.string().trim().min(1),
  discountCode: z.string().trim().min(1),
});

const deleteSchema = z.object({
  removalReason: z.string().trim().optional(),
});

async function getAffiliateRow(id: string) {
  const rows = await db
    .select()
    .from(affiliates)
    .where(eq(affiliates.id, id))
    .limit(1);

  return rows[0] || null;
}

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

function timestamptzParam(date: Date) {
  return sql`${date.toISOString()}::timestamptz`;
}

function getAffiliatePerformanceScope(affiliateId: string, startDate: Date | null) {
  const affiliateScope = eq(affiliatePayouts.affiliateId, affiliateId);
  if (!startDate) return affiliateScope;

  return and(
    affiliateScope,
    sql`coalesce(${affiliatePayouts.earnedAt}, ${affiliatePayouts.createdAt}) >= ${timestamptzParam(startDate)}`,
  );
}

function getVisitScope(affiliateId: string, startDate: Date | null) {
  const affiliateScope = eq(affiliateVisits.affiliateId, affiliateId);
  if (!startDate) return affiliateScope;

  return and(
    affiliateScope,
    sql`${affiliateVisits.createdAt} >= ${timestamptzParam(startDate)}`,
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

async function getAffiliateAdminPerformance(args: {
  affiliateId: string;
  affiliateCode: string;
  range: z.infer<typeof querySchema>["range"];
}) {
  const startDate = getRangeStart(args.range);
  const payoutScope = getAffiliatePerformanceScope(args.affiliateId, startDate);
  const visitScope = getVisitScope(args.affiliateId, startDate);
  const { monthKey, yearKey } = getCurrentCommissionPeriodKeys();

  const [
    summaryRows,
    periodRows,
    salesRows,
    visitRows,
    uniqueVisitorRows,
    telemetry,
  ] =
    await Promise.all([
      db
        .select({
          orderCount: sql<number>`count(*)`,
          revenue: sumPayoutAmountSql(
            affiliatePayouts.normalizedOrderTotal,
            affiliatePayouts.orderTotal,
          ),
          commission: sumPayoutAmountSql(
            affiliatePayouts.normalizedCommissionAmount,
            affiliatePayouts.commissionAmount,
          ),
        })
        .from(affiliatePayouts)
        .where(payoutScope),
      db
        .select({
          currentMonthCommission: sql<string>`coalesce(sum(${payoutAmountSql(affiliatePayouts.normalizedCommissionAmount, affiliatePayouts.commissionAmount)}) filter (where coalesce(${affiliatePayouts.commissionMonthKey}, to_char(coalesce(${affiliatePayouts.earnedAt}, ${affiliatePayouts.createdAt}), 'YYYY-MM')) = ${monthKey}), 0)`,
          currentYearCommission: sql<string>`coalesce(sum(${payoutAmountSql(affiliatePayouts.normalizedCommissionAmount, affiliatePayouts.commissionAmount)}) filter (where left(coalesce(${affiliatePayouts.commissionMonthKey}, to_char(coalesce(${affiliatePayouts.earnedAt}, ${affiliatePayouts.createdAt}), 'YYYY-MM')), 4) = ${yearKey}), 0)`,
        })
        .from(affiliatePayouts)
        .where(eq(affiliatePayouts.affiliateId, args.affiliateId)),
      db
        .select({
          payoutId: affiliatePayouts.id,
          orderId: affiliatePayouts.orderId,
          orderTotal: affiliatePayouts.orderTotal,
          normalizedOrderTotal: affiliatePayouts.normalizedOrderTotal,
          commissionAmount: affiliatePayouts.commissionAmount,
          normalizedCommissionAmount: affiliatePayouts.normalizedCommissionAmount,
          commissionRate: affiliatePayouts.commissionRate,
          status: affiliatePayouts.status,
          currencyCode: affiliatePayouts.currencyCode,
          earnedAt: affiliatePayouts.earnedAt,
          createdAt: affiliatePayouts.createdAt,
          paymentStatus: checkoutOrders.paymentStatus,
          customerEmail: checkoutOrders.email,
          fulfillmentStatus: checkoutOrders.fulfillmentStatus,
        })
        .from(affiliatePayouts)
        .innerJoin(
          checkoutOrders,
          eq(affiliatePayouts.orderId, checkoutOrders.orderId),
        )
        .where(payoutScope)
        .orderBy(desc(affiliatePayouts.createdAt)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(affiliateVisits)
        .where(visitScope),
      db
        .selectDistinct({ visitorId: affiliateVisits.visitorId })
        .from(affiliateVisits)
        .where(visitScope),
      hasOpenPanelCredentials()
        ? getAffiliateOpenPanelTelemetry(args.affiliateCode, args.range).catch(
            () => null,
          )
        : Promise.resolve(null),
    ]);

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
      firstPartyVisits: Number(visitRows[0]?.count ?? 0),
      firstPartyUniqueVisitors: uniqueVisitorRows.length,
      trackedVisits,
      trackedPurchases,
      trackedRevenue,
      trackedEvents: telemetry?.events.length ?? 0,
    },
    sales,
    telemetry,
  };
}

function normalizeAffiliateError(error: unknown) {
  if (!(error instanceof Error)) {
    return apiError.internal("Failed to update affiliate.");
  }

  if (error.name === "ApiError") {
    return error;
  }

  if (/Affiliate not found\./i.test(error.message)) {
    return apiError.notFound(error.message);
  }

  if (/payout history and cannot be permanently deleted/i.test(error.message)) {
    return apiError.conflict(error.message);
  }

  if (
    /requires a Swell discount code|already linked|already exists|must be/i.test(
      error.message,
    )
  ) {
    return apiError.badRequest(error.message);
  }

  return apiError.internal(error.message);
}

export const dynamic = "force-dynamic";

export const GET = createApiRoute({
  route: "/api/admin/affiliates/:id",
  access: "admin",
  paramsSchema,
  querySchema,
  cacheControl: "no-store",
  handler: async ({ params, query }) => {
    const affiliate = await getAffiliateRow(params.id);
    if (!affiliate) {
      throw apiError.notFound("Affiliate not found.");
    }

    const [assignment, commission, discountHistory, performance] = await Promise.all([
      getAffiliateCodeAssignment(params.id),
      getAffiliateCommissionOverview({
        affiliateId: params.id,
        monthKey: query.monthKey,
      }),
      listAffiliateDiscountChangesForAffiliate(params.id, 10),
      getAffiliateAdminPerformance({
        affiliateId: params.id,
        affiliateCode: affiliate.code,
        range: query.range,
      }),
    ]);

    return {
      data: {
        assignment,
        commission,
        discountHistory,
        performance,
      },
    };
  },
});

export const PATCH = createApiRoute<
  "admin",
  typeof patchSchema,
  undefined,
  typeof paramsSchema,
  Record<string, unknown>
>({
  route: "/api/admin/affiliates/:id",
  access: "admin",
  paramsSchema,
  bodySchema: patchSchema,
  cacheControl: "no-store",
  handler: async ({ params, body, session }) => {
    try {
      const current = await getAffiliateRow(params.id);
      if (!current) {
        throw apiError.notFound("Affiliate not found.");
      }

      if (body.removeAssignment) {
        const assignment = await removeAffiliateCodeAssignment({
          affiliateId: params.id,
          changedByUserId: session.user.id,
          changeReason: body.changeReason ?? null,
        });

        return {
          data: {
            assignment,
          },
        };
      }

      if (body.commissionOverrideMonthKey) {
        const commission = await setAffiliateCommissionOverride({
          affiliateId: params.id,
          monthKey: body.commissionOverrideMonthKey,
          overrideRate:
            body.clearCommissionOverride ||
            body.commissionOverrideRate === undefined
              ? null
              : body.commissionOverrideRate,
          reason: body.changeReason ?? null,
          actorUserId: session.user.id,
        });

        return {
          data: {
            commission,
          },
        };
      }

      const hasAssignmentMutation =
        body.affiliateCode !== undefined ||
        body.discountCode !== undefined ||
        body.discountPercent !== undefined ||
        body.sendApprovalEmail !== undefined;

      if (hasAssignmentMutation || body.status === "approved") {
        const effectiveDiscountCode = body.discountCode ?? current.discountCode;
        const effectiveDiscountPercent =
          body.discountPercent ??
          current.discountPercent ??
          DEFAULT_AFFILIATE_DISCOUNT_PERCENT;

        if (!effectiveDiscountCode) {
          throw apiError.badRequest(
            "Approving an affiliate requires a Swell discount code.",
          );
        }

        const assignment = await saveAffiliateCodeAssignment({
          affiliateId: params.id,
          affiliateCode: body.affiliateCode ?? current.code,
          discountCode: effectiveDiscountCode,
          discountPercent: effectiveDiscountPercent,
          commissionRate: body.commissionRate,
          approve: body.status === "approved",
          sendEmail: body.sendApprovalEmail ?? body.status === "approved",
          changedByUserId: session.user.id,
          changeReason: body.changeReason ?? null,
          reinstatementReason: body.reinstatementReason ?? null,
        });

        return {
          data: {
            assignment,
          },
        };
      }

      if (body.status) {
        const assignment = await setAffiliateCodeAssignmentActive({
          affiliateId: params.id,
          active: false,
          status: body.status,
          changedByUserId: session.user.id,
          changeReason: body.changeReason ?? null,
          suspensionReason: body.suspensionReason ?? null,
        });

        if (body.commissionRate !== undefined) {
          await updateAffiliateBaselineCommission({
            affiliateId: params.id,
            commissionRate: body.commissionRate,
            actorUserId: session.user.id,
            notes: body.changeReason ?? null,
          });
        }

        return {
          data: {
            assignment,
          },
        };
      }

      if (body.commissionRate !== undefined) {
        const commissionRate = await updateAffiliateBaselineCommission({
          affiliateId: params.id,
          commissionRate: body.commissionRate,
          actorUserId: session.user.id,
          notes: body.changeReason ?? null,
        });

        return {
          data: {
            commissionRate,
          },
        };
      }

      return {
        data: {
          assignment: await getAffiliateCodeAssignment(params.id),
        },
      };
    } catch (error) {
      throw normalizeAffiliateError(error);
    }
  },
});

export const POST = createApiRoute({
  route: "/api/admin/affiliates/:id",
  access: "admin",
  paramsSchema,
  bodySchema: postSchema,
  cacheControl: "no-store",
  handler: async ({ params, body }) => {
    const availability = await checkAffiliateAssignmentAvailability({
      affiliateId: params.id,
      affiliateCode: body.affiliateCode,
      discountCode: body.discountCode,
    });

    return {
      data: {
        availability,
      },
    };
  },
});

export const DELETE = createApiRoute({
  route: "/api/admin/affiliates/:id",
  access: "admin",
  paramsSchema,
  bodySchema: deleteSchema,
  cacheControl: "no-store",
  handler: async ({ params, body }) => {
    try {
      const result = await deleteAffiliateRecord({
        affiliateId: params.id,
        removalReason: body.removalReason ?? null,
      });

      return {
        data: {
          result,
        },
      };
    } catch (error) {
      throw normalizeAffiliateError(error);
    }
  },
});
