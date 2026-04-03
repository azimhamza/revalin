import { and, desc, eq, lt } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  affiliateCommissionEvents,
  affiliateCommissionMonths,
  affiliatePayouts,
  affiliates,
} from "@/lib/db/schema";
import { updateCheckoutOrder } from "@/lib/checkout/order-store";

const FALLBACK_BASELINE_RATE = 0.1;

export const COMMISSION_TIERS = [
  {
    key: "operator",
    label: "Operator",
    minRevenue: 0,
    maxRevenue: 9_999.99,
    rate: 0.1,
  },
  {
    key: "builder",
    label: "Builder",
    minRevenue: 10_000,
    maxRevenue: 29_999.99,
    rate: 0.15,
  },
  {
    key: "scaler",
    label: "Scaler",
    minRevenue: 30_000,
    maxRevenue: 49_999.99,
    rate: 0.2,
  },
  {
    key: "partner",
    label: "Partner",
    minRevenue: 50_000,
    maxRevenue: 74_999.99,
    rate: 0.25,
  },
  {
    key: "apex",
    label: "Apex",
    minRevenue: 75_000,
    maxRevenue: 99_999.99,
    rate: 0.3,
  },
  {
    key: "authority",
    label: "Authority",
    minRevenue: 100_000,
    maxRevenue: 499_999.99,
    rate: 0.35,
  },
  {
    key: "partner_equity",
    label: "Partner + Equity",
    minRevenue: 500_000,
    maxRevenue: null,
    rate: 0.4,
  },
] as const;

export type CommissionTierDefinition = (typeof COMMISSION_TIERS)[number];
export type CommissionMonthRecord = typeof affiliateCommissionMonths.$inferSelect;
export type CommissionEventRecord = typeof affiliateCommissionEvents.$inferSelect;
export type AffiliatePayoutRecord = typeof affiliatePayouts.$inferSelect;

export type CommissionMonthSummary = {
  affiliateId: string;
  affiliateCode: string;
  monthKey: string;
  startingRate: string;
  carriedForwardFromMonthKey: string | null;
  recognizedRevenue: string;
  recognizedOrderCount: number;
  tierKey: string;
  tierLabel: string;
  effectiveRate: string;
  overrideRate: string | null;
  overrideReason: string | null;
  hasOverride: boolean;
};

export type CommissionMonthOverview = {
  summary: CommissionMonthSummary;
  recentMonths: CommissionMonthSummary[];
  events: CommissionEventRecord[];
};

export type PayoutRecalculationImpact = {
  payoutId: string;
  orderId: string;
  status: AffiliatePayoutRecord["status"];
  oldCommissionRate: string;
  newCommissionRate: string;
  oldCommissionAmount: string;
  newCommissionAmount: string;
  oldCommissionTierKey: string | null;
  newCommissionTierKey: string;
  oldCommissionTierLabel: string | null;
  newCommissionTierLabel: string;
  changed: boolean;
};

export type PayoutApprovalPreview = {
  payoutId: string;
  affiliateId: string;
  affiliateCode: string;
  monthKey: string;
  summary: CommissionMonthSummary;
  targetImpact: PayoutRecalculationImpact | null;
  siblingImpacts: PayoutRecalculationImpact[];
  affectedCount: number;
};

function trimNumericString(value: string) {
  return value.replace(/\.?0+$/, "") || "0";
}

function formatRate(value: number) {
  return trimNumericString(value.toFixed(4));
}

function formatAmount(value: number) {
  return value.toFixed(2);
}

function parseRate(value: string | number | null | undefined) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : NaN;

  return Number.isFinite(numeric) ? numeric : FALLBACK_BASELINE_RATE;
}

function parseAmount(value: string | number | null | undefined) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : NaN;

  return Number.isFinite(numeric) ? numeric : 0;
}

export function getCommissionMonthKey(value: Date | string | number = new Date()) {
  const date =
    value instanceof Date
      ? value
      : typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : new Date();

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

export function normalizeCommissionRateInput(
  value: string | number | null | undefined,
) {
  const raw =
    typeof value === "string" ? value.trim() : value === null ? "" : `${value ?? ""}`;
  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Commission rate must be a number greater than 0.");
  }

  const normalized = parsed > 1 ? parsed / 100 : parsed;
  if (normalized > 1) {
    throw new Error("Commission rate cannot exceed 100%.");
  }

  const numeric = Number(normalized.toFixed(4));
  return {
    numeric,
    stored: formatRate(numeric),
    percentDisplay: trimNumericString((numeric * 100).toFixed(2)),
  };
}

