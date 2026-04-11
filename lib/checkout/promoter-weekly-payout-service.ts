import { and, desc, eq, inArray, notInArray } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  affiliates,
  promoterPayouts,
  promoterWeeklyPayouts,
  promoters,
} from "@/lib/db/schema";
import { decrypt } from "@/lib/db/encryption";
import {
  backfillLegacyOpenPromoterEarnings,
  type PromoterEarningRecord,
} from "@/lib/checkout/promoter-earnings-service";
import { formatAmount, parseAmount } from "@/lib/checkout/affiliate-math";
import {
  buildWeeklyPayoutPeriod,
  formatPayoutPeriodLabel,
  type WeeklyPayoutPeriod,
} from "@/lib/checkout/payout-periods";
import { sendPromoterWeeklyPayoutSentEmail } from "@/lib/email/promoter-emails";

export type PromoterWeeklyPayoutBatchRecord =
  typeof promoterWeeklyPayouts.$inferSelect;

export type PromoterWeeklyPayoutBatchWithWallet =
  PromoterWeeklyPayoutBatchRecord & {
    walletAddress: string;
    promoterName?: string;
    promoterEmail?: string;
  };

export type PromoterWeeklyPayoutEarningDetail = PromoterEarningRecord & {
  growthPartnerName: string | null;
  growthPartnerEmail: string | null;
};

export type PromoterWeeklyPayoutBatchDetail =
  PromoterWeeklyPayoutBatchWithWallet & {
    promoterEmail: string;
    promoterName: string;
    earnings: PromoterWeeklyPayoutEarningDetail[];
  };

type BatchGroupingRow = {
  earning: PromoterEarningRecord;
  promoter: typeof promoters.$inferSelect | null;
};

function decryptWalletSnapshot(
  batch: Pick<
    PromoterWeeklyPayoutBatchRecord,
    "encryptedWalletAddress" | "walletIv" | "walletTag"
  >,
) {
  if (!batch.encryptedWalletAddress || !batch.walletIv || !batch.walletTag) {
    return "";
  }

  return decrypt({
    ciphertext: batch.encryptedWalletAddress,
    iv: batch.walletIv,
    tag: batch.walletTag,
  });
}

function getPeriodFromDate(periodDate?: string | Date) {
  return buildWeeklyPayoutPeriod(periodDate ?? new Date());
}

function getBatchGroupKey(earning: PromoterEarningRecord) {
  return `${earning.promoterId}:${earning.commissionMonthKey}`;
}

async function getExistingBatchForGroup(args: {
  promoterId: string;
  commissionMonthKey: string;
  period: WeeklyPayoutPeriod;
}) {
  const [row] = await db
    .select()
    .from(promoterWeeklyPayouts)
    .where(
      and(
        eq(promoterWeeklyPayouts.promoterId, args.promoterId),
        eq(promoterWeeklyPayouts.commissionMonthKey, args.commissionMonthKey),
        eq(promoterWeeklyPayouts.periodStart, args.period.start),
        eq(promoterWeeklyPayouts.periodEnd, args.period.end),
      ),
    )
    .limit(1);

  return row ?? null;
}

async function loadBatchGroupingRows(period: WeeklyPayoutPeriod) {
  return db
    .select({
      earning: promoterPayouts,
      promoter: promoters,
    })
    .from(promoterPayouts)
    .leftJoin(promoters, eq(promoterPayouts.promoterId, promoters.id))
    .where(
      and(
        inArray(promoterPayouts.status, ["pending", "approved"]),
        eq(promoterPayouts.payoutPeriodStart, period.start),
        eq(promoterPayouts.payoutPeriodEnd, period.end),
      ),
    )
    .orderBy(desc(promoterPayouts.earnedAt), desc(promoterPayouts.createdAt));
}

function groupRowsByPromoterMonth(rows: BatchGroupingRow[]) {
  return rows.reduce<Map<string, BatchGroupingRow[]>>((groups, row) => {
    if (!row.earning.commissionMonthKey) {
      return groups;
    }

    const key = getBatchGroupKey(row.earning);
    const existing = groups.get(key) ?? [];
    existing.push(row);
    groups.set(key, existing);
    return groups;
  }, new Map<string, BatchGroupingRow[]>());
}

