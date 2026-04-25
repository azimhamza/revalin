import { randomUUID } from "node:crypto";

import { and, eq, ne, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  affiliatePayouts,
  affiliateWeeklyPayouts,
  affiliates,
  checkoutOrders,
  promoterPayouts,
  promoterWeeklyPayouts,
} from "@/lib/db/schema";
import {
  formatAmount,
  normalizeCommissionRateInput,
  parseAmount,
} from "@/lib/checkout/affiliate-math";
import { sendAffiliateEarnedEmailForEarning } from "@/lib/checkout/affiliate-earnings-service";
import {
  getCommissionMonthKey,
  syncAffiliateCommissionMonth,
} from "@/lib/checkout/commission-service";
import { buildWeeklyPayoutPeriod } from "@/lib/checkout/payout-periods";
import { sendPromoterEarnedEmailForEarning } from "@/lib/checkout/promoter-earnings-service";
import { calculatePromoterCommissionAmount } from "@/lib/checkout/promoter-math";
import { getSuccessfulPromoterForAffiliate } from "@/lib/checkout/promoter-service";
import { generatePromoterWeeklyPayoutBatches } from "@/lib/checkout/promoter-weekly-payout-service";
import { generateWeeklyPayoutBatches } from "@/lib/checkout/weekly-payout-service";

export type CreateManualAffiliatePayoutArgs = {
  affiliateCode: string;
  orderAmount: string | number;
  commissionPercent: string | number;
  periodDate: string;
  reference?: string | null;
  notes?: string | null;
};

export type UpdateManualPayoutOrderReferenceArgs = {
  earningId: string;
  partnerType: "affiliate" | "promoter";
  reference: string;
  notes?: string | null;
};

function buildSyntheticManualOrderId(reference?: string | null) {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const normalizedReference = reference
    ?.trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

  return normalizedReference
    ? `MANUAL-${normalizedReference}-${suffix}`.slice(0, 64)
    : `MANUAL-${suffix}-${Date.now().toString(36).toUpperCase()}`.slice(0, 64);
}

async function findCheckoutOrderByReference(reference?: string | null) {
  const normalized = reference?.trim();
  if (!normalized) return null;

  const [row] = await db
    .select()
    .from(checkoutOrders)
    .where(
      or(
        eq(checkoutOrders.orderId, normalized),
        sql`${checkoutOrders.swell}->>'orderId' = ${normalized}`,
        sql`${checkoutOrders.swell}->>'orderNumber' = ${normalized}`,
        sql`${checkoutOrders.swell}->>'cartId' = ${normalized}`,
      ),
    )
    .limit(1);

  return row ?? null;
}

function buildManualNotes(args: {
  reference?: string | null;
  matchedOrderId?: string | null;
  notes?: string | null;
}) {
  const parts = ["Manual payout adjustment."];
  const reference = args.reference?.trim();
  const notes = args.notes?.trim();

  if (args.matchedOrderId) {
    parts.push(`Attached order: ${args.matchedOrderId}.`);
  }
  if (reference) {
    parts.push(`Reference: ${reference}.`);
  }
  if (notes) {
    parts.push(notes);
  }

  return parts.join(" ");
}

function buildManualCorrectionNotes(args: {
  existingNotes?: string | null;
  oldOrderId: string;
  newOrderId: string;
  reference: string;
  notes?: string | null;
}) {
  const parts = [
    args.existingNotes?.trim(),
    `Manual payout order corrected from ${args.oldOrderId} to ${args.newOrderId}.`,
    `Reference: ${args.reference.trim()}.`,
    args.notes?.trim(),
  ].filter(Boolean);

  return parts.join(" ");
}

function assertManualPayoutCanChangeOrder(args: {
  paymentProvider: string;
  status: string;
}) {
  if (args.paymentProvider !== "manual_adjustment") {
    throw new Error("Only manual payout adjustments can have their order edited.");
  }
  if (args.status === "paid" || args.status === "rejected") {
    throw new Error(`A ${args.status} payout earning cannot be edited.`);
  }
}