export function resolveCommissionTier(revenue: number): CommissionTierDefinition {
  const matchedTier = COMMISSION_TIERS.find((tier) => {
    const meetsMinimum = revenue >= tier.minRevenue;
    const meetsMaximum = tier.maxRevenue === null || revenue <= tier.maxRevenue;

    return meetsMinimum && meetsMaximum;
  });

  return matchedTier ?? COMMISSION_TIERS[0];
}

function toSummary(
  affiliateId: string,
  affiliateCode: string,
  row: CommissionMonthRecord,
): CommissionMonthSummary {
  return {
    affiliateId,
    affiliateCode,
    monthKey: row.monthKey,
    startingRate: row.startingRate,
    carriedForwardFromMonthKey: row.carriedForwardFromMonthKey,
    recognizedRevenue: row.recognizedRevenue,
    recognizedOrderCount: row.recognizedOrderCount,
    tierKey: row.tierKey,
    tierLabel: row.tierLabel,
    effectiveRate: row.effectiveRate,
    overrideRate: row.overrideRate,
    overrideReason: row.overrideReason,
    hasOverride: Boolean(row.overrideRate),
  };
}

async function getAffiliateCore(affiliateId: string) {
  const [affiliate] = await db
    .select({
      id: affiliates.id,
      code: affiliates.code,
      commissionRate: affiliates.commissionRate,
    })
    .from(affiliates)
    .where(eq(affiliates.id, affiliateId))
    .limit(1);

  if (!affiliate) {
    throw new Error("Affiliate not found.");
  }

  return affiliate;
}

async function getExistingCommissionMonth(
  affiliateId: string,
  monthKey: string,
): Promise<CommissionMonthRecord | null> {
  const [row] = await db
    .select()
    .from(affiliateCommissionMonths)
    .where(
      and(
        eq(affiliateCommissionMonths.affiliateId, affiliateId),
        eq(affiliateCommissionMonths.monthKey, monthKey),
      ),
    )
    .limit(1);

  return row ?? null;
}

async function getLatestPriorCommissionMonth(
  affiliateId: string,
  monthKey: string,
): Promise<CommissionMonthRecord | null> {
  const [row] = await db
    .select()
    .from(affiliateCommissionMonths)
    .where(
      and(
        eq(affiliateCommissionMonths.affiliateId, affiliateId),
        lt(affiliateCommissionMonths.monthKey, monthKey),
      ),
    )
    .orderBy(desc(affiliateCommissionMonths.monthKey))
    .limit(1);

  return row ?? null;
}

async function getMonthPayoutRows(affiliateId: string, monthKey: string) {
  return db
    .select()
    .from(affiliatePayouts)
    .where(
      and(
        eq(affiliatePayouts.affiliateId, affiliateId),
        eq(affiliatePayouts.commissionMonthKey, monthKey),
      ),
    )
    .orderBy(desc(affiliatePayouts.createdAt));
}

function buildPayoutImpact(
  payout: AffiliatePayoutRecord,
  effectiveRate: string,
  effectiveRateNumeric: number,
  tier: CommissionTierDefinition,
): PayoutRecalculationImpact {
  const nextAmount = formatAmount(
    parseAmount(payout.orderTotal) * effectiveRateNumeric,
  );

  return {
    payoutId: payout.id,
    orderId: payout.orderId,
    status: payout.status,
    oldCommissionRate: payout.commissionRate,
    newCommissionRate: effectiveRate,
    oldCommissionAmount: payout.commissionAmount,
    newCommissionAmount: nextAmount,
    oldCommissionTierKey: payout.commissionTierKey,
    newCommissionTierKey: tier.key,
    oldCommissionTierLabel: payout.commissionTierLabel,
    newCommissionTierLabel: tier.label,
    changed:
      payout.commissionRate !== effectiveRate ||
      payout.commissionAmount !== nextAmount ||
      payout.commissionTierKey !== tier.key ||
      payout.commissionTierLabel !== tier.label,
  };
}

