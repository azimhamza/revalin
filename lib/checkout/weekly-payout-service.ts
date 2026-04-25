import { and, desc, eq, inArray, isNull, notInArray, or } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  affiliatePayouts,
  affiliateWeeklyPayouts,
  affiliates,
  checkoutOrders,
} from "@/lib/db/schema";
import { decrypt } from "@/lib/db/encryption";
import {
  backfillLegacyOpenAffiliateEarnings,
  type AffiliateEarningRecord,
} from "@/lib/checkout/affiliate-earnings-service";
import { formatAmount, parseAmount } from "@/lib/checkout/affiliate-math";
import {
  CRYPTO_PAYOUT_METHOD,
  buildAdminPayoutDestinationDetail,
  buildPayoutDestinationPreview,
  calculatePayoutSettlementAmounts,
  createBatchPayoutSnapshot,
  decryptOptionalValue,
  hasCompletePayoutDestination,
  type AdminPayoutDestinationDetail,
  type PayoutDestinationPreview,
} from "@/lib/checkout/payout-methods";
import {
  formatPayoutPeriodLabel,
  buildWeeklyPayoutPeriod,
  getDefaultPayoutTimezone,
  type WeeklyPayoutPeriod,
} from "@/lib/checkout/payout-periods";
import {
  getAffiliateCommissionOverview,
  syncAffiliateCommissionMonth,
  type CommissionMonthSummary,
} from "@/lib/checkout/commission-service";
import { sendAffiliateWeeklyPayoutSentEmail } from "@/lib/email/affiliate-payout-emails";

export type WeeklyPayoutBatchRecord =
  typeof affiliateWeeklyPayouts.$inferSelect;

export type WeeklyPayoutBatchWithWallet = WeeklyPayoutBatchRecord & {
  walletAddress: string;
  destinationPreview: PayoutDestinationPreview;
  paymentReference: string | null;
};

export type WeeklyPayoutBatchDetail = WeeklyPayoutBatchWithWallet & {
  affiliateEmail: string;
  affiliateName: string;
  destinationDetail: AdminPayoutDestinationDetail;
  earnings: Array<AffiliateEarningRecord & { orderAccessKey: string | null }>;
};

type BatchGroupingRow = {
  earning: AffiliateEarningRecord;
  affiliate: typeof affiliates.$inferSelect | null;
};

type PayNowBatchGroupingRow = BatchGroupingRow & {
  batch: WeeklyPayoutBatchRecord | null;
};

function logWeeklyPayoutError(
  scope: string,
  error: unknown,
  affiliateId?: string,
) {
  const message = error instanceof Error ? error.message : String(error);
  const cause =
    error instanceof Error && "cause" in error
      ? (error as Error & { cause?: unknown }).cause
      : undefined;

  console.warn(
    `[weekly-payouts] ${scope} unavailable${affiliateId ? ` for affiliate ${affiliateId}` : ""}: ${message}`,
    cause,
  );
}

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

function buildAffiliateBatchSnapshot(
  affiliate: typeof affiliates.$inferSelect,
) {
  try {
    return createBatchPayoutSnapshot({
      payoutMethod: affiliate.payoutMethod,
      walletAddress: decryptWalletSnapshot(affiliate),
      achAccountHolderName: affiliate.achAccountHolderName,
      achBankName: affiliate.achBankName,
      achAccountType: affiliate.achAccountType,
      achRoutingNumber: decryptOptionalValue({
        ciphertext: affiliate.encryptedAchRoutingNumber,
        iv: affiliate.achRoutingNumberIv,
        tag: affiliate.achRoutingNumberTag,
      }),
      achAccountNumber: decryptOptionalValue({
        ciphertext: affiliate.encryptedAchAccountNumber,
        iv: affiliate.achAccountNumberIv,
        tag: affiliate.achAccountNumberTag,
      }),
    });
  } catch {
    return {
      payoutMethod: affiliate.payoutMethod,
      encryptedWalletAddress: affiliate.encryptedWalletAddress,
      walletIv: affiliate.walletIv,
      walletTag: affiliate.walletTag,
      achAccountHolderName: affiliate.achAccountHolderName,
      achBankName: affiliate.achBankName,
      achAccountType: affiliate.achAccountType,
      encryptedAchRoutingNumber: affiliate.encryptedAchRoutingNumber,
      achRoutingNumberIv: affiliate.achRoutingNumberIv,
      achRoutingNumberTag: affiliate.achRoutingNumberTag,
      achRoutingNumberLast4: affiliate.achRoutingNumberLast4,
      encryptedAchAccountNumber: affiliate.encryptedAchAccountNumber,
      achAccountNumberIv: affiliate.achAccountNumberIv,
      achAccountNumberTag: affiliate.achAccountNumberTag,
      achAccountNumberLast4: affiliate.achAccountNumberLast4,
    };
  }
}

