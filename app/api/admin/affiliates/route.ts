import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";

import { createApiListRoute } from "@/lib/api/route";
import { getCommissionMonthKey } from "@/lib/checkout/commission-service";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/db/encryption";
import { affiliateCommissionMonths, affiliates } from "@/lib/db/schema";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  status: z
    .enum(["pending", "approved", "rejected", "suspended"])
    .optional(),
  q: z.string().trim().optional(),
});

type AdminAffiliateListItem = {
  id: string;
  code: string;
  name: string;
  email: string;
  walletAddress: string;
  socialProfiles: Array<{
    platform: string;
    url: string;
  }>;
  userId: string | null;
  swellCouponId: string | null;
  discountCode: string | null;
  discountPercent: string | null;
  commissionRate: string;
  currentMonthRevenue: string;
  currentMonthOrderCount: number;
  currentCommissionRate: string;
  currentCommissionTier: string | null;
  currentCommissionOverride: boolean;
  status: "pending" | "approved" | "rejected" | "suspended";
  createdAt: string;
};

export const dynamic = "force-dynamic";

export const GET = createApiListRoute({
  route: "/api/admin/affiliates",
  access: "admin",
  querySchema,
  cacheControl: "no-store",
  handler: async ({ query }) => {
    const filters = [];

    if (query.status) {
      filters.push(eq(affiliates.status, query.status));
    }

    if (query.q) {
      const needle = `%${query.q}%`;
      filters.push(
        or(
          ilike(affiliates.code, needle),
          ilike(affiliates.name, needle),
          ilike(affiliates.email, needle),
        )!,
      );
    }

    const whereClause =
      filters.length === 0
        ? undefined
        : filters.length === 1
          ? filters[0]
          : and(...filters);

    const offset = (query.page - 1) * query.pageSize;
    const [rows, totalResult] = await Promise.all([
      db
        .select()
        .from(affiliates)
        .where(whereClause)
        .orderBy(desc(affiliates.createdAt))
        .limit(query.pageSize)
        .offset(offset),
      db
        .select({
          count: sql<number>`count(*)`,
        })
        .from(affiliates)
        .where(whereClause),
    ]);

    const currentMonthKey = getCommissionMonthKey();
    const currentMonthSummaries =
      rows.length > 0
        ? await db
            .select()
            .from(affiliateCommissionMonths)
            .where(
              inArray(
                affiliateCommissionMonths.affiliateId,
                rows.map((row) => row.id),
              ),
            )
        : [];

    const summaryByAffiliateId = new Map(
      currentMonthSummaries
        .filter((summary) => summary.monthKey === currentMonthKey)
        .map((summary) => [summary.affiliateId, summary] as const),
    );

    return {
      data: rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        email: row.email,
        walletAddress: decrypt({
          ciphertext: row.encryptedWalletAddress,
          iv: row.walletIv,
          tag: row.walletTag,
        }),
        socialProfiles: row.socialProfiles || [],
        userId: row.userId,
        swellCouponId: row.swellCouponId,
        discountCode: row.discountCode,
        discountPercent: row.discountPercent,
        commissionRate: row.commissionRate,
        currentMonthRevenue:
          summaryByAffiliateId.get(row.id)?.recognizedRevenue ?? "0.00",
        currentMonthOrderCount:
          summaryByAffiliateId.get(row.id)?.recognizedOrderCount ?? 0,
        currentCommissionRate:
          summaryByAffiliateId.get(row.id)?.effectiveRate ?? row.commissionRate,
        currentCommissionTier:
          summaryByAffiliateId.get(row.id)?.tierLabel ?? null,
        currentCommissionOverride: Boolean(
          summaryByAffiliateId.get(row.id)?.overrideRate,
        ),
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total: Number(totalResult[0]?.count ?? 0),
      cacheControl: "no-store",
    };
  },
});