async function computeCommissionMonthState(affiliateId: string, monthKey: string) {
  const [affiliate, existingSummary, priorSummary, payouts] = await Promise.all([
    getAffiliateCore(affiliateId),
    getExistingCommissionMonth(affiliateId, monthKey),
    getLatestPriorCommissionMonth(affiliateId, monthKey),
    getMonthPayoutRows(affiliateId, monthKey),
  ]);

  const baselineRate = parseRate(affiliate.commissionRate);
  const startingRateNumeric = priorSummary
    ? parseRate(priorSummary.effectiveRate)
    : baselineRate;
  const carriedForwardFromMonthKey = priorSummary?.monthKey ?? null;
  const recognizedPayouts = payouts.filter((row) => row.status !== "rejected");
  const recognizedRevenueNumeric = recognizedPayouts.reduce(
    (sum, row) => sum + parseAmount(row.orderTotal),
    0,
  );
  const recognizedOrderCount = recognizedPayouts.length;
  const tier = resolveCommissionTier(recognizedRevenueNumeric);
  const overrideRateNumeric =
    existingSummary?.overrideRate === null || existingSummary?.overrideRate === undefined
      ? null
      : parseRate(existingSummary.overrideRate);
  const effectiveRateNumeric =
    overrideRateNumeric ?? Math.max(startingRateNumeric, tier.rate);
  const nextSummaryValues = {
    startingRate: formatRate(startingRateNumeric),
    carriedForwardFromMonthKey,
    recognizedRevenue: formatAmount(recognizedRevenueNumeric),
    recognizedOrderCount,
    tierKey: tier.key,
    tierLabel: tier.label,
    effectiveRate: formatRate(effectiveRateNumeric),
    overrideRate:
      overrideRateNumeric === null ? null : formatRate(overrideRateNumeric),
    overrideReason: existingSummary?.overrideReason ?? null,
  };
  const openPayouts = recognizedPayouts.filter(
    (row) => row.status !== "paid" && row.status !== "rejected",
  );
  const impacts = openPayouts.map((row) =>
    buildPayoutImpact(row, nextSummaryValues.effectiveRate, effectiveRateNumeric, tier),
  );

  return {
    affiliate,
    existingSummary,
    tier,
    nextSummaryValues,
    recognizedRevenueNumeric,
    recognizedOrderCount,
    payouts,
    impacts,
  };
}

async function writeCommissionEvent(args: {
  affiliateId: string;
  monthKey: string;
  eventType: string;
  oldRate?: string | null;
  newRate?: string | null;
  actorUserId?: string | null;
  notes?: string | null;
  batchId?: string | null;
  revenueSnapshot?: Record<string, unknown> | null;
}) {
  await db.insert(affiliateCommissionEvents).values({
    affiliateId: args.affiliateId,
    monthKey: args.monthKey,
    eventType: args.eventType,
    oldRate: args.oldRate ?? null,
    newRate: args.newRate ?? null,
    actorUserId: args.actorUserId ?? null,
    notes: args.notes ?? null,
    batchId: args.batchId ?? null,
    revenueSnapshot: args.revenueSnapshot ?? null,
  });
}