export async function updateManualPayoutOrderReference(
  args: UpdateManualPayoutOrderReferenceArgs,
) {
  const reference = args.reference.trim();
  if (!reference) {
    throw new Error("Order ID or reference is required.");
  }

  const matchedOrder = await findCheckoutOrderByReference(reference);
  if (!matchedOrder) {
    throw new Error(
      "No existing checkout order matched that value. Use a Revalin order ID, Swell order ID, Swell order number, or Swell cart ID that already exists.",
    );
  }

  const newOrderId = matchedOrder.orderId;
  const now = new Date();

  if (args.partnerType === "promoter") {
    const [earning] = await db
      .select()
      .from(promoterPayouts)
      .where(eq(promoterPayouts.id, args.earningId))
      .limit(1);

    if (!earning) {
      throw new Error("Promoter payout earning not found.");
    }
    assertManualPayoutCanChangeOrder(earning);

    if (earning.orderId === newOrderId) {
      return { orderId: newOrderId, orderAccessKey: matchedOrder.accessKey };
    }

    const [pairedAffiliateEarning] = await db
      .select()
      .from(affiliatePayouts)
      .where(
        and(
          eq(affiliatePayouts.orderId, earning.orderId),
          eq(affiliatePayouts.affiliateId, earning.affiliateId),
          eq(affiliatePayouts.paymentProvider, "manual_adjustment"),
        ),
      )
      .limit(1);

    if (pairedAffiliateEarning) {
      assertManualPayoutCanChangeOrder(pairedAffiliateEarning);
    }

    const [existingPromoterEarning] = await db
      .select({ id: promoterPayouts.id })
      .from(promoterPayouts)
      .where(
        and(
          eq(promoterPayouts.orderId, newOrderId),
          ne(promoterPayouts.id, earning.id),
        ),
      )
      .limit(1);

    if (existingPromoterEarning) {
      throw new Error(`A promoter payout already exists for order ${newOrderId}.`);
    }

    const [existingAffiliateEarning] = await db
      .select({ id: affiliatePayouts.id })
      .from(affiliatePayouts)
      .where(
        pairedAffiliateEarning
          ? and(
              eq(affiliatePayouts.orderId, newOrderId),
              ne(affiliatePayouts.id, pairedAffiliateEarning.id),
            )
          : eq(affiliatePayouts.orderId, newOrderId),
      )
      .limit(1);

    if (existingAffiliateEarning) {
      throw new Error(
        `A Growth Partner payout already exists for order ${newOrderId}.`,
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(promoterPayouts)
        .set({
          orderId: newOrderId,
          adminNotes: buildManualCorrectionNotes({
            existingNotes: earning.adminNotes,
            oldOrderId: earning.orderId,
            newOrderId,
            reference,
            notes: args.notes,
          }),
          updatedAt: now,
        })
        .where(eq(promoterPayouts.id, earning.id));

      if (pairedAffiliateEarning) {
        await tx
          .update(affiliatePayouts)
          .set({
            orderId: newOrderId,
            adminNotes: buildManualCorrectionNotes({
              existingNotes: pairedAffiliateEarning.adminNotes,
              oldOrderId: pairedAffiliateEarning.orderId,
              newOrderId,
              reference,
              notes: args.notes,
            }),
            updatedAt: now,
          })
          .where(eq(affiliatePayouts.id, pairedAffiliateEarning.id));
      }
    });

    return { orderId: newOrderId, orderAccessKey: matchedOrder.accessKey };
  }

  const [earning] = await db
    .select()
    .from(affiliatePayouts)
    .where(eq(affiliatePayouts.id, args.earningId))
    .limit(1);

  if (!earning) {
    throw new Error("Payout earning not found.");
  }
  assertManualPayoutCanChangeOrder(earning);

  if (earning.orderId === newOrderId) {
    return { orderId: newOrderId, orderAccessKey: matchedOrder.accessKey };
  }

  const [pairedPromoterEarning] = await db
    .select()
    .from(promoterPayouts)
    .where(
      and(
        eq(promoterPayouts.orderId, earning.orderId),
        eq(promoterPayouts.affiliateId, earning.affiliateId),
        eq(promoterPayouts.paymentProvider, "manual_adjustment"),
      ),
    )
    .limit(1);

  if (pairedPromoterEarning) {
    assertManualPayoutCanChangeOrder(pairedPromoterEarning);
  }

  const [existingAffiliateEarning] = await db
    .select({ id: affiliatePayouts.id })
    .from(affiliatePayouts)
    .where(
      and(
        eq(affiliatePayouts.orderId, newOrderId),
        ne(affiliatePayouts.id, earning.id),
      ),
    )
    .limit(1);

  if (existingAffiliateEarning) {
    throw new Error(
      `A Growth Partner payout already exists for order ${newOrderId}.`,
    );
  }

  const [existingPromoterEarning] = await db
    .select({ id: promoterPayouts.id })
    .from(promoterPayouts)
    .where(
      pairedPromoterEarning
        ? and(
            eq(promoterPayouts.orderId, newOrderId),
            ne(promoterPayouts.id, pairedPromoterEarning.id),
          )
        : eq(promoterPayouts.orderId, newOrderId),
    )
    .limit(1);

  if (existingPromoterEarning) {
    throw new Error(`A promoter payout already exists for order ${newOrderId}.`);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(affiliatePayouts)
      .set({
        orderId: newOrderId,
        adminNotes: buildManualCorrectionNotes({
          existingNotes: earning.adminNotes,
          oldOrderId: earning.orderId,
          newOrderId,
          reference,
          notes: args.notes,
        }),
        updatedAt: now,
      })
      .where(eq(affiliatePayouts.id, earning.id));

    if (pairedPromoterEarning) {
      await tx
        .update(promoterPayouts)
        .set({
          orderId: newOrderId,
          adminNotes: buildManualCorrectionNotes({
            existingNotes: pairedPromoterEarning.adminNotes,
            oldOrderId: pairedPromoterEarning.orderId,
            newOrderId,
            reference,
            notes: args.notes,
          }),
          updatedAt: now,
        })
        .where(eq(promoterPayouts.id, pairedPromoterEarning.id));
    }
  });

  return { orderId: newOrderId, orderAccessKey: matchedOrder.accessKey };
}

