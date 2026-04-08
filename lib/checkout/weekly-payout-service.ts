import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  notInArray,
} from "drizzle-orm";

import { db } from "@/lib/db";
import {
  affiliatePayouts,
  affiliateWeeklyPayouts,
  affiliates,
} from "@/lib/db/schema";
import { decrypt } from "@/lib/db/encryption";
import {
  backfillLegacyOpenAffiliateEarnings,
  type AffiliateEarningRecord,
} from "@/lib/checkout/affiliate-earnings-service";
import {
  formatAmount,
  parseAmount,
} from "@/lib/checkout/affiliate-math";
import {
  formatPayoutPeriodLabel,
  buildWeeklyPayoutPeriod,
  type WeeklyPayoutPeriod,
} from "@/lib/checkout/payout-periods";
import {
  getAffiliateCommissionOverview,
  syncAffiliateCommissionMonth,
  type CommissionMonthSummary,
} from "@/lib/checkout/commission-service";
import { sendAffiliateWeeklyPayoutSentEmail } from "@/lib/email/affiliate-payout-emails";

export type WeeklyPayoutBatchRecord = typeof affiliateWeeklyPayouts.$inferSelect;

export type WeeklyPayoutBatchWithWallet = WeeklyPayoutBatchRecord & {
  walletAddress: string;
};

export type WeeklyPayoutBatchDetail = WeeklyPayoutBatchWithWallet & {
  affiliateEmail: string;
  affiliateName: string;
  earnings: AffiliateEarningRecord[];
};

type BatchGroupingRow = {
  earning: AffiliateEarningRecord;
  affiliate: typeof affiliates.$inferSelect | null;
};