export async function syncAffiliateCommissionMonth(args: {
  affiliateId: string;
  monthKey?: string;
  actorUserId?: string | null;
  eventType?: string;
  notes?: string | null;
  batchId?: string | null;
  recordEvent?: boolean;
}) {
  const monthKey = args.monthKey ?? getCommissionMonthKey();
  const state = await computeCommissionMonthState(args.affiliateId, monthKey);

  const upsertedRows = await db
    .insert(affiliateCommissionMonths)
    .values({
      affiliateId: args.affiliateId,
      monthKey,
      startingRate: state.nextSummaryValues.startingRate,
      carriedForwardFromMonthKey: state.nextSummaryValues.carriedForwardFromMonthKey,
      recognizedRevenue: state.nextSummaryValues.recognizedRevenue,
      recognizedOrderCount: state.nextSummaryValues.recognizedOrderCount,
      tierKey: state.nextSummaryValues.tierKey,
      tierLabel: state.nextSummaryValues.tierLabel,
      effectiveRate: state.nextSummaryValues.effectiveRate,
      overrideRate: state.nextSummaryValues.overrideRate,
      overrideReason: state.nextSummaryValues.overrideReason,
      overrideByUserId:
        state.existingSummary?.overrideRate !== null &&
        state.existingSummary?.overrideRate !== undefined
          ? state.existingSummary.overrideByUserId
          : null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        affiliateCommissionMonths.affiliateId,
        affiliateCommissionMonths.monthKey,
      ],
      set: {
        startingRate: state.nextSummaryValues.startingRate,
        carriedForwardFromMonthKey:
          state.nextSummaryValues.carriedForwardFromMonthKey,
        recognizedRevenue: state.nextSummaryValues.recognizedRevenue,
        recognizedOrderCount: state.nextSummaryValues.recognizedOrderCount,
        tierKey: state.nextSummaryValues.tierKey,
        tierLabel: state.nextSummaryValues.tierLabel,
        effectiveRate: state.nextSummaryValues.effectiveRate,
        overrideRate: state.nextSummaryValues.overrideRate,
        overrideReason: state.nextSummaryValues.overrideReason,
        updatedAt: new Date(),
      },
    })
    .returning();

  const summaryRow = upsertedRows[0]!;
  const changedImpacts = state.impacts.filter((impact) => impact.changed);

  if (changedImpacts.length > 0) {
    await Promise.all(
      changedImpacts.map((impact) =>
        db
          .update(affiliatePayouts)
          .set({
            commissionRate: impact.newCommissionRate,
            commissionAmount: impact.newCommissionAmount,
            commissionTierKey: impact.newCommissionTierKey,
            commissionTierLabel: impact.newCommissionTierLabel,
            updatedAt: new Date(),
          })
          .where(eq(affiliatePayouts.id, impact.payoutId)),
      ),
    );
  }

  if (args.recordEvent && state.existingSummary?.effectiveRate !== summaryRow.effectiveRate) {
    await writeCommissionEvent({
      affiliateId: args.affiliateId,
      monthKey,
      eventType: args.eventType ?? "recalculated",
      oldRate: state.existingSummary?.effectiveRate ?? null,
      newRate: summaryRow.effectiveRate,
      actorUserId: args.actorUserId ?? null,
      notes: args.notes ?? null,
      batchId: args.batchId ?? null,
      revenueSnapshot: {
        recognizedRevenue: summaryRow.recognizedRevenue,
        recognizedOrderCount: summaryRow.recognizedOrderCount,
        tierKey: summaryRow.tierKey,
        tierLabel: summaryRow.tierLabel,
        overrideRate: summaryRow.overrideRate,
      },
    });
  }

  return {
    summary: toSummary(state.affiliate.id, state.affiliate.code, summaryRow),
    impacts: state.impacts,
  };
}

export async function getAffiliateCommissionOverview(args: {
  affiliateId: string;
  monthKey?: string;
}) {
  const monthKey = args.monthKey ?? getCommissionMonthKey();
  const affiliate = await getAffiliateCore(args.affiliateId);
  const { summary } = await syncAffiliateCommissionMonth({
    affiliateId: args.affiliateId,
    monthKey,
    recordEvent: false,
  });

  const [recentMonthRows, events] = await Promise.all([
    db
      .select()
      .from(affiliateCommissionMonths)
      .where(eq(affiliateCommissionMonths.affiliateId, args.affiliateId))
      .orderBy(desc(affiliateCommissionMonths.monthKey))
      .limit(6),
    db
      .select()
      .from(affiliateCommissionEvents)
      .where(eq(affiliateCommissionEvents.affiliateId, args.affiliateId))
      .orderBy(desc(affiliateCommissionEvents.createdAt))
      .limit(10),
  ]);

  return {
    summary,
    recentMonths: recentMonthRows.map((row) =>
      toSummary(affiliate.id, affiliate.code, row),
    ),
    events,
  } satisfies CommissionMonthOverview;
}

export async function getAffiliateCommissionSnapshot(args: {
  affiliateId: string;
  monthKey?: string;
}) {
  const overview = await getAffiliateCommissionOverview(args);
  return overview.summary;
}

