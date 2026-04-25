import { and, desc, eq, inArray, isNull, notInArray, or } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  affiliates,
  checkoutOrders,
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
  getDefaultPayoutTimezone,
  type WeeklyPayoutPeriod,
} from "@/lib/checkout/payout-periods";
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
import { sendPromoterWeeklyPayoutSentEmail } from "@/lib/email/promoter-emails";

export type PromoterWeeklyPayoutBatchRecord =
  typeof promoterWeeklyPayouts.$inferSelect;

export type PromoterWeeklyPayoutBatchWithWallet =
  PromoterWeeklyPayoutBatchRecord & {
    walletAddress: string;
    destinationPreview: PayoutDestinationPreview;
    paymentReference: string | null;
    promoterName?: string;
    promoterEmail?: string;
  };

export type PromoterWeeklyPayoutEarningDetail = PromoterEarningRecord & {
  growthPartnerName: string | null;
  growthPartnerEmail: string | null;
  orderAccessKey: string | null;
};

export type PromoterWeeklyPayoutBatchDetail =
  PromoterWeeklyPayoutBatchWithWallet & {
    promoterEmail: string;
    promoterName: string;
    destinationDetail: AdminPayoutDestinationDetail;
    earnings: PromoterWeeklyPayoutEarningDetail[];
  };

type BatchGroupingRow = {
  earning: PromoterEarningRecord;
  promoter: typeof promoters.$inferSelect | null;
};