export async function createManualAffiliatePayout(
  args: CreateManualAffiliatePayoutArgs,
) {
  const affiliateCode = args.affiliateCode.trim();
  if (!affiliateCode) {
    throw new Error("Growth Partner code is required.");
  }

  const [affiliate] = await db
    .select()
    .from(affiliates)
    .where(sql`lower(${affiliates.code}) = ${affiliateCode.toLowerCase()}`)
    .limit(1);

  if (!affiliate) {
    throw new Error("Growth Partner not found.");
  }

  const orderAmountNumber = parseAmount(args.orderAmount);
  if (orderAmountNumber <= 0) {
    throw new Error("Order amount must be greater than 0.");
  }

  const commissionRate = normalizeCommissionRateInput(args.commissionPercent);
  const orderTotal = formatAmount(orderAmountNumber);
  const commissionAmount = formatAmount(
    orderAmountNumber * commissionRate.numeric,
  );
  const period = buildWeeklyPayoutPeriod(args.periodDate);
  const earnedAt = period.end;
  const commissionMonthKey = getCommissionMonthKey(earnedAt);
  const matchedOrder = await findCheckoutOrderByReference(args.reference);
  const orderId =
    matchedOrder?.orderId ?? buildSyntheticManualOrderId(args.reference);
  const now = new Date();
  const adminNotes = buildManualNotes({
    reference: args.reference,
    matchedOrderId: matchedOrder?.orderId,
    notes: args.notes,
  });
  const promoterAttribution = await getSuccessfulPromoterForAffiliate(
    affiliate.id,
  );
  const [existingAffiliateEarning] = await db
    .select({ id: affiliatePayouts.id })
    .from(affiliatePayouts)
    .where(eq(affiliatePayouts.orderId, orderId))
    .limit(1);

  if (existingAffiliateEarning) {
    throw new Error(
      `A Growth Partner payout already exists for order ${orderId}.`,
    );
  }

  if (promoterAttribution) {
    const [existingPromoterEarning] = await db
      .select({ id: promoterPayouts.id })
      .from(promoterPayouts)
      .where(eq(promoterPayouts.orderId, orderId))
      .limit(1);

    if (existingPromoterEarning) {
      throw new Error(`A promoter payout already exists for order ${orderId}.`);
    }
  }
  const [existingClosedBatch] = await db
    .select({
      id: affiliateWeeklyPayouts.id,
      status: affiliateWeeklyPayouts.status,
    })
    .from(affiliateWeeklyPayouts)
    .where(
      and(
        eq(affiliateWeeklyPayouts.affiliateId, affiliate.id),
        eq(affiliateWeeklyPayouts.commissionMonthKey, commissionMonthKey),
        eq(affiliateWeeklyPayouts.periodStart, period.start),
        eq(affiliateWeeklyPayouts.periodEnd, period.end),
        eq(affiliateWeeklyPayouts.batchType, "weekly"),
        sql`${affiliateWeeklyPayouts.status} in ('paid', 'rejected')`,
      ),
    )
    .limit(1);

  if (existingClosedBatch) {
    throw new Error(
      `This weekly batch is already ${existingClosedBatch.status}. Select an unpaid weekly period or add the adjustment before marking the batch paid.`,
    );
  }

  if (promoterAttribution) {
    const [existingClosedPromoterBatch] = await db
      .select({
        id: promoterWeeklyPayouts.id,
        status: promoterWeeklyPayouts.status,
      })
      .from(promoterWeeklyPayouts)
      .where(
        and(
          eq(promoterWeeklyPayouts.promoterId, promoterAttribution.id),
          eq(promoterWeeklyPayouts.commissionMonthKey, commissionMonthKey),
          eq(promoterWeeklyPayouts.periodStart, period.start),
          eq(promoterWeeklyPayouts.periodEnd, period.end),
          eq(promoterWeeklyPayouts.batchType, "weekly"),
          sql`${promoterWeeklyPayouts.status} in ('paid', 'rejected')`,
        ),
      )
      .limit(1);

    if (existingClosedPromoterBatch) {
      throw new Error(
        `The associated promoter weekly batch is already ${existingClosedPromoterBatch.status}. Select an unpaid weekly period or add the adjustment before marking the batch paid.`,
      );
    }
  }

  let affiliateEarningId: string | null = null;
  let promoterEarningId: string | null = null;

  await db.transaction(async (tx) => {
    if (!matchedOrder) {
      await tx.insert(checkoutOrders).values({
        orderId,
        accessKey: randomUUID(),
        cartId: `manual-${orderId.toLowerCase()}`,
        userId: null,
        email: affiliate.email.toLowerCase(),
        paymentStatus: "manual_adjustment",
        currencyCode: "USD",
        shippingAddress: {
          firstName: affiliate.name,
          lastName: "",
          email: affiliate.email,
          phone: "",
          address1: "Manual payout adjustment",
          city: "",
          province: "",
          postalCode: "",
          country: "US",
        },
        shippingService: null,
        lines: [
          {
            id: orderId,
            merchandiseId: "manual-payout-adjustment",
            productHandle: "manual-payout-adjustment",
            productTitle: "Manual payout adjustment",
            variantTitle: "Manual adjustment",
            imageUrl: "",
            selectedOptions: [],
            quantity: 1,
            unitPrice: { amount: orderTotal, currencyCode: "USD" },
            lineTotal: { amount: orderTotal, currencyCode: "USD" },
          },
        ],
        totals: {
          subtotalAmount: { amount: orderTotal, currencyCode: "USD" },
          totalAmount: { amount: orderTotal, currencyCode: "USD" },
          shippingThresholdAmount: { amount: "0.00", currencyCode: "USD" },
          shippingStatus: "pending_quote",
        },
        payment: {
          provider: "manual_adjustment",
          status: "manual_adjustment",
          updatedAt: now.toISOString(),
        },
        swell: {
          accountId: "",
          orderId,
          orderNumber: args.reference?.trim() || orderId,
        },
        shipengine: null,
        affiliate: {
          id: affiliate.id,
          code: affiliate.code,
          commissionRate: affiliate.commissionRate,
          commissionRateAtPurchase: commissionRate.stored,
          commissionTierAtPurchase: "Manual adjustment",
          commissionMonthKey,
          discountCode: affiliate.discountCode,
          discountPercentAtPurchase: affiliate.discountPercent,
          source: null,
        },
        promoter: promoterAttribution
          ? {
              id: promoterAttribution.id,
              inviteId: promoterAttribution.inviteId,
              affiliateId: promoterAttribution.affiliateId,
              affiliateCode: affiliate.code,
              commissionRate: promoterAttribution.commissionRate,
              source: "promoter_invite",
            }
          : null,
        ipnEvents: null,
        fulfillmentStatus: null,
        latestError: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    const [affiliateEarning] = await tx
      .insert(affiliatePayouts)
      .values({
        orderId,
        affiliateId: affiliate.id,
        affiliateCode: affiliate.code,
        orderTotal,
        commissionMonthKey,
        commissionTierKey: null,
        commissionTierLabel: "Manual adjustment",
        commissionRate: commissionRate.stored,
        commissionAmount,
        normalizedOrderTotal: orderTotal,
        normalizedCommissionAmount: commissionAmount,
        payoutCurrencyCode: "USD",
        currencyCode: "USD",
        paymentProvider: "manual_adjustment",
        earnedAt,
        payoutPeriodStart: period.start,
        payoutPeriodEnd: period.end,
        payoutPeriodTimezone: period.timezone,
        status: "pending",
        adminNotes,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: affiliatePayouts.id });
    affiliateEarningId = affiliateEarning?.id ?? null;

    if (!promoterAttribution) {
      return;
    }

    const promoterCommissionAmount = calculatePromoterCommissionAmount({
      normalizedOrderTotal: orderTotal,
      commissionRate: promoterAttribution.commissionRate,
    });
    const [promoterEarning] = await tx
      .insert(promoterPayouts)
      .values({
        orderId,
        promoterId: promoterAttribution.id,
        promoterInviteId: promoterAttribution.inviteId,
        affiliateId: affiliate.id,
        affiliateCode: affiliate.code,
        orderTotal,
        commissionMonthKey,
        commissionRate: promoterAttribution.commissionRate,
        commissionAmount: promoterCommissionAmount,
        normalizedOrderTotal: orderTotal,
        normalizedCommissionAmount: promoterCommissionAmount,
        payoutCurrencyCode: "USD",
        currencyCode: "USD",
        paymentProvider: "manual_adjustment",
        earnedAt,
        payoutPeriodStart: period.start,
        payoutPeriodEnd: period.end,
        payoutPeriodTimezone: period.timezone,
        status: "pending",
        adminNotes,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: promoterPayouts.id });
    promoterEarningId = promoterEarning?.id ?? null;
  });

  await syncAffiliateCommissionMonth({
    affiliateId: affiliate.id,
    monthKey: commissionMonthKey,
    eventType: "recalculated",
    notes: `Manual payout adjustment ${orderId}.`,
    recordEvent: true,
  });

  await generateWeeklyPayoutBatches({ periodDate: args.periodDate });
  if (promoterAttribution) {
    await generatePromoterWeeklyPayoutBatches({ periodDate: args.periodDate });
  }

  if (affiliateEarningId) {
    await sendAffiliateEarnedEmailForEarning(affiliateEarningId).catch(
      (error) => {
        console.error("[MANUAL-AFFILIATE-EARNING-EMAIL]", error);
      },
    );
  }
  if (promoterEarningId) {
    await sendPromoterEarnedEmailForEarning(promoterEarningId).catch(
      (error) => {
        console.error("[MANUAL-PROMOTER-EARNING-EMAIL]", error);
      },
    );
  }

  const [created] = await db
    .select()
    .from(affiliatePayouts)
    .where(eq(affiliatePayouts.orderId, orderId))
    .limit(1);

  return created;
}