function serializeWeeklyBatch(row: WeeklyPayoutBatchRecord) {
  const walletAddress =
    row.payoutMethod === CRYPTO_PAYOUT_METHOD ? decryptWalletSnapshot(row) : "";

  return {
    ...row,
    walletAddress,
    paymentReference: row.paymentReference ?? row.txHash ?? null,
    destinationPreview: buildPayoutDestinationPreview({
      payoutMethod: row.payoutMethod,
      walletAddress,
      achAccountHolderName: row.achAccountHolderName,
      achBankName: row.achBankName,
      achAccountType: row.achAccountType,
      achRoutingNumberLast4: row.achRoutingNumberLast4,
      achAccountNumberLast4: row.achAccountNumberLast4,
      encryptedAchRoutingNumber: row.encryptedAchRoutingNumber,
      achRoutingNumberIv: row.achRoutingNumberIv,
      achRoutingNumberTag: row.achRoutingNumberTag,
      encryptedAchAccountNumber: row.encryptedAchAccountNumber,
      achAccountNumberIv: row.achAccountNumberIv,
      achAccountNumberTag: row.achAccountNumberTag,
    }),
  } satisfies WeeklyPayoutBatchWithWallet;
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
        eq(affiliateWeeklyPayouts.batchType, "weekly"),
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
    .leftJoin(
      affiliateWeeklyPayouts,
      eq(affiliatePayouts.weeklyPayoutId, affiliateWeeklyPayouts.id),
    )
    .where(
      and(
        inArray(affiliatePayouts.status, ["pending", "approved"]),
        eq(affiliatePayouts.payoutPeriodStart, period.start),
        eq(affiliatePayouts.payoutPeriodEnd, period.end),
        or(
          isNull(affiliatePayouts.weeklyPayoutId),
          eq(affiliateWeeklyPayouts.batchType, "weekly"),
        ),
      ),
    )
    .orderBy(desc(affiliatePayouts.earnedAt), desc(affiliatePayouts.createdAt));
}

