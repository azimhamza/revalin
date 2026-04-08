import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { affiliatePayouts, affiliates } from "@/lib/db/schema";
import { getCheckoutOrder } from "@/lib/checkout/order-store";
import type { CheckoutOrderAffiliate, CheckoutOrderRecord } from "@/lib/checkout/types";
import {
  formatAmount,
  parseAmount,
  parseRate,
} from "@/lib/checkout/affiliate-math";
import { normalizeRevenueToUsd } from "@/lib/checkout/affiliate-revenue-normalization";
import { buildWeeklyPayoutPeriod } from "@/lib/checkout/payout-periods";
import { convertToUsd } from "@/lib/checkout/shieldclimb";
import {
  getCommissionMonthKey,
  hydrateOrderAffiliateCommissionMonth,
  syncAffiliateCommissionMonth,
} from "@/lib/checkout/commission-service";
import { sendAffiliateEarnedEmail } from "@/lib/email/affiliate-payout-emails";

export type AffiliateEarningRecord = typeof affiliatePayouts.$inferSelect;

export type AffiliateEarningWithWallet = AffiliateEarningRecord & {
  walletAddress: string;
};

function getOrderTotal(order: CheckoutOrderRecord) {
  return parseAmount(order.totals.totalAmount.amount);
}

export async function normalizeAffiliateRevenueToUsd(
  order: CheckoutOrderRecord,
  options?: {
    convertCurrency?: (args: {
      amount: number;
      fromCurrency: string;
    }) => Promise<{ value_coin: string }>;
  },
) {
  return normalizeRevenueToUsd({
    amount: getOrderTotal(order),
    currencyCode:
      order.currencyCode?.trim().toUpperCase() ||
      order.totals.totalAmount.currencyCode?.trim().toUpperCase() ||
      "USD",
    convertCurrency: options?.convertCurrency ?? convertToUsd,
  });
}

export async function getAffiliateEarningByOrderId(orderId: string) {
  const [row] = await db
    .select()
    .from(affiliatePayouts)
    .where(eq(affiliatePayouts.orderId, orderId))
    .limit(1);

  return row ?? null;
}

export async function getAffiliateEarningById(earningId: string) {
  const [row] = await db
    .select()
    .from(affiliatePayouts)
    .where(eq(affiliatePayouts.id, earningId))
    .limit(1);

  return row ?? null;
}

export async function getAffiliateEarningsForAffiliate(
  affiliateId: string,
  limit = 500,
) {
  return db
    .select()
    .from(affiliatePayouts)
    .where(eq(affiliatePayouts.affiliateId, affiliateId))
    .orderBy(desc(affiliatePayouts.earnedAt), desc(affiliatePayouts.createdAt))
    .limit(limit);
}

export async function getAllAffiliateEarnings(limit = 500) {
  return db
    .select({
      earning: affiliatePayouts,
      encryptedWalletAddress: affiliates.encryptedWalletAddress,
      walletIv: affiliates.walletIv,
      walletTag: affiliates.walletTag,
    })
    .from(affiliatePayouts)
    .leftJoin(affiliates, eq(affiliatePayouts.affiliateId, affiliates.id))
    .orderBy(desc(affiliatePayouts.earnedAt), desc(affiliatePayouts.createdAt))
    .limit(limit);
}

