import { and, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { affiliateVisits } from "@/lib/db/schema";

export type AffiliateVisitRecord = typeof affiliateVisits.$inferSelect;

export type AffiliateVisitSummary = {
  totalVisits: number;
  totalUniqueVisitors: number;
  visits30d: number;
  uniqueVisitors30d: number;
};

type CountRow = {
  count: number | string | null;
};

function getCount(rows: CountRow[]) {
  return Number(rows[0]?.count ?? 0);
}

function normalizeNullable(
  value: string | null | undefined,
  maxLength: number,
) {
  const normalized = value?.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

export async function createAffiliateVisit(args: {
  affiliateId: string;
  affiliateCode: string;
  visitorId: string;
  referralPath?: string | null;
  referrer?: string | null;
  userAgent?: string | null;
}) {
  const [row] = await db
    .insert(affiliateVisits)
    .values({
      affiliateId: args.affiliateId,
      affiliateCode: args.affiliateCode,
      visitorId: args.visitorId,
      referralPath: normalizeNullable(args.referralPath, 512),
      referrer: normalizeNullable(args.referrer, 2048),
      userAgent: normalizeNullable(args.userAgent, 1024),
    })
    .returning();

  return row!;
}

export async function getAffiliateVisitSummary(
  affiliateId: string,
): Promise<AffiliateVisitSummary> {
  const start30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalVisitsRows,
    totalUniqueVisitorRows,
    visits30dRows,
    unique30dRows,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(affiliateVisits)
      .where(eq(affiliateVisits.affiliateId, affiliateId)),
    db
      .select({
        count: sql<number>`count(distinct ${affiliateVisits.visitorId})`,
      })
      .from(affiliateVisits)
      .where(eq(affiliateVisits.affiliateId, affiliateId)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(affiliateVisits)
      .where(
        and(
          eq(affiliateVisits.affiliateId, affiliateId),
          gte(affiliateVisits.createdAt, start30d),
        ),
      ),
    db
      .select({
        count: sql<number>`count(distinct ${affiliateVisits.visitorId})`,
      })
      .from(affiliateVisits)
      .where(
        and(
          eq(affiliateVisits.affiliateId, affiliateId),
          gte(affiliateVisits.createdAt, start30d),
        ),
      ),
  ]);

  return {
    totalVisits: getCount(totalVisitsRows),
    totalUniqueVisitors: getCount(totalUniqueVisitorRows),
    visits30d: getCount(visits30dRows),
    uniqueVisitors30d: getCount(unique30dRows),
  };
}

export async function getRecentAffiliateVisits(
  affiliateId: string,
  limit = 8,
): Promise<AffiliateVisitRecord[]> {
  return db
    .select()
    .from(affiliateVisits)
    .where(eq(affiliateVisits.affiliateId, affiliateId))
    .orderBy(desc(affiliateVisits.createdAt))
    .limit(limit);
}