async function loadPayNowBatchGroupingRows() {
  return db
    .select({
      earning: affiliatePayouts,
      affiliate: affiliates,
      batch: affiliateWeeklyPayouts,
    })
    .from(affiliatePayouts)
    .leftJoin(affiliates, eq(affiliatePayouts.affiliateId, affiliates.id))
    .leftJoin(
      affiliateWeeklyPayouts,
      eq(affiliatePayouts.weeklyPayoutId, affiliateWeeklyPayouts.id),
    )
    .where(
      and(
        inArray(affiliatePayouts.status, ["pending", "approved"]),
        or(
          isNull(affiliatePayouts.weeklyPayoutId),
          and(
            eq(affiliateWeeklyPayouts.batchType, "pay_now"),
            inArray(affiliateWeeklyPayouts.status, ["pending", "approved"]),
          ),
        ),
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
    summaryEntries.filter(Boolean) as Array<
      readonly [string, CommissionMonthSummary]
    >,
  );
}

async function getExistingOpenPayNowBatchForGroup(args: {
  affiliateId: string;
  commissionMonthKey: string;
}) {
  const [row] = await db
    .select()
    .from(affiliateWeeklyPayouts)
    .where(
      and(
        eq(affiliateWeeklyPayouts.affiliateId, args.affiliateId),
        eq(affiliateWeeklyPayouts.commissionMonthKey, args.commissionMonthKey),
        eq(affiliateWeeklyPayouts.batchType, "pay_now"),
        inArray(affiliateWeeklyPayouts.status, ["pending", "approved"]),
      ),
    )
    .orderBy(desc(affiliateWeeklyPayouts.createdAt))
    .limit(1);

  return row ?? null;
}

function getEarningTimestamp(earning: AffiliateEarningRecord) {
  return earning.earnedAt ?? earning.createdAt;
}

function getPayNowPeriod(rows: BatchGroupingRow[], now: Date) {
  const start = rows.reduce((earliest, row) => {
    const earnedAt = getEarningTimestamp(row.earning);
    return earnedAt < earliest ? earnedAt : earliest;
  }, getEarningTimestamp(rows[0]!.earning));

  return {
    start,
    end: now,
    timezone: getDefaultPayoutTimezone(),
  };
}

export async function generateWeeklyPayoutBatches(args?: {
  periodDate?: string | Date;
}) {
  await backfillLegacyOpenAffiliateEarnings();

  const period = getPeriodFromDate(args?.periodDate);
  const initialRows = (await loadBatchGroupingRows(
    period,
  )) as BatchGroupingRow[];
  const summaryByGroupKey = await getCommissionSummaryMap(initialRows);
  const refreshedRows = (await loadBatchGroupingRows(
    period,
  )) as BatchGroupingRow[];
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
    if (
      existingBatch?.status === "paid" ||
      existingBatch?.status === "rejected"
    ) {
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
            row.earning.normalizedCommissionAmount ??
              row.earning.commissionAmount,
          ),
        0,
      ),
    );
    const payoutSnapshot = buildAffiliateBatchSnapshot(firstRow.affiliate);
    const settlementAmounts = calculatePayoutSettlementAmounts({
      grossAmount: totalNormalizedCommissionAmount,
      payoutMethod: payoutSnapshot.payoutMethod,
    });
    const approvedAt = existingBatch?.approvedAt ?? new Date();

    const [batch] = await db
      .insert(affiliateWeeklyPayouts)
      .values({
        batchType: "weekly",
        affiliateId: firstRow.earning.affiliateId,
        affiliateCode: firstRow.earning.affiliateCode,
        commissionMonthKey: firstRow.earning.commissionMonthKey,
        periodStart: period.start,
        periodEnd: period.end,
        periodTimezone: period.timezone,
        earningCount: rows.length,
        totalNormalizedCommissionAmount,
        payoutCurrencyCode: "USD",
        ...payoutSnapshot,
        currentTierKey: summary.tierKey,
        currentTierLabel: summary.tierLabel,
        nextTierKey: summary.nextTierKey,
        nextTierLabel: summary.nextTierLabel,
        amountToNextTier: summary.amountToNextTier,
        effectiveRate: summary.effectiveRate,
        payoutFeeRate: settlementAmounts.payoutFeeRate,
        payoutFeeAmount: settlementAmounts.payoutFeeAmount,
        netPayoutAmount: settlementAmounts.netPayoutAmount,
        paymentReference:
          existingBatch?.paymentReference ?? existingBatch?.txHash ?? null,
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
          affiliateWeeklyPayouts.batchType,
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
          ...payoutSnapshot,
          payoutFeeRate: settlementAmounts.payoutFeeRate,
          payoutFeeAmount: settlementAmounts.payoutFeeAmount,
          netPayoutAmount: settlementAmounts.netPayoutAmount,
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

export async function generatePayNowPayoutBatches() {
  await backfillLegacyOpenAffiliateEarnings();

  const initialRows =
    (await loadPayNowBatchGroupingRows()) as PayNowBatchGroupingRow[];
  const summaryByGroupKey = await getCommissionSummaryMap(initialRows);
  const refreshedRows =
    (await loadPayNowBatchGroupingRows()) as PayNowBatchGroupingRow[];
  const groupedRows = groupRowsByAffiliateMonth(refreshedRows);
  const batches: WeeklyPayoutBatchRecord[] = [];
  const now = new Date();

  for (const [groupKey, rows] of groupedRows.entries()) {
    const [firstRow] = rows;
    if (!firstRow?.affiliate || !firstRow.earning.commissionMonthKey) {
      continue;
    }

    const existingBatch = await getExistingOpenPayNowBatchForGroup({
      affiliateId: firstRow.earning.affiliateId,
      commissionMonthKey: firstRow.earning.commissionMonthKey,
    });
    const summary =
      summaryByGroupKey.get(groupKey) ||
      (
        await getAffiliateCommissionOverview({
          affiliateId: firstRow.earning.affiliateId,
          monthKey: firstRow.earning.commissionMonthKey,
        })
      ).summary;
    const earningIds = rows.map((row) => row.earning.id);
    const period = getPayNowPeriod(rows, now);
    const totalNormalizedCommissionAmount = formatAmount(
      rows.reduce(
        (sum, row) =>
          sum +
          parseAmount(
            row.earning.normalizedCommissionAmount ??
              row.earning.commissionAmount,
          ),
        0,
      ),
    );
    const payoutSnapshot = buildAffiliateBatchSnapshot(firstRow.affiliate);
    const settlementAmounts = calculatePayoutSettlementAmounts({
      grossAmount: totalNormalizedCommissionAmount,
      payoutMethod: payoutSnapshot.payoutMethod,
    });
    const approvedAt = existingBatch?.approvedAt ?? now;
    const batchValues = {
      affiliateCode: firstRow.earning.affiliateCode,
      periodStart: period.start,
      periodEnd: period.end,
      periodTimezone: period.timezone,
      earningCount: rows.length,
      totalNormalizedCommissionAmount,
      payoutCurrencyCode: "USD",
      ...payoutSnapshot,
      currentTierKey: summary.tierKey,
      currentTierLabel: summary.tierLabel,
      nextTierKey: summary.nextTierKey,
      nextTierLabel: summary.nextTierLabel,
      amountToNextTier: summary.amountToNextTier,
      effectiveRate: summary.effectiveRate,
      payoutFeeRate: settlementAmounts.payoutFeeRate,
      payoutFeeAmount: settlementAmounts.payoutFeeAmount,
      netPayoutAmount: settlementAmounts.netPayoutAmount,
      paymentReference:
        existingBatch?.paymentReference ?? existingBatch?.txHash ?? null,
      status: "approved" as const,
      approvedAt,
      rejectedAt: null,
      updatedAt: now,
    };

    const [batch] = existingBatch
      ? await db
          .update(affiliateWeeklyPayouts)
          .set(batchValues)
          .where(eq(affiliateWeeklyPayouts.id, existingBatch.id))
          .returning()
      : await db
          .insert(affiliateWeeklyPayouts)
          .values({
            batchType: "pay_now",
            affiliateId: firstRow.earning.affiliateId,
            commissionMonthKey: firstRow.earning.commissionMonthKey,
            adminNotes: null,
            ...batchValues,
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
          updatedAt: now,
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
        updatedAt: now,
      })
      .where(inArray(affiliatePayouts.id, earningIds));

    batches.push(batch);
  }

  return {
    batches,
  };
}

export async function listWeeklyPayoutBatches(args?: {
  periodDate?: string | Date;
  affiliateId?: string;
  status?: WeeklyPayoutBatchRecord["status"];
  batchType?: WeeklyPayoutBatchRecord["batchType"];
  limit?: number;
}) {
  const period = args?.periodDate ? getPeriodFromDate(args.periodDate) : null;

  try {
    const conditions = [];

    if (args?.affiliateId) {
      conditions.push(eq(affiliateWeeklyPayouts.affiliateId, args.affiliateId));
    }
    if (args?.status) {
      conditions.push(eq(affiliateWeeklyPayouts.status, args.status));
    }
    if (args?.batchType) {
      conditions.push(eq(affiliateWeeklyPayouts.batchType, args.batchType));
    }
    if (period) {
      conditions.push(eq(affiliateWeeklyPayouts.periodStart, period.start));
      conditions.push(eq(affiliateWeeklyPayouts.periodEnd, period.end));
    }

    const rows = await db
      .select()
      .from(affiliateWeeklyPayouts)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        desc(affiliateWeeklyPayouts.periodStart),
        desc(affiliateWeeklyPayouts.createdAt),
      )
      .limit(args?.limit ?? 500);

    return rows.map(serializeWeeklyBatch);
  } catch (error) {
    logWeeklyPayoutError("list", error, args?.affiliateId);
    return [];
  }
}

export async function listPayNowPayoutBatches(args?: {
  affiliateId?: string;
  status?: WeeklyPayoutBatchRecord["status"];
  limit?: number;
}) {
  return listWeeklyPayoutBatches({
    affiliateId: args?.affiliateId,
    status: args?.status,
    batchType: "pay_now",
    limit: args?.limit,
  });
}

export async function getWeeklyPayoutBatchById(batchId: string) {
  const [row] = await db
    .select({
      batch: affiliateWeeklyPayouts,
      affiliateEmail: affiliates.email,
      affiliateName: affiliates.name,
    })
    .from(affiliateWeeklyPayouts)
    .innerJoin(
      affiliates,
      eq(affiliateWeeklyPayouts.affiliateId, affiliates.id),
    )
    .where(eq(affiliateWeeklyPayouts.id, batchId))
    .limit(1);

  if (!row) {
    return null;
  }

  const earnings = await db
    .select({
      earning: affiliatePayouts,
      orderAccessKey: checkoutOrders.accessKey,
    })
    .from(affiliatePayouts)
    .leftJoin(
      checkoutOrders,
      eq(affiliatePayouts.orderId, checkoutOrders.orderId),
    )
    .where(eq(affiliatePayouts.weeklyPayoutId, batchId))
    .orderBy(desc(affiliatePayouts.earnedAt), desc(affiliatePayouts.createdAt));

  return {
    ...serializeWeeklyBatch(row.batch),
    affiliateEmail: row.affiliateEmail,
    affiliateName: row.affiliateName,
    destinationDetail: buildAdminPayoutDestinationDetail({
      payoutMethod: row.batch.payoutMethod,
      walletAddress:
        row.batch.payoutMethod === CRYPTO_PAYOUT_METHOD
          ? decryptWalletSnapshot(row.batch)
          : "",
      achAccountHolderName: row.batch.achAccountHolderName,
      achBankName: row.batch.achBankName,
      achAccountType: row.batch.achAccountType,
      achRoutingNumberLast4: row.batch.achRoutingNumberLast4,
      achAccountNumberLast4: row.batch.achAccountNumberLast4,
      encryptedAchRoutingNumber: row.batch.encryptedAchRoutingNumber,
      achRoutingNumberIv: row.batch.achRoutingNumberIv,
      achRoutingNumberTag: row.batch.achRoutingNumberTag,
      encryptedAchAccountNumber: row.batch.encryptedAchAccountNumber,
      achAccountNumberIv: row.batch.achAccountNumberIv,
      achAccountNumberTag: row.batch.achAccountNumberTag,
    }),
    earnings: earnings.map((entry) => ({
      ...entry.earning,
      orderAccessKey: entry.orderAccessKey,
    })),
  } satisfies WeeklyPayoutBatchDetail;
}

async function recalculateAffiliateWeeklyPayoutBatch(batchId: string) {
  const [batch] = await db
    .select()
    .from(affiliateWeeklyPayouts)
    .where(eq(affiliateWeeklyPayouts.id, batchId))
    .limit(1);

  if (!batch || batch.status === "paid" || batch.status === "rejected") {
    return;
  }

  const remaining = await db
    .select()
    .from(affiliatePayouts)
    .where(
      and(
        eq(affiliatePayouts.weeklyPayoutId, batchId),
        inArray(affiliatePayouts.status, ["pending", "approved"]),
      ),
    );
  const totalNormalizedCommissionAmount = formatAmount(
    remaining.reduce(
      (sum, earning) =>
        sum +
        parseAmount(
          earning.normalizedCommissionAmount ?? earning.commissionAmount,
        ),
      0,
    ),
  );
  const settlementAmounts = calculatePayoutSettlementAmounts({
    grossAmount: totalNormalizedCommissionAmount,
    payoutMethod: batch.payoutMethod,
  });

  await db
    .update(affiliateWeeklyPayouts)
    .set({
      earningCount: remaining.length,
      totalNormalizedCommissionAmount,
      payoutFeeRate: settlementAmounts.payoutFeeRate,
      payoutFeeAmount: settlementAmounts.payoutFeeAmount,
      netPayoutAmount: settlementAmounts.netPayoutAmount,
      status: remaining.length > 0 ? batch.status : "rejected",
      rejectedAt: remaining.length > 0 ? batch.rejectedAt : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(affiliateWeeklyPayouts.id, batchId));
}

export async function rejectWeeklyPayoutEarning(
  earningId: string,
  notes?: string,
) {
  const [earning] = await db
    .select()
    .from(affiliatePayouts)
    .where(eq(affiliatePayouts.id, earningId))
    .limit(1);

  if (!earning) {
    throw new Error("Payout earning not found.");
  }
  if (earning.status === "paid") {
    throw new Error("Paid payout earnings cannot be rejected.");
  }

  const batchId = earning.weeklyPayoutId;
  const rejectedAt = new Date();

  await db
    .update(affiliatePayouts)
    .set({
      weeklyPayoutId: null,
      status: "rejected",
      adminNotes: notes?.trim() || null,
      rejectedAt,
      updatedAt: new Date(),
    })
    .where(eq(affiliatePayouts.id, earningId));

  if (earning.commissionMonthKey) {
    await syncAffiliateCommissionMonth({
      affiliateId: earning.affiliateId,
      monthKey: earning.commissionMonthKey,
      eventType: "recalculated",
      notes: notes || `Rejected affiliate earning ${earning.orderId}.`,
      recordEvent: true,
    });
  }

  if (batchId) {
    await recalculateAffiliateWeeklyPayoutBatch(batchId);
  }
}

export async function markWeeklyPayoutBatchPaid(
  batchId: string,
  paymentReference: string,
) {
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

  if (
    !hasCompletePayoutDestination({
      payoutMethod: batch.payoutMethod,
      walletAddress: batch.walletAddress,
      achAccountHolderName: batch.achAccountHolderName,
      achBankName: batch.achBankName,
      achAccountType: batch.achAccountType,
      achRoutingNumberLast4: batch.achRoutingNumberLast4,
      achAccountNumberLast4: batch.achAccountNumberLast4,
      encryptedAchRoutingNumber: batch.encryptedAchRoutingNumber,
      achRoutingNumberIv: batch.achRoutingNumberIv,
      achRoutingNumberTag: batch.achRoutingNumberTag,
      encryptedAchAccountNumber: batch.encryptedAchAccountNumber,
      achAccountNumberIv: batch.achAccountNumberIv,
      achAccountNumberTag: batch.achAccountNumberTag,
    })
  ) {
    throw new Error("Payout destination is missing.");
  }

  const paidAt = new Date();
  const normalizedReference = paymentReference.trim();
  const txHash =
    batch.payoutMethod === CRYPTO_PAYOUT_METHOD ? normalizedReference : null;

  await db
    .update(affiliateWeeklyPayouts)
    .set({
      status: "paid",
      txHash,
      paymentReference: normalizedReference,
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
    payoutAmount: batch.netPayoutAmount,
    payoutPeriod: formatPayoutPeriodLabel({
      start: batch.periodStart,
      end: batch.periodEnd,
      timezone: batch.periodTimezone,
    }),
    currentTier:
      batch.currentTierLabel || batch.currentTierKey || "Current tier",
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

export async function getWeeklyPayoutBatchPeriodOverview(
  periodDate?: string | Date,
) {
  await backfillLegacyOpenAffiliateEarnings();
  const period = getPeriodFromDate(periodDate);
  const batches = await listWeeklyPayoutBatches({
    periodDate: period.start,
    batchType: "weekly",
  });

  return {
    period,
    batches,
  };
}