export async function setAffiliateCommissionOverride(args: {
  affiliateId: string;
  monthKey: string;
  overrideRate: string | null;
  reason?: string | null;
  actorUserId?: string | null;
}) {
  const affiliate = await getAffiliateCore(args.affiliateId);
  const before = await syncAffiliateCommissionMonth({
    affiliateId: args.affiliateId,
    monthKey: args.monthKey,
    recordEvent: false,
  });
  const normalizedOverride =
    args.overrideRate === null || args.overrideRate.trim().length === 0
      ? null
      : normalizeCommissionRateInput(args.overrideRate);

  await db
    .insert(affiliateCommissionMonths)
    .values({
      affiliateId: args.affiliateId,
      monthKey: args.monthKey,
      startingRate: before.summary.startingRate,
      carriedForwardFromMonthKey: before.summary.carriedForwardFromMonthKey,
      recognizedRevenue: before.summary.recognizedRevenue,
      recognizedOrderCount: before.summary.recognizedOrderCount,
      tierKey: before.summary.tierKey,
      tierLabel: before.summary.tierLabel,
      effectiveRate: before.summary.effectiveRate,
      overrideRate: normalizedOverride?.stored ?? null,
      overrideReason: normalizedOverride ? args.reason?.trim() || null : null,
      overrideByUserId: normalizedOverride ? args.actorUserId ?? null : null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        affiliateCommissionMonths.affiliateId,
        affiliateCommissionMonths.monthKey,
      ],
      set: {
        overrideRate: normalizedOverride?.stored ?? null,
        overrideReason: normalizedOverride ? args.reason?.trim() || null : null,
        overrideByUserId: normalizedOverride ? args.actorUserId ?? null : null,
        updatedAt: new Date(),
      },
    });

  await writeCommissionEvent({
    affiliateId: args.affiliateId,
    monthKey: args.monthKey,
    eventType: normalizedOverride ? "override_set" : "override_cleared",
    oldRate: before.summary.overrideRate ?? before.summary.effectiveRate,
    newRate: normalizedOverride?.stored ?? null,
    actorUserId: args.actorUserId ?? null,
    notes: args.reason ?? null,
    revenueSnapshot: {
      affiliateCode: affiliate.code,
      recognizedRevenue: before.summary.recognizedRevenue,
      recognizedOrderCount: before.summary.recognizedOrderCount,
      tierKey: before.summary.tierKey,
      tierLabel: before.summary.tierLabel,
    },
  });

  await syncAffiliateCommissionMonth({
    affiliateId: args.affiliateId,
    monthKey: args.monthKey,
    actorUserId: args.actorUserId ?? null,
    eventType: "recalculated",
    notes: normalizedOverride
      ? `Manual override applied: ${args.reason ?? "No reason provided."}`
      : `Manual override cleared${args.reason ? `: ${args.reason}` : "."}`,
    recordEvent: true,
  });

  return getAffiliateCommissionOverview({
    affiliateId: args.affiliateId,
    monthKey: args.monthKey,
  });
}

export async function updateAffiliateBaselineCommission(args: {
  affiliateId: string;
  commissionRate: string;
  actorUserId?: string | null;
  notes?: string | null;
}) {
  const affiliate = await getAffiliateCore(args.affiliateId);
  const normalizedRate = normalizeCommissionRateInput(args.commissionRate);

  await db
    .update(affiliates)
    .set({
      commissionRate: normalizedRate.stored,
      updatedAt: new Date(),
    })
    .where(eq(affiliates.id, args.affiliateId));

  await writeCommissionEvent({
    affiliateId: args.affiliateId,
    monthKey: getCommissionMonthKey(),
    eventType: "baseline_updated",
    oldRate: affiliate.commissionRate,
    newRate: normalizedRate.stored,
    actorUserId: args.actorUserId ?? null,
    notes: args.notes ?? null,
  });

  await syncAffiliateCommissionMonth({
    affiliateId: args.affiliateId,
    monthKey: getCommissionMonthKey(),
    actorUserId: args.actorUserId ?? null,
    eventType: "recalculated",
    notes: args.notes ?? null,
    recordEvent: true,
  });

  return normalizedRate;
}

export async function getPayoutApprovalPreview(
  payoutId: string,
): Promise<PayoutApprovalPreview> {
  const [payout] = await db
    .select()
    .from(affiliatePayouts)
    .where(eq(affiliatePayouts.id, payoutId))
    .limit(1);

  if (!payout) {
    throw new Error("Payout not found.");
  }

  const monthKey = payout.commissionMonthKey || getCommissionMonthKey(payout.createdAt);
  const { summary, impacts } = await syncAffiliateCommissionMonth({
    affiliateId: payout.affiliateId,
    monthKey,
    recordEvent: false,
  });

  const targetImpact =
    impacts.find((impact) => impact.payoutId === payoutId) ?? null;
  const siblingImpacts = impacts.filter((impact) => impact.payoutId !== payoutId);

  return {
    payoutId,
    affiliateId: payout.affiliateId,
    affiliateCode: payout.affiliateCode,
    monthKey,
    summary,
    targetImpact,
    siblingImpacts,
    affectedCount: impacts.filter((impact) => impact.changed).length,
  };
}

export async function hydrateOrderAffiliateCommissionMonth(args: {
  orderId: string;
  affiliateId: string;
  monthKey: string;
  effectiveRate: string;
  tierLabel: string;
}) {
  await updateCheckoutOrder(args.orderId, (current) => ({
    ...current,
    affiliate: current.affiliate
      ? {
          ...current.affiliate,
          commissionMonthKey: args.monthKey,
          commissionRateAtPurchase: args.effectiveRate,
          commissionTierAtPurchase: args.tierLabel,
        }
      : current.affiliate,
  }));
}