async function sendEarnedEmailForEarning(earningId: string) {
  const [row] = await db
    .select({
      earning: affiliatePayouts,
      affiliateEmail: affiliates.email,
      affiliateName: affiliates.name,
    })
    .from(affiliatePayouts)
    .innerJoin(affiliates, eq(affiliatePayouts.affiliateId, affiliates.id))
    .where(eq(affiliatePayouts.id, earningId))
    .limit(1);

  if (!row) {
    return null;
  }

  if (row.earning.earnedEmailSentAt) {
    return row.earning;
  }

  await sendAffiliateEarnedEmail({
    affiliateEmail: row.affiliateEmail,
    affiliateName: row.affiliateName,
    commissionAmount:
      row.earning.normalizedCommissionAmount ?? row.earning.commissionAmount,
  });

  const [updated] = await db
    .update(affiliatePayouts)
    .set({
      earnedEmailSentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(affiliatePayouts.id, earningId))
    .returning();

  return updated ?? row.earning;
}

function getInitialCommissionRate(affiliate: CheckoutOrderAffiliate) {
  return affiliate.commissionRateAtPurchase || affiliate.commissionRate;
}

function getEarningCommissionMonthKey(
  affiliate: CheckoutOrderAffiliate,
  earnedAt: Date,
) {
  return affiliate.commissionMonthKey || getCommissionMonthKey(earnedAt);
}

export async function createAffiliateEarningFromOrder(
  orderId: string,
  provider: string,
) {
  const existing = await getAffiliateEarningByOrderId(orderId);
  if (existing) {
    if (!existing.earnedEmailSentAt) {
      await sendEarnedEmailForEarning(existing.id).catch((error) => {
        console.error("[AFFILIATE-EARNING-EMAIL]", error);
      });
    }
    return existing;
  }

  const order = await getCheckoutOrder(orderId);
  if (!order?.affiliate) {
    return null;
  }

  const affiliate = order.affiliate;
  const earnedAt =
    order.payment.updatedAt && !Number.isNaN(Date.parse(order.payment.updatedAt))
      ? new Date(order.payment.updatedAt)
      : new Date();
  const orderTotal = formatAmount(getOrderTotal(order));
  const normalization = await normalizeAffiliateRevenueToUsd(order);
  const commissionRate = getInitialCommissionRate(affiliate);
  const normalizedCommissionAmount = formatAmount(
    parseAmount(normalization.normalizedOrderTotal) * parseRate(commissionRate),
  );
  const period = buildWeeklyPayoutPeriod(earnedAt);
  const commissionMonthKey = getEarningCommissionMonthKey(affiliate, earnedAt);

  await db.insert(affiliatePayouts).values({
    orderId,
    affiliateId: affiliate.id,
    affiliateCode: affiliate.code,
    orderTotal,
    commissionMonthKey,
    commissionTierKey: null,
    commissionTierLabel: affiliate.commissionTierAtPurchase || null,
    commissionRate,
    commissionAmount: normalizedCommissionAmount,
    normalizedOrderTotal: normalization.normalizedOrderTotal,
    normalizedCommissionAmount,
    payoutCurrencyCode: normalization.payoutCurrencyCode,
    currencyCode: order.currencyCode || "USD",
    paymentProvider: provider,
    earnedAt,
    payoutPeriodStart: period.start,
    payoutPeriodEnd: period.end,
    payoutPeriodTimezone: period.timezone,
  });

  const { summary } = await syncAffiliateCommissionMonth({
    affiliateId: affiliate.id,
    monthKey: commissionMonthKey,
    eventType: "recalculated",
    notes: `Affiliate earning created from order ${orderId}.`,
    recordEvent: true,
  });

  await hydrateOrderAffiliateCommissionMonth({
    orderId,
    affiliateId: affiliate.id,
    monthKey: summary.monthKey,
    effectiveRate: summary.effectiveRate,
    tierLabel: summary.hasOverride
      ? `${summary.tierLabel} override`
      : summary.tierLabel,
  });

  const created = await getAffiliateEarningByOrderId(orderId);
  if (created) {
    await sendEarnedEmailForEarning(created.id).catch((error) => {
      console.error("[AFFILIATE-EARNING-EMAIL]", error);
    });
  }

  return created;
}

export async function backfillLegacyOpenAffiliateEarnings() {
  const rows = await db
    .select({
      earning: affiliatePayouts,
    })
    .from(affiliatePayouts)
    .where(
      and(
        inArray(affiliatePayouts.status, ["pending", "approved"]),
        or(
          isNull(affiliatePayouts.normalizedOrderTotal),
          isNull(affiliatePayouts.normalizedCommissionAmount),
          isNull(affiliatePayouts.earnedAt),
          isNull(affiliatePayouts.payoutPeriodStart),
          isNull(affiliatePayouts.payoutPeriodEnd),
          isNull(affiliatePayouts.commissionMonthKey),
        ),
      ),
    );

  const touchedMonthKeys = new Set<string>();

  for (const row of rows) {
    const orderRecord = await getCheckoutOrder(row.earning.orderId);
    if (!orderRecord) {
      console.error(
        `[AFFILIATE-EARNING-BACKFILL] Missing checkout order for ${row.earning.orderId}.`,
      );
      continue;
    }

    const earnedAt = row.earning.earnedAt ?? row.earning.createdAt;
    const normalization =
      row.earning.normalizedOrderTotal && row.earning.payoutCurrencyCode
        ? {
            normalizedOrderTotal: row.earning.normalizedOrderTotal,
            payoutCurrencyCode: row.earning.payoutCurrencyCode,
          }
        : await normalizeAffiliateRevenueToUsd(orderRecord);
    const commissionRate = row.earning.commissionRate;
    const normalizedCommissionAmount = formatAmount(
      parseAmount(normalization.normalizedOrderTotal) * parseRate(commissionRate),
    );
    const period = buildWeeklyPayoutPeriod(earnedAt);
    const commissionMonthKey =
      row.earning.commissionMonthKey || getCommissionMonthKey(earnedAt);

    await db
      .update(affiliatePayouts)
      .set({
        commissionMonthKey,
        commissionAmount: normalizedCommissionAmount,
        normalizedOrderTotal: normalization.normalizedOrderTotal,
        normalizedCommissionAmount,
        payoutCurrencyCode: normalization.payoutCurrencyCode,
        earnedAt,
        payoutPeriodStart: period.start,
        payoutPeriodEnd: period.end,
        payoutPeriodTimezone: period.timezone,
        updatedAt: new Date(),
      })
      .where(eq(affiliatePayouts.id, row.earning.id));

    touchedMonthKeys.add(`${row.earning.affiliateId}:${commissionMonthKey}`);
  }

  for (const key of touchedMonthKeys) {
    const [affiliateId, monthKey] = key.split(":");
    if (!affiliateId || !monthKey) continue;

    await syncAffiliateCommissionMonth({
      affiliateId,
      monthKey,
      eventType: "recalculated",
      notes: "Backfilled legacy weekly affiliate earnings.",
      recordEvent: true,
    });
  }

  return rows.length;
}