type PayNowBatchGroupingRow = BatchGroupingRow & {
  batch: PromoterWeeklyPayoutBatchRecord | null;
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

function buildPromoterBatchSnapshot(promoter: typeof promoters.$inferSelect) {
  try {
    return createBatchPayoutSnapshot({
      payoutMethod: promoter.payoutMethod,
      walletAddress: decryptWalletSnapshot(promoter),
      achAccountHolderName: promoter.achAccountHolderName,
      achBankName: promoter.achBankName,
      achAccountType: promoter.achAccountType,
      achRoutingNumber: decryptOptionalValue({
        ciphertext: promoter.encryptedAchRoutingNumber,
        iv: promoter.achRoutingNumberIv,
        tag: promoter.achRoutingNumberTag,
      }),
      achAccountNumber: decryptOptionalValue({
        ciphertext: promoter.encryptedAchAccountNumber,
        iv: promoter.achAccountNumberIv,
        tag: promoter.achAccountNumberTag,
      }),
    });
  } catch {
    return {
      payoutMethod: promoter.payoutMethod,
      encryptedWalletAddress: promoter.encryptedWalletAddress,
      walletIv: promoter.walletIv,
      walletTag: promoter.walletTag,
      achAccountHolderName: promoter.achAccountHolderName,
      achBankName: promoter.achBankName,
      achAccountType: promoter.achAccountType,
      encryptedAchRoutingNumber: promoter.encryptedAchRoutingNumber,
      achRoutingNumberIv: promoter.achRoutingNumberIv,
      achRoutingNumberTag: promoter.achRoutingNumberTag,
      achRoutingNumberLast4: promoter.achRoutingNumberLast4,
      encryptedAchAccountNumber: promoter.encryptedAchAccountNumber,
      achAccountNumberIv: promoter.achAccountNumberIv,
      achAccountNumberTag: promoter.achAccountNumberTag,
      achAccountNumberLast4: promoter.achAccountNumberLast4,
    };
  }
}

function serializePromoterBatch(
  row: PromoterWeeklyPayoutBatchRecord,
  promoterMeta?: { promoterName?: string; promoterEmail?: string },
) {
  const walletAddress =
    row.payoutMethod === CRYPTO_PAYOUT_METHOD ? decryptWalletSnapshot(row) : "";

  return {
    ...row,
    ...promoterMeta,
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
  } satisfies PromoterWeeklyPayoutBatchWithWallet;
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
        eq(promoterWeeklyPayouts.batchType, "weekly"),
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
    .leftJoin(
      promoterWeeklyPayouts,
      eq(promoterPayouts.weeklyPayoutId, promoterWeeklyPayouts.id),
    )
    .where(
      and(
        inArray(promoterPayouts.status, ["pending", "approved"]),
        eq(promoterPayouts.payoutPeriodStart, period.start),
        eq(promoterPayouts.payoutPeriodEnd, period.end),
        or(
          isNull(promoterPayouts.weeklyPayoutId),
          eq(promoterWeeklyPayouts.batchType, "weekly"),
        ),
      ),
    )
    .orderBy(desc(promoterPayouts.earnedAt), desc(promoterPayouts.createdAt));
}

async function loadPayNowBatchGroupingRows() {
  return db
    .select({
      earning: promoterPayouts,
      promoter: promoters,
      batch: promoterWeeklyPayouts,
    })
    .from(promoterPayouts)
    .leftJoin(promoters, eq(promoterPayouts.promoterId, promoters.id))
    .leftJoin(
      promoterWeeklyPayouts,
      eq(promoterPayouts.weeklyPayoutId, promoterWeeklyPayouts.id),
    )
    .where(
      and(
        inArray(promoterPayouts.status, ["pending", "approved"]),
        or(
          isNull(promoterPayouts.weeklyPayoutId),
          and(
            eq(promoterWeeklyPayouts.batchType, "pay_now"),
            inArray(promoterWeeklyPayouts.status, ["pending", "approved"]),
          ),
        ),
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

async function getExistingOpenPayNowBatchForGroup(args: {
  promoterId: string;
  commissionMonthKey: string;
}) {
  const [row] = await db
    .select()
    .from(promoterWeeklyPayouts)
    .where(
      and(
        eq(promoterWeeklyPayouts.promoterId, args.promoterId),
        eq(promoterWeeklyPayouts.commissionMonthKey, args.commissionMonthKey),
        eq(promoterWeeklyPayouts.batchType, "pay_now"),
        inArray(promoterWeeklyPayouts.status, ["pending", "approved"]),
      ),
    )
    .orderBy(desc(promoterWeeklyPayouts.createdAt))
    .limit(1);

  return row ?? null;
}

function getEarningTimestamp(earning: PromoterEarningRecord) {
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
    if (
      existingBatch?.status === "paid" ||
      existingBatch?.status === "rejected"
    ) {
      batches.push(existingBatch);
      continue;
    }

    const earningIds = rowsForGroup.map((row) => row.earning.id);
    const totalNormalizedCommissionAmount = formatAmount(
      rowsForGroup.reduce(
        (sum, row) =>
          sum +
          parseAmount(
            row.earning.normalizedCommissionAmount ??
              row.earning.commissionAmount,
          ),
        0,
      ),
    );
    const payoutSnapshot = buildPromoterBatchSnapshot(firstRow.promoter);
    const settlementAmounts = calculatePayoutSettlementAmounts({
      grossAmount: totalNormalizedCommissionAmount,
      payoutMethod: payoutSnapshot.payoutMethod,
    });
    const approvedAt = existingBatch?.approvedAt ?? new Date();

    const [batch] = await db
      .insert(promoterWeeklyPayouts)
      .values({
        batchType: "weekly",
        promoterId: firstRow.earning.promoterId,
        commissionMonthKey: firstRow.earning.commissionMonthKey,
        periodStart: period.start,
        periodEnd: period.end,
        periodTimezone: period.timezone,
        earningCount: rowsForGroup.length,
        totalNormalizedCommissionAmount,
        payoutCurrencyCode: "USD",
        ...payoutSnapshot,
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
          promoterWeeklyPayouts.promoterId,
          promoterWeeklyPayouts.commissionMonthKey,
          promoterWeeklyPayouts.periodStart,
          promoterWeeklyPayouts.periodEnd,
          promoterWeeklyPayouts.batchType,
        ],
        set: {
          earningCount: rowsForGroup.length,
          totalNormalizedCommissionAmount,
          payoutCurrencyCode: "USD",
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

export async function generatePromoterPayNowPayoutBatches() {
  await backfillLegacyOpenPromoterEarnings();

  const rows =
    (await loadPayNowBatchGroupingRows()) as PayNowBatchGroupingRow[];
  const groupedRows = groupRowsByPromoterMonth(rows);
  const batches: PromoterWeeklyPayoutBatchRecord[] = [];
  const now = new Date();

  for (const rowsForGroup of groupedRows.values()) {
    const [firstRow] = rowsForGroup;
    if (!firstRow?.promoter || !firstRow.earning.commissionMonthKey) {
      continue;
    }

    const existingBatch = await getExistingOpenPayNowBatchForGroup({
      promoterId: firstRow.earning.promoterId,
      commissionMonthKey: firstRow.earning.commissionMonthKey,
    });
    const earningIds = rowsForGroup.map((row) => row.earning.id);
    const period = getPayNowPeriod(rowsForGroup, now);
    const totalNormalizedCommissionAmount = formatAmount(
      rowsForGroup.reduce(
        (sum, row) =>
          sum +
          parseAmount(
            row.earning.normalizedCommissionAmount ??
              row.earning.commissionAmount,
          ),
        0,
      ),
    );
    const payoutSnapshot = buildPromoterBatchSnapshot(firstRow.promoter);
    const settlementAmounts = calculatePayoutSettlementAmounts({
      grossAmount: totalNormalizedCommissionAmount,
      payoutMethod: payoutSnapshot.payoutMethod,
    });
    const approvedAt = existingBatch?.approvedAt ?? now;
    const batchValues = {
      periodStart: period.start,
      periodEnd: period.end,
      periodTimezone: period.timezone,
      earningCount: rowsForGroup.length,
      totalNormalizedCommissionAmount,
      payoutCurrencyCode: "USD",
      ...payoutSnapshot,
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
          .update(promoterWeeklyPayouts)
          .set(batchValues)
          .where(eq(promoterWeeklyPayouts.id, existingBatch.id))
          .returning()
      : await db
          .insert(promoterWeeklyPayouts)
          .values({
            batchType: "pay_now",
            promoterId: firstRow.earning.promoterId,
            commissionMonthKey: firstRow.earning.commissionMonthKey,
            adminNotes: null,
            ...batchValues,
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
          updatedAt: now,
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
        updatedAt: now,
      })
      .where(inArray(promoterPayouts.id, earningIds));

    batches.push(batch);
  }

  return {
    batches,
  };
}

export async function listPromoterWeeklyPayoutBatches(args?: {
  periodDate?: string | Date;
  promoterId?: string;
  status?: PromoterWeeklyPayoutBatchRecord["status"];
  batchType?: PromoterWeeklyPayoutBatchRecord["batchType"];
  limit?: number;
}) {
  const period = args?.periodDate ? getPeriodFromDate(args.periodDate) : null;
  const conditions = [];

  if (args?.promoterId) {
    conditions.push(eq(promoterWeeklyPayouts.promoterId, args.promoterId));
  }
  if (args?.status) {
    conditions.push(eq(promoterWeeklyPayouts.status, args.status));
  }
  if (args?.batchType) {
    conditions.push(eq(promoterWeeklyPayouts.batchType, args.batchType));
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
    .orderBy(
      desc(promoterWeeklyPayouts.periodStart),
      desc(promoterWeeklyPayouts.createdAt),
    )
    .limit(args?.limit ?? 500);

  return rows.map((row) => ({
    ...serializePromoterBatch(row.batch, {
      promoterName: row.promoterName,
      promoterEmail: row.promoterEmail,
    }),
  }));
}

export async function listPromoterPayNowPayoutBatches(args?: {
  promoterId?: string;
  status?: PromoterWeeklyPayoutBatchRecord["status"];
  limit?: number;
}) {
  return listPromoterWeeklyPayoutBatches({
    promoterId: args?.promoterId,
    status: args?.status,
    batchType: "pay_now",
    limit: args?.limit,
  });
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
      orderAccessKey: checkoutOrders.accessKey,
    })
    .from(promoterPayouts)
    .leftJoin(affiliates, eq(promoterPayouts.affiliateId, affiliates.id))
    .leftJoin(
      checkoutOrders,
      eq(promoterPayouts.orderId, checkoutOrders.orderId),
    )
    .where(eq(promoterPayouts.weeklyPayoutId, batchId))
    .orderBy(desc(promoterPayouts.earnedAt), desc(promoterPayouts.createdAt));

  return {
    ...serializePromoterBatch(row.batch, {
      promoterName: row.promoterName,
      promoterEmail: row.promoterEmail,
    }),
    promoterName: row.promoterName ?? "",
    promoterEmail: row.promoterEmail ?? "",
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
      growthPartnerName: entry.growthPartnerName,
      growthPartnerEmail: entry.growthPartnerEmail,
      orderAccessKey: entry.orderAccessKey,
    })),
  } satisfies PromoterWeeklyPayoutBatchDetail;
}

async function recalculatePromoterWeeklyPayoutBatch(batchId: string) {
  const [batch] = await db
    .select()
    .from(promoterWeeklyPayouts)
    .where(eq(promoterWeeklyPayouts.id, batchId))
    .limit(1);

  if (!batch || batch.status === "paid" || batch.status === "rejected") {
    return;
  }

  const remaining = await db
    .select()
    .from(promoterPayouts)
    .where(
      and(
        eq(promoterPayouts.weeklyPayoutId, batchId),
        inArray(promoterPayouts.status, ["pending", "approved"]),
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
    .update(promoterWeeklyPayouts)
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
    .where(eq(promoterWeeklyPayouts.id, batchId));
}

export async function rejectPromoterWeeklyPayoutEarning(
  earningId: string,
  notes?: string,
) {
  const [earning] = await db
    .select()
    .from(promoterPayouts)
    .where(eq(promoterPayouts.id, earningId))
    .limit(1);

  if (!earning) {
    throw new Error("Promoter payout earning not found.");
  }
  if (earning.status === "paid") {
    throw new Error("Paid promoter payout earnings cannot be rejected.");
  }

  const batchId = earning.weeklyPayoutId;

  await db
    .update(promoterPayouts)
    .set({
      weeklyPayoutId: null,
      status: "rejected",
      adminNotes: notes?.trim() || null,
      rejectedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(promoterPayouts.id, earningId));

  if (batchId) {
    await recalculatePromoterWeeklyPayoutBatch(batchId);
  }
}

export async function markPromoterWeeklyPayoutBatchPaid(
  batchId: string,
  paymentReference: string,
) {
  const batch = await getPromoterWeeklyPayoutBatchById(batchId);
  if (!batch) {
    throw new Error("Promoter weekly payout batch not found.");
  }

  if (batch.status === "paid") {
    throw new Error(
      "Promoter weekly payout batch has already been marked paid.",
    );
  }

  if (batch.status === "rejected") {
    throw new Error(
      "Rejected promoter weekly payout batches cannot be marked paid.",
    );
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
    .update(promoterWeeklyPayouts)
    .set({
      status: "paid",
      txHash,
      paymentReference: normalizedReference,
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
    payoutAmount: batch.netPayoutAmount,
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
    batchType: "weekly",
  });

  return {
    period,
    batches,
  };
}