export async function generatePromoterWeeklyPayoutBatches(args?: {
  periodDate?: string | Date;
}) {
  await backfillLegacyOpenPromoterEarnings();

  const period = getPeriodFromDate(args?.periodDate);
  const rows = (await loadBatchGroupingRows(period)) as BatchGroupingRow[];
  const groupedRows = groupRowsByPromoterMonth(rows);
  const batches: PromoterWeeklyPayoutBatchRecord[] = [];

  for (const rowsForGroup of groupedRows.values()) {
    const [firstRow] = rowsForGroup;
    if (!firstRow?.promoter || !firstRow.earning.commissionMonthKey) {
      continue;
    }

    const existingBatch = await getExistingBatchForGroup({
      promoterId: firstRow.earning.promoterId,
      commissionMonthKey: firstRow.earning.commissionMonthKey,
      period,
    });
    if (existingBatch?.status === "paid" || existingBatch?.status === "rejected") {
      batches.push(existingBatch);
      continue;
    }

    const earningIds = rowsForGroup.map((row) => row.earning.id);
    const totalNormalizedCommissionAmount = formatAmount(
      rowsForGroup.reduce(
        (sum, row) =>
          sum +
          parseAmount(
            row.earning.normalizedCommissionAmount ?? row.earning.commissionAmount,
          ),
        0,
      ),
    );
    const approvedAt = existingBatch?.approvedAt ?? new Date();

    const [batch] = await db
      .insert(promoterWeeklyPayouts)
      .values({
        promoterId: firstRow.earning.promoterId,
        commissionMonthKey: firstRow.earning.commissionMonthKey,
        periodStart: period.start,
        periodEnd: period.end,
        periodTimezone: period.timezone,
        earningCount: rowsForGroup.length,
        totalNormalizedCommissionAmount,
        payoutCurrencyCode: "USD",
        encryptedWalletAddress: firstRow.promoter.encryptedWalletAddress,
        walletIv: firstRow.promoter.walletIv,
        walletTag: firstRow.promoter.walletTag,
        adminNotes: existingBatch?.adminNotes ?? null,
        status: "approved",
        approvedAt,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          promoterWeeklyPayouts.promoterId,
          promoterWeeklyPayouts.commissionMonthKey,
          promoterWeeklyPayouts.periodStart,
          promoterWeeklyPayouts.periodEnd,
        ],
        set: {
          earningCount: rowsForGroup.length,
          totalNormalizedCommissionAmount,
          payoutCurrencyCode: "USD",
          encryptedWalletAddress: firstRow.promoter.encryptedWalletAddress,
          walletIv: firstRow.promoter.walletIv,
          walletTag: firstRow.promoter.walletTag,
          status: "approved",
          approvedAt,
          rejectedAt: null,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!batch) continue;

    if (existingBatch) {
      await db
        .update(promoterPayouts)
        .set({
          weeklyPayoutId: null,
          status: "pending",
          approvedAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(promoterPayouts.weeklyPayoutId, existingBatch.id),
            notInArray(promoterPayouts.id, earningIds),
            inArray(promoterPayouts.status, ["pending", "approved"]),
          ),
        );
    }

    await db
      .update(promoterPayouts)
      .set({
        weeklyPayoutId: batch.id,
        status: "approved",
        approvedAt,
        rejectedAt: null,
        updatedAt: new Date(),
      })
      .where(inArray(promoterPayouts.id, earningIds));

    batches.push(batch);
  }

  return {
    period,
    batches,
  };
}

export async function listPromoterWeeklyPayoutBatches(args?: {
  periodDate?: string | Date;
  promoterId?: string;
  status?: PromoterWeeklyPayoutBatchRecord["status"];
}) {
  const period = args?.periodDate ? getPeriodFromDate(args.periodDate) : null;
  const conditions = [];

  if (args?.promoterId) {
    conditions.push(eq(promoterWeeklyPayouts.promoterId, args.promoterId));
  }
  if (args?.status) {
    conditions.push(eq(promoterWeeklyPayouts.status, args.status));
  }
  if (period) {
    conditions.push(eq(promoterWeeklyPayouts.periodStart, period.start));
    conditions.push(eq(promoterWeeklyPayouts.periodEnd, period.end));
  }

  const rows = await db
    .select({
      batch: promoterWeeklyPayouts,
      promoterName: promoters.name,
      promoterEmail: promoters.email,
    })
    .from(promoterWeeklyPayouts)
    .innerJoin(promoters, eq(promoterWeeklyPayouts.promoterId, promoters.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(promoterWeeklyPayouts.periodStart), desc(promoterWeeklyPayouts.createdAt))
    .limit(500);

  return rows.map((row) => ({
    ...row.batch,
    promoterName: row.promoterName,
    promoterEmail: row.promoterEmail,
    walletAddress: decryptWalletSnapshot(row.batch),
  }));
}

export async function getPromoterWeeklyPayoutBatchById(batchId: string) {
  const [row] = await db
    .select({
      batch: promoterWeeklyPayouts,
      promoterEmail: promoters.email,
      promoterName: promoters.name,
    })
    .from(promoterWeeklyPayouts)
    .innerJoin(promoters, eq(promoterWeeklyPayouts.promoterId, promoters.id))
    .where(eq(promoterWeeklyPayouts.id, batchId))
    .limit(1);

  if (!row) return null;

  const earnings = await db
    .select({
      earning: promoterPayouts,
      growthPartnerName: affiliates.name,
      growthPartnerEmail: affiliates.email,
    })
    .from(promoterPayouts)
    .leftJoin(affiliates, eq(promoterPayouts.affiliateId, affiliates.id))
    .where(eq(promoterPayouts.weeklyPayoutId, batchId))
    .orderBy(desc(promoterPayouts.earnedAt), desc(promoterPayouts.createdAt));

  return {
    ...row.batch,
    walletAddress: decryptWalletSnapshot(row.batch),
    promoterEmail: row.promoterEmail,
    promoterName: row.promoterName,
    earnings: earnings.map((entry) => ({
      ...entry.earning,
      growthPartnerName: entry.growthPartnerName,
      growthPartnerEmail: entry.growthPartnerEmail,
    })),
  } satisfies PromoterWeeklyPayoutBatchDetail;
}

export async function markPromoterWeeklyPayoutBatchPaid(
  batchId: string,
  txHash: string,
) {
  const batch = await getPromoterWeeklyPayoutBatchById(batchId);
  if (!batch) {
    throw new Error("Promoter weekly payout batch not found.");
  }

  if (batch.status === "paid") {
    throw new Error("Promoter weekly payout batch has already been marked paid.");
  }

  if (batch.status === "rejected") {
    throw new Error("Rejected promoter weekly payout batches cannot be marked paid.");
  }

  if (!batch.walletAddress.trim()) {
    throw new Error("Promoter payout wallet is missing.");
  }

  const paidAt = new Date();

  await db
    .update(promoterWeeklyPayouts)
    .set({
      status: "paid",
      txHash,
      paidAt,
      updatedAt: new Date(),
    })
    .where(eq(promoterWeeklyPayouts.id, batchId));

  await db
    .update(promoterPayouts)
    .set({
      status: "paid",
      txHash,
      paidAt,
      updatedAt: new Date(),
    })
    .where(eq(promoterPayouts.weeklyPayoutId, batchId));

  await sendPromoterWeeklyPayoutSentEmail({
    promoterEmail: batch.promoterEmail,
    promoterName: batch.promoterName,
    payoutAmount: batch.totalNormalizedCommissionAmount,
    payoutPeriod: formatPayoutPeriodLabel({
      start: batch.periodStart,
      end: batch.periodEnd,
      timezone: batch.periodTimezone,
    }),
  });
}

export async function rejectPromoterWeeklyPayoutBatch(
  batchId: string,
  notes?: string,
) {
  const batch = await getPromoterWeeklyPayoutBatchById(batchId);
  if (!batch) {
    throw new Error("Promoter weekly payout batch not found.");
  }

  if (batch.status === "paid") {
    throw new Error("Paid promoter weekly payout batches cannot be rejected.");
  }

  const rejectedAt = new Date();

  await db
    .update(promoterWeeklyPayouts)
    .set({
      status: "rejected",
      adminNotes: notes?.trim() || null,
      rejectedAt,
      updatedAt: new Date(),
    })
    .where(eq(promoterWeeklyPayouts.id, batchId));

  await db
    .update(promoterPayouts)
    .set({
      status: "rejected",
      adminNotes: notes?.trim() || null,
      rejectedAt,
      updatedAt: new Date(),
    })
    .where(eq(promoterPayouts.weeklyPayoutId, batchId));
}

export async function getPromoterWeeklyPayoutBatchesForPromoter(
  promoterId: string,
) {
  return listPromoterWeeklyPayoutBatches({ promoterId });
}

export async function getPromoterWeeklyPayoutBatchPeriodOverview(
  periodDate?: string | Date,
) {
  await backfillLegacyOpenPromoterEarnings();
  const period = getPeriodFromDate(periodDate);
  const batches = await listPromoterWeeklyPayoutBatches({
    periodDate: period.start,
  });

  return {
    period,
    batches,
  };
}
