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

export const EMPTY_AFFILIATE_VISIT_SUMMARY: AffiliateVisitSummary = {
  totalVisits: 0,
  totalUniqueVisitors: 0,
  visits30d: 0,
  uniqueVisitors30d: 0,
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

function logAffiliateVisitError(scope: string, error: unknown, affiliateId?: string) {
  const message =
    error instanceof Error ? error.message : String(error);
  const cause =
    error instanceof Error && "cause" in error
      ? (error as Error & { cause?: unknown }).cause
      : undefined;

  console.warn(
    `[affiliate-visits] ${scope} unavailable for affiliate ${affiliateId ?? "unknown"}: ${message}`,
    cause,
  );
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

  try {
    const affiliateScope = eq(affiliateVisits.affiliateId, affiliateId);
    const last30dScope = and(
      affiliateScope,
      gte(affiliateVisits.createdAt, start30d),
    );

    const [
      totalVisitsRows,
      totalUniqueVisitorRows,
      visits30dRows,
      unique30dRows,
    ] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(affiliateVisits)
        .where(affiliateScope),
      db
        .selectDistinct({ visitorId: affiliateVisits.visitorId })
        .from(affiliateVisits)
        .where(affiliateScope),
      db
        .select({ count: sql<number>`count(*)` })
        .from(affiliateVisits)
        .where(last30dScope),
      db
        .selectDistinct({ visitorId: affiliateVisits.visitorId })
        .from(affiliateVisits)
        .where(last30dScope),
    ]);

    return {
      totalVisits: getCount(totalVisitsRows),
      totalUniqueVisitors: totalUniqueVisitorRows.length,
      visits30d: getCount(visits30dRows),
      uniqueVisitors30d: unique30dRows.length,
    };
  } catch (error) {
    logAffiliateVisitError("summary", error, affiliateId);
    return EMPTY_AFFILIATE_VISIT_SUMMARY;
  }
}

export async function getRecentAffiliateVisits(
  affiliateId: string,
  limit = 8,
): Promise<AffiliateVisitRecord[]> {
  try {
    return await db
      .select()
      .from(affiliateVisits)
      .where(eq(affiliateVisits.affiliateId, affiliateId))
      .orderBy(desc(affiliateVisits.createdAt))
      .limit(limit);
  } catch (error) {
    logAffiliateVisitError("recent", error, affiliateId);
    return [];
  }
}
