import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { affiliates, promoterPayouts, promoters } from "@/lib/db/schema";
import { getCheckoutOrder } from "@/lib/checkout/order-store";
import type { CheckoutOrderRecord } from "@/lib/checkout/types";
import { formatAmount, parseAmount, parseRate } from "@/lib/checkout/affiliate-math";
import { normalizeAffiliateRevenueToUsd } from "@/lib/checkout/affiliate-earnings-service";
import { buildWeeklyPayoutPeriod } from "@/lib/checkout/payout-periods";
import { getCommissionMonthKey } from "@/lib/checkout/commission-service";
import { sendPromoterEarnedEmail } from "@/lib/email/promoter-emails";
import { calculatePromoterCommissionAmount } from "@/lib/checkout/promoter-math";

export type PromoterEarningRecord = typeof promoterPayouts.$inferSelect;

function getOrderTotal(order: CheckoutOrderRecord) {
  return parseAmount(order.totals.totalAmount.amount);
}

export async function getPromoterEarningByOrderId(orderId: string) {
  const [row] = await db
    .select()
    .from(promoterPayouts)
    .where(eq(promoterPayouts.orderId, orderId))
    .limit(1);

  return row ?? null;
}

export async function getPromoterEarningsForPromoter(
  promoterId: string,
  limit = 500,
) {
  return db
    .select()
    .from(promoterPayouts)
    .where(eq(promoterPayouts.promoterId, promoterId))
    .orderBy(desc(promoterPayouts.earnedAt), desc(promoterPayouts.createdAt))
    .limit(limit);
}

async function sendEarnedEmailForEarning(earningId: string) {
  const [row] = await db
    .select({
      earning: promoterPayouts,
      promoterEmail: promoters.email,
      promoterName: promoters.name,
      affiliateName: affiliates.name,
    })
    .from(promoterPayouts)
    .innerJoin(promoters, eq(promoterPayouts.promoterId, promoters.id))
    .innerJoin(affiliates, eq(promoterPayouts.affiliateId, affiliates.id))
    .where(eq(promoterPayouts.id, earningId))
    .limit(1);

  if (!row) return null;
  if (row.earning.earnedEmailSentAt) return row.earning;

  await sendPromoterEarnedEmail({
    promoterEmail: row.promoterEmail,
    promoterName: row.promoterName,
    commissionAmount:
      row.earning.normalizedCommissionAmount ?? row.earning.commissionAmount,
    growthPartnerName: row.affiliateName,
  });

  const [updated] = await db
    .update(promoterPayouts)
    .set({
      earnedEmailSentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(promoterPayouts.id, earningId))
    .returning();

  return updated ?? row.earning;
}

export async function createPromoterEarningFromOrder(
  orderId: string,
  provider: string,
) {
  const existing = await getPromoterEarningByOrderId(orderId);
  if (existing) {
    if (!existing.earnedEmailSentAt) {
      await sendEarnedEmailForEarning(existing.id).catch((error) => {
        console.error("[PROMOTER-EARNING-EMAIL]", error);
      });
    }
    return existing;
  }

  const order = await getCheckoutOrder(orderId);
  if (!order?.promoter || !order.affiliate?.id) {
    return null;
  }

  const promoter = order.promoter;
  const earnedAt =
    order.payment.updatedAt && !Number.isNaN(Date.parse(order.payment.updatedAt))
      ? new Date(order.payment.updatedAt)
      : new Date();
  const orderTotal = formatAmount(getOrderTotal(order));
  const normalization = await normalizeAffiliateRevenueToUsd(order);
  const commissionRate = promoter.commissionRate;
  const normalizedCommissionAmount = calculatePromoterCommissionAmount({
    normalizedOrderTotal: normalization.normalizedOrderTotal,
    commissionRate,
  });
  const period = buildWeeklyPayoutPeriod(earnedAt);
  const commissionMonthKey = getCommissionMonthKey(earnedAt);

  await db.insert(promoterPayouts).values({
    orderId,
    promoterId: promoter.id,
    promoterInviteId: promoter.inviteId,
    affiliateId: promoter.affiliateId,
    affiliateCode: promoter.affiliateCode,
    orderTotal,
    commissionMonthKey,
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

  const created = await getPromoterEarningByOrderId(orderId);
  if (created) {
    await sendEarnedEmailForEarning(created.id).catch((error) => {
      console.error("[PROMOTER-EARNING-EMAIL]", error);
    });
  }

  return created;
}

export async function backfillLegacyOpenPromoterEarnings() {
  const rows = await db
    .select({
      earning: promoterPayouts,
    })
    .from(promoterPayouts)
    .where(
      and(
        inArray(promoterPayouts.status, ["pending", "approved"]),
        or(
          isNull(promoterPayouts.normalizedOrderTotal),
          isNull(promoterPayouts.normalizedCommissionAmount),
          isNull(promoterPayouts.earnedAt),
          isNull(promoterPayouts.payoutPeriodStart),
          isNull(promoterPayouts.payoutPeriodEnd),
          isNull(promoterPayouts.commissionMonthKey),
        ),
      ),
    );

  for (const row of rows) {
    const orderRecord = await getCheckoutOrder(row.earning.orderId);
    if (!orderRecord) {
      console.error(
        `[PROMOTER-EARNING-BACKFILL] Missing checkout order for ${row.earning.orderId}.`,
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
    const normalizedCommissionAmount = formatAmount(
      parseAmount(normalization.normalizedOrderTotal) *
        parseRate(row.earning.commissionRate),
    );
    const period = buildWeeklyPayoutPeriod(earnedAt);
    const commissionMonthKey =
      row.earning.commissionMonthKey || getCommissionMonthKey(earnedAt);

    await db
      .update(promoterPayouts)
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
      .where(eq(promoterPayouts.id, row.earning.id));
  }

  return rows.length;
}