function decryptWalletSnapshot(
  batch: Pick<
    WeeklyPayoutBatchRecord,
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

function getBatchGroupKey(earning: AffiliateEarningRecord) {
  return `${earning.affiliateId}:${earning.commissionMonthKey}`;
}

async function getExistingBatchForGroup(args: {
  affiliateId: string;
  commissionMonthKey: string;
  period: WeeklyPayoutPeriod;
}) {
  const [row] = await db
    .select()
    .from(affiliateWeeklyPayouts)
    .where(
      and(
        eq(affiliateWeeklyPayouts.affiliateId, args.affiliateId),
        eq(affiliateWeeklyPayouts.commissionMonthKey, args.commissionMonthKey),
        eq(affiliateWeeklyPayouts.periodStart, args.period.start),
        eq(affiliateWeeklyPayouts.periodEnd, args.period.end),
      ),
    )
    .limit(1);

  return row ?? null;
}

async function loadBatchGroupingRows(period: WeeklyPayoutPeriod) {
  return db
    .select({
      earning: affiliatePayouts,
      affiliate: affiliates,
    })
    .from(affiliatePayouts)
    .leftJoin(affiliates, eq(affiliatePayouts.affiliateId, affiliates.id))
    .where(
      and(
        inArray(affiliatePayouts.status, ["pending", "approved"]),
        eq(affiliatePayouts.payoutPeriodStart, period.start),
        eq(affiliatePayouts.payoutPeriodEnd, period.end),
      ),
    )
    .orderBy(desc(affiliatePayouts.earnedAt), desc(affiliatePayouts.createdAt));
}

function groupRowsByAffiliateMonth(rows: BatchGroupingRow[]) {
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

async function getCommissionSummaryMap(rows: BatchGroupingRow[]) {
  const uniqueKeys = Array.from(
    new Set(
      rows
        .map((row) =>
          row.earning.commissionMonthKey
            ? `${row.earning.affiliateId}:${row.earning.commissionMonthKey}`
            : null,
        )
        .filter(Boolean) as string[],
    ),
  );

  const summaryEntries = await Promise.all(
    uniqueKeys.map(async (key) => {
      const [affiliateId, monthKey] = key.split(":");
      if (!affiliateId || !monthKey) {
        return null;
      }

      const { summary } = await syncAffiliateCommissionMonth({
        affiliateId,
        monthKey,
        eventType: "recalculated",
        notes: "Weekly payout batch refreshed.",
        recordEvent: true,
      });

      return [key, summary] as const;
    }),
  );

  return new Map(
    summaryEntries.filter(Boolean) as Array<readonly [string, CommissionMonthSummary]>,
  );
}

export async function generateWeeklyPayoutBatches(args?: {
  periodDate?: string | Date;
}) {
  await backfillLegacyOpenAffiliateEarnings();

  const period = getPeriodFromDate(args?.periodDate);
  const initialRows = (await loadBatchGroupingRows(period)) as BatchGroupingRow[];
  const summaryByGroupKey = await getCommissionSummaryMap(initialRows);
  const refreshedRows = (await loadBatchGroupingRows(period)) as BatchGroupingRow[];
  const groupedRows = groupRowsByAffiliateMonth(refreshedRows);

  const batches: WeeklyPayoutBatchRecord[] = [];

  for (const [groupKey, rows] of groupedRows.entries()) {
    const [firstRow] = rows;
    if (!firstRow?.affiliate || !firstRow.earning.commissionMonthKey) {
      continue;
    }

    const existingBatch = await getExistingBatchForGroup({
      affiliateId: firstRow.earning.affiliateId,
      commissionMonthKey: firstRow.earning.commissionMonthKey,
      period,
    });
    if (existingBatch?.status === "paid" || existingBatch?.status === "rejected") {
      batches.push(existingBatch);
      continue;
    }

    const summary =
      summaryByGroupKey.get(groupKey) ||
      (
        await getAffiliateCommissionOverview({
          affiliateId: firstRow.earning.affiliateId,
          monthKey: firstRow.earning.commissionMonthKey,
        })
      ).summary;
    const earningIds = rows.map((row) => row.earning.id);
    const totalNormalizedCommissionAmount = formatAmount(
      rows.reduce(
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
      .insert(affiliateWeeklyPayouts)
      .values({
        affiliateId: firstRow.earning.affiliateId,
        affiliateCode: firstRow.earning.affiliateCode,
        commissionMonthKey: firstRow.earning.commissionMonthKey,
        periodStart: period.start,
        periodEnd: period.end,
        periodTimezone: period.timezone,
        earningCount: rows.length,
        totalNormalizedCommissionAmount,
        payoutCurrencyCode: "USD",
        currentTierKey: summary.tierKey,
        currentTierLabel: summary.tierLabel,
        nextTierKey: summary.nextTierKey,
        nextTierLabel: summary.nextTierLabel,
        amountToNextTier: summary.amountToNextTier,
        effectiveRate: summary.effectiveRate,
        encryptedWalletAddress: firstRow.affiliate.encryptedWalletAddress,
        walletIv: firstRow.affiliate.walletIv,
        walletTag: firstRow.affiliate.walletTag,
        adminNotes: existingBatch?.adminNotes ?? null,
        status: "approved",
        approvedAt,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          affiliateWeeklyPayouts.affiliateId,
          affiliateWeeklyPayouts.commissionMonthKey,
          affiliateWeeklyPayouts.periodStart,
          affiliateWeeklyPayouts.periodEnd,
        ],
        set: {
          affiliateCode: firstRow.earning.affiliateCode,
          earningCount: rows.length,
          totalNormalizedCommissionAmount,
          payoutCurrencyCode: "USD",
          currentTierKey: summary.tierKey,
          currentTierLabel: summary.tierLabel,
          nextTierKey: summary.nextTierKey,
          nextTierLabel: summary.nextTierLabel,
          amountToNextTier: summary.amountToNextTier,
          effectiveRate: summary.effectiveRate,
          encryptedWalletAddress: firstRow.affiliate.encryptedWalletAddress,
          walletIv: firstRow.affiliate.walletIv,
          walletTag: firstRow.affiliate.walletTag,
          status: "approved",
          approvedAt,
          rejectedAt: null,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!batch) {
      continue;
    }

    if (existingBatch) {
      await db
        .update(affiliatePayouts)
        .set({
          weeklyPayoutId: null,
          status: "pending",
          approvedAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(affiliatePayouts.weeklyPayoutId, existingBatch.id),
            notInArray(affiliatePayouts.id, earningIds),
            inArray(affiliatePayouts.status, ["pending", "approved"]),
          ),
        );
    }

    await db
      .update(affiliatePayouts)
      .set({
        weeklyPayoutId: batch.id,
        status: "approved",
        approvedAt,
        rejectedAt: null,
        updatedAt: new Date(),
      })
      .where(inArray(affiliatePayouts.id, earningIds));

    batches.push(batch);
  }

  return {
    period,
    batches,
  };
}

export async function listWeeklyPayoutBatches(args?: {
  periodDate?: string | Date;
  affiliateId?: string;
  status?: WeeklyPayoutBatchRecord["status"];
}) {
  const period = args?.periodDate ? getPeriodFromDate(args.periodDate) : null;
  const rows = await db
    .select()
    .from(affiliateWeeklyPayouts)
    .orderBy(desc(affiliateWeeklyPayouts.periodStart), desc(affiliateWeeklyPayouts.createdAt))
    .limit(500);

  return rows
    .filter((row) => {
      if (args?.affiliateId && row.affiliateId !== args.affiliateId) return false;
      if (args?.status && row.status !== args.status) return false;
      if (period) {
        return (
          row.periodStart.getTime() === period.start.getTime() &&
          row.periodEnd.getTime() === period.end.getTime()
        );
      }
      return true;
    })
    .map((row) => ({
      ...row,
      walletAddress: decryptWalletSnapshot(row),
    }));
}

export async function getWeeklyPayoutBatchById(batchId: string) {
  const [row] = await db
    .select({
      batch: affiliateWeeklyPayouts,
      affiliateEmail: affiliates.email,
      affiliateName: affiliates.name,
    })
    .from(affiliateWeeklyPayouts)
    .innerJoin(affiliates, eq(affiliateWeeklyPayouts.affiliateId, affiliates.id))
    .where(eq(affiliateWeeklyPayouts.id, batchId))
    .limit(1);

  if (!row) {
    return null;
  }

  const earnings = await db
    .select()
    .from(affiliatePayouts)
    .where(eq(affiliatePayouts.weeklyPayoutId, batchId))
    .orderBy(desc(affiliatePayouts.earnedAt), desc(affiliatePayouts.createdAt));

  return {
    ...row.batch,
    walletAddress: decryptWalletSnapshot(row.batch),
    affiliateEmail: row.affiliateEmail,
    affiliateName: row.affiliateName,
    earnings,
  } satisfies WeeklyPayoutBatchDetail;
}

export async function markWeeklyPayoutBatchPaid(batchId: string, txHash: string) {
  const batch = await getWeeklyPayoutBatchById(batchId);
  if (!batch) {
    throw new Error("Weekly payout batch not found.");
  }

  if (batch.status === "paid") {
    throw new Error("Weekly payout batch has already been marked paid.");
  }

  if (batch.status === "rejected") {
    throw new Error("Rejected weekly payout batches cannot be marked paid.");
  }

  const paidAt = new Date();

  await db
    .update(affiliateWeeklyPayouts)
    .set({
      status: "paid",
      txHash,
      paidAt,
      updatedAt: new Date(),
    })
    .where(eq(affiliateWeeklyPayouts.id, batchId));

  await db
    .update(affiliatePayouts)
    .set({
      status: "paid",
      txHash,
      paidAt,
      updatedAt: new Date(),
    })
    .where(eq(affiliatePayouts.weeklyPayoutId, batchId));

  await sendAffiliateWeeklyPayoutSentEmail({
    affiliateEmail: batch.affiliateEmail,
    affiliateName: batch.affiliateName,
    payoutAmount: batch.totalNormalizedCommissionAmount,
    payoutPeriod: formatPayoutPeriodLabel({
      start: batch.periodStart,
      end: batch.periodEnd,
      timezone: batch.periodTimezone,
    }),
    currentTier: batch.currentTierLabel || batch.currentTierKey || "Current tier",
    amountToNextTier: batch.amountToNextTier,
    nextTier: batch.nextTierLabel || batch.nextTierKey,
  });
}

export async function rejectWeeklyPayoutBatch(batchId: string, notes?: string) {
  const batch = await getWeeklyPayoutBatchById(batchId);
  if (!batch) {
    throw new Error("Weekly payout batch not found.");
  }

  if (batch.status === "paid") {
    throw new Error("Paid weekly payout batches cannot be rejected.");
  }

  const rejectedAt = new Date();

  await db
    .update(affiliateWeeklyPayouts)
    .set({
      status: "rejected",
      adminNotes: notes?.trim() || null,
      rejectedAt,
      updatedAt: new Date(),
    })
    .where(eq(affiliateWeeklyPayouts.id, batchId));

  await db
    .update(affiliatePayouts)
    .set({
      status: "rejected",
      adminNotes: notes?.trim() || null,
      rejectedAt,
      updatedAt: new Date(),
    })
    .where(eq(affiliatePayouts.weeklyPayoutId, batchId));
}

export async function getWeeklyPayoutBatchesForAffiliate(affiliateId: string) {
  return listWeeklyPayoutBatches({ affiliateId });
}

export async function getWeeklyPayoutBatchPeriodOverview(periodDate?: string | Date) {
  await backfillLegacyOpenAffiliateEarnings();
  const period = getPeriodFromDate(periodDate);
  const batches = await listWeeklyPayoutBatches({ periodDate: period.start });

  return {
    period,
    batches,
  };
}
