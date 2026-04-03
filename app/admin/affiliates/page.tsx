import { db } from "@/lib/db";
import { affiliateCommissionMonths, affiliates } from "@/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { decrypt } from "@/lib/db/encryption";
import { listAffiliateRoleOrphans } from "@/lib/checkout/affiliate-service";
import { getCommissionMonthKey } from "@/lib/checkout/commission-service";
import { AffiliateManagement } from "./affiliate-management";

export const metadata = {
  title: "Growth Partner Management | Revalin Admin",
};

type AffiliatesPageProps = {
  searchParams?: Promise<{
    openAffiliate?: string | string[] | undefined;
  }>;
};

type AffiliateRow = {
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
  createdAt: Date;
};

export default async function AffiliatesPage({
  searchParams,
}: AffiliatesPageProps) {
  const params = (await searchParams) || {};
  const requestedAffiliateId = Array.isArray(params.openAffiliate)
    ? params.openAffiliate[0]
    : params.openAffiliate;

  const [baseRows, selectedRows, orphanUsers] = await Promise.all([
    db.select().from(affiliates).orderBy(desc(affiliates.createdAt)).limit(200),
    requestedAffiliateId
      ? db
          .select()
          .from(affiliates)
          .where(eq(affiliates.id, requestedAffiliateId))
          .limit(1)
      : Promise.resolve([]),
    listAffiliateRoleOrphans().catch(() => []),
  ]);

  const rows = [...selectedRows, ...baseRows].filter(
    (row, index, collection) =>
      collection.findIndex((entry) => entry.id === row.id) === index,
  );
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
      .map((summary) => [summary.affiliateId, summary]),
  );

  const decryptedRows: AffiliateRow[] = rows.map((row) => ({
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
    status: row.status,
    createdAt: row.createdAt,
  }));

  return (
    <AffiliateManagement affiliates={decryptedRows} orphanUsers={orphanUsers} />
  );
}
